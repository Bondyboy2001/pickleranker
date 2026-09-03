import type { AppData, DbMatch, DbPlayer, Match, Player, WeeklySnapshot } from './types'
import { isSupabaseConfigured, supabase } from './supabase'

const STORAGE_KEY = 'pickleranker-data-v4'

const EMPTY_DATA: AppData = { players: [], matches: [] }

// The seed (~167KB) ships in its own chunk via dynamic import instead of the
// initial bundle. It loads once on startup; until then the app renders from
// the local cache (which already contains merged seed data after one visit).
let loadedSeed: AppData | null = null
let seedIndexes: {
  playerById: Map<string, Player>
  playerByName: Map<string, Player>
  importedMatchById: Map<string, Match>
} | null = null
let seedLoad: Promise<AppData> | null = null

function normalizeName(name: string) {
  return name.trim().toLowerCase()
}

export function ensureSeedData(): Promise<AppData> {
  if (loadedSeed) return Promise.resolve(loadedSeed)
  if (!seedLoad) {
    seedLoad = import('../data/cardiffSeed').then((module) => {
      const seed = module.cardiffSeedData as unknown as AppData
      loadedSeed = seed
      // Build the lookup indexes once here rather than on every merge (which
      // runs on load and again on every realtime change from Supabase).
      seedIndexes = {
        playerById: new Map(seed.players.map((player) => [player.id, player])),
        playerByName: new Map(seed.players.map((player) => [normalizeName(player.name), player])),
        importedMatchById: new Map(
          seed.matches.filter((match) => match.imported).map((match) => [match.id, match]),
        ),
      }
      return seed
    })
  }
  return seedLoad
}

// Re-merge already-loaded data (e.g. state set before the seed chunk arrived)
// with the seed. No-op until the seed has loaded.
export function applySeedToData(data: AppData): AppData {
  if (!loadedSeed) return data
  return mergeWithSeedData({ players: data.players, matches: data.matches })
}

export function sortMatches(matches: Match[]) {
  // Hot path: data.matches is already sorted by mergeWithSeedData, and every
  // standings replay calls this. Skip the O(n log n) sort when the input is
  // already in order — the copy preserves the "returns a new array" contract.
  // Uses the same localeCompare ordering as the sort so the fast path is exact.
  let sorted = true
  for (let i = 1; i < matches.length; i += 1) {
    const prev = matches[i - 1]
    const next = matches[i]
    if (
      prev.playedOn.localeCompare(next.playedOn) > 0 ||
      (prev.playedOn === next.playedOn && prev.id.localeCompare(next.id) > 0)
    ) {
      sorted = false
      break
    }
  }
  if (sorted) return [...matches]
  return [...matches].sort((a, b) =>
    a.playedOn.localeCompare(b.playedOn) || a.id.localeCompare(b.id),
  )
}

// Which side a player was on, or null if they didn't play in this match.
export function playerTeam(match: Match, playerId: string): 'A' | 'B' | null {
  if (match.teamA.includes(playerId)) return 'A'
  if (match.teamB.includes(playerId)) return 'B'
  return null
}

// A content fingerprint for a match: same day + week, same foursome in
// canonical order, same score, same tournament position. Used to drop duplicate
// committed matches without touching the DB.
export function matchContentKey(match: Match) {
  const teamA = [...match.teamA].sort().join(',')
  const teamB = [...match.teamB].sort().join(',')
  // Canonical winner-first ordering is enforced on save, but older rows may
  // have either side first — sort the two pairs so A-vs-B and B-vs-A with
  // swapped scores still collide only when they are truly the same game.
  const pairs = [teamA, teamB].sort().join('|')
  const position = `${match.round ?? '-'}/${match.court ?? '-'}/${match.source ?? '-'}`
  return `${match.playedOn}|${match.week}|${pairs}|${match.scoreA}-${match.scoreB}|${position}`
}

export function loadLocalData(): AppData {
  if (typeof localStorage === 'undefined') return mergeWithSeedData(EMPTY_DATA)
  const stored = localStorage.getItem(STORAGE_KEY)
  if (!stored) return mergeWithSeedData(EMPTY_DATA)

  try {
    const parsed = JSON.parse(stored) as AppData
    if (!Array.isArray(parsed.players) || !Array.isArray(parsed.matches)) {
      return mergeWithSeedData(EMPTY_DATA)
    }
    return mergeWithSeedData({
      players: parsed.players,
      matches: sortMatches(parsed.matches),
    })
  } catch {
    return mergeWithSeedData(EMPTY_DATA)
  }
}

function mergeWithSeedData(data: AppData): AppData {
  const seed = loadedSeed
  const indexes = seedIndexes
  const players = new Map<string, Player>()
  const canonicalPlayerIdByInputId = new Map<string, string>()
  const claimedSeedIds = new Set<string>()

  seed?.players.forEach((player) => players.set(player.id, player))
  data.players.forEach((player) => {
    const seededPlayer =
      indexes?.playerById.get(player.id) ?? indexes?.playerByName.get(normalizeName(player.name))

    if (!seededPlayer) {
      canonicalPlayerIdByInputId.set(player.id, player.id)
      players.set(player.id, player)
      return
    }

    // Two different input ids can normalize to the same seed name (e.g. a
    // duplicate import). Claiming the same seed id twice would put one player
    // in two seats and violate the DB distinct check — keep the second as its
    // own player instead.
    if (claimedSeedIds.has(seededPlayer.id) && canonicalPlayerIdByInputId.get(player.id) !== seededPlayer.id) {
      const existingClaim = [...canonicalPlayerIdByInputId.entries()].find(
        ([, canonical]) => canonical === seededPlayer.id,
      )
      if (existingClaim && existingClaim[0] !== player.id) {
        canonicalPlayerIdByInputId.set(player.id, player.id)
        if (!players.has(player.id)) players.set(player.id, player)
        return
      }
    }
    claimedSeedIds.add(seededPlayer.id)
    canonicalPlayerIdByInputId.set(player.id, seededPlayer.id)
    players.set(seededPlayer.id, {
      ...player,
      id: seededPlayer.id,
      name: seededPlayer.name,
      skillLevel: seededPlayer.skillLevel,
      importedRating: seededPlayer.importedRating,
    })
  })

  const matches = new Map<string, Match>()

  seed?.matches.forEach((match) => matches.set(match.id, match))
  // Drop duplicate live matches with identical content. Each tournament round
  // used to save to the leaderboard separately; a tournament also finished via
  // "Finish Tournament" then committed the same games again, leaving rows with
  // the same teams/score/date. Seed the seen-set with seed content so a live
  // row duplicating seed history is also dropped.
  const seenContent = new Set<string>()
  seed?.matches.forEach((match) => seenContent.add(matchContentKey(match)))
  data.matches.forEach((inputMatch) => {
    const match: Match = {
      ...inputMatch,
      teamA: inputMatch.teamA.map(
        (playerId) => canonicalPlayerIdByInputId.get(playerId) ?? playerId,
      ) as Match['teamA'],
      teamB: inputMatch.teamB.map(
        (playerId) => canonicalPlayerIdByInputId.get(playerId) ?? playerId,
      ) as Match['teamB'],
    }
    const seededMatch = indexes?.importedMatchById.get(match.id)
    if (seededMatch) {
      matches.set(match.id, seededMatch)
      return
    }
    // Skip rows that would violate the DB distinct-players invariant.
    if (new Set([...match.teamA, ...match.teamB]).size !== 4) return
    const key = matchContentKey(match)
    if (seenContent.has(key)) return
    seenContent.add(key)
    // Same id, different content: keep the first (seed wins above, otherwise
    // first live row wins) to avoid silent overwrites.
    if (matches.has(match.id)) return
    matches.set(match.id, match)
  })

  return {
    players: [...players.values()],
    matches: sortMatches([...matches.values()]),
    weeklySnapshots: data.weeklySnapshots?.length ? data.weeklySnapshots : (seed?.weeklySnapshots ?? []),
  }
}

export function saveLocalData(data: AppData) {
  if (typeof localStorage === 'undefined') return
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ players: data.players, matches: data.matches }))
  } catch (error) {
    // Quota exceeded (large seed + history): keep the newest 1500 matches so
    // the app still paints offline instead of throwing.
    if (error instanceof DOMException && error.name === 'QuotaExceededError') {
      try {
        const trimmed = sortMatches(data.matches).slice(-1500)
        localStorage.setItem(STORAGE_KEY, JSON.stringify({ players: data.players, matches: trimmed }))
      } catch {
        // Best effort only.
      }
    }
  }
}

export function exportDataSnapshot(data: AppData) {
  return JSON.stringify(
    { players: data.players, matches: data.matches, exportedAt: new Date().toISOString() },
    null,
    2,
  )
}

export const MAX_PLAYER_NAME_LENGTH = 64
export const MAX_SCORE = 30
export const MIN_SKILL = 0
export const MAX_SKILL = 5

export function validatePlayerInput(name: string, skillLevel: number): string | null {
  const trimmed = name.trim()
  if (!trimmed) return 'Enter a player name.'
  if (trimmed.length > MAX_PLAYER_NAME_LENGTH)
    return `Names must be ${MAX_PLAYER_NAME_LENGTH} characters or fewer.`
  if (!Number.isFinite(skillLevel) || skillLevel < MIN_SKILL || skillLevel > MAX_SKILL)
    return `Starting rating must be between ${MIN_SKILL} and ${MAX_SKILL}.`
  return null
}

export function validateScores(scoreA: number, scoreB: number): string | null {
  if (!Number.isInteger(scoreA) || !Number.isInteger(scoreB)) return 'Enter whole-number scores.'
  if (scoreA < 0 || scoreB < 0) return 'Scores cannot be negative.'
  if (scoreA === scoreB) return 'Scores must be different.'
  if (scoreA > MAX_SCORE || scoreB > MAX_SCORE)
    return `Scores look mistyped — the cap is ${MAX_SCORE}.`
  return null
}

function isValidId(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= 128
}

export function parseImportedData(raw: string): AppData | { error: string } {
  try {
    const parsed = JSON.parse(raw) as Partial<AppData>
    if (!Array.isArray(parsed.players) || !Array.isArray(parsed.matches)) {
      return { error: 'File must include players and matches arrays.' }
    }
    if (parsed.players.length > 2000 || parsed.matches.length > 20000) {
      return { error: 'Backup file is too large to import safely.' }
    }
    for (const player of parsed.players) {
      if (
        typeof player !== 'object' ||
        player === null ||
        !isValidId((player as Player).id) ||
        typeof (player as Player).name !== 'string' ||
        (player as Player).name.trim().length === 0 ||
        (player as Player).name.trim().length > MAX_PLAYER_NAME_LENGTH ||
        typeof (player as Player).skillLevel !== 'number' ||
        !Number.isFinite((player as Player).skillLevel)
      ) {
        return { error: 'Backup has an invalid player entry.' }
      }
    }
    for (const match of parsed.matches) {
      const m = match as Match
      if (
        typeof m !== 'object' ||
        m === null ||
        !isValidId(m.id) ||
        typeof m.week !== 'string' ||
        typeof m.playedOn !== 'string' ||
        !Array.isArray(m.teamA) ||
        !Array.isArray(m.teamB) ||
        m.teamA.length !== 2 ||
        m.teamB.length !== 2 ||
        ![...m.teamA, ...m.teamB].every(isValidId) ||
        new Set([...m.teamA, ...m.teamB]).size !== 4 ||
        typeof m.scoreA !== 'number' ||
        typeof m.scoreB !== 'number' ||
        validateScores(m.scoreA, m.scoreB)
      ) {
        return { error: `Backup has an invalid match (${String(m?.id ?? 'unknown')}).` }
      }
    }
    return mergeWithSeedData({
      players: parsed.players,
      matches: sortMatches(parsed.matches),
    })
  } catch {
    return { error: 'Could not read that file. Use a pickleranker JSON export.' }
  }
}

export function playerToDb(player: Player): DbPlayer {
  return {
    id: player.id,
    name: player.name,
    skill_level: player.skillLevel,
  }
}

export function dbToPlayer(player: DbPlayer): Player {
  return {
    id: player.id,
    name: player.name,
    skillLevel: Number(player.skill_level),
    ...(player.imported_rating != null
      ? { importedRating: Number(player.imported_rating) }
      : {}),
  }
}

export function matchToDb(match: Match): DbMatch {
  return {
    id: match.id,
    week: match.week,
    played_on: match.playedOn,
    team_a1: match.teamA[0],
    team_a2: match.teamA[1],
    team_b1: match.teamB[0],
    team_b2: match.teamB[1],
    score_a: match.scoreA,
    score_b: match.scoreB,
    ...(match.updatedAt ? { updated_at: match.updatedAt } : {}),
    ...(match.round != null ? { round: match.round } : {}),
    ...(match.court != null ? { court: match.court } : {}),
    ...(match.source ? { source: match.source } : {}),
  }
}

export function dbToMatch(match: DbMatch): Match {
  return {
    id: match.id,
    week: match.week,
    playedOn: match.played_on,
    teamA: [match.team_a1, match.team_a2],
    teamB: [match.team_b1, match.team_b2],
    scoreA: match.score_a,
    scoreB: match.score_b,
    ...(match.updated_at ? { updatedAt: match.updated_at } : {}),
    ...(match.round != null ? { round: match.round } : {}),
    ...(match.court != null ? { court: match.court } : {}),
    ...(match.source === 'tournament' ? { source: 'tournament' as const } : {}),
    ...(match.imported ? { imported: true as const } : {}),
  }
}

export type WeeklySnapshotRow = {
  key: string
  label: string
  played_on: string
  players: WeeklySnapshot['players']
}

export async function loadWeeklySnapshots(): Promise<WeeklySnapshot[]> {
  if (!supabase) return []
  try {
    const { data, error } = await supabase
      .from('weekly_snapshots')
      .select('key,label,played_on,players')
    if (error || !data) return []
    return (data as WeeklySnapshotRow[]).map((row) => ({
      key: row.key,
      label: row.label,
      playedOn: row.played_on,
      players: row.players ?? [],
    }))
  } catch {
    return []
  }
}

export async function loadRemoteData(): Promise<AppData> {
  // Load the seed chunk alongside the server data so the merge below sees it.
  // A seed failure must not break the remote load — the merge simply proceeds
  // without seed data and picks it up on a later refresh.
  const [seedResult] = await Promise.allSettled([ensureSeedData()])
  if (seedResult.status === 'rejected') {
    console.warn('[pickleranker] seed data failed to load', seedResult.reason)
  }
  if (!supabase) return loadLocalData()

  // Paginate past the PostgREST max_rows cap (default 1000) instead of a
  // single select(*) that would silently truncate history.
  const PAGE_SIZE = 1000
  async function fetchAll<T>(table: 'players' | 'matches'): Promise<T[]> {
    const rows: T[] = []
    let from = 0
    for (;;) {
      const query =
        table === 'players'
          ? supabase!
              .from('players')
              .select('id,name,skill_level,imported_rating')
              .order('name')
              .range(from, from + PAGE_SIZE - 1)
          : supabase!
              .from('matches')
              .select('id,week,played_on,team_a1,team_a2,team_b1,team_b2,score_a,score_b,updated_at,round,court,source,imported')
              .order('played_on')
              .order('id')
              .range(from, from + PAGE_SIZE - 1)
      const { data, error } = await query
      if (error) {
        // Older DBs lack round/court/source/updated_at — retry with the
        // original minimal columns rather than failing the whole load.
        if (table === 'matches' && /column|schema cache/i.test(error.message)) {
          const fallback = await supabase!
            .from('matches')
            .select('id,week,played_on,team_a1,team_a2,team_b1,team_b2,score_a,score_b,imported')
            .order('played_on')
            .order('id')
            .range(from, from + PAGE_SIZE - 1)
          if (fallback.error) throw fallback.error
          const batch = (fallback.data ?? []) as T[]
          rows.push(...batch)
          if (batch.length < PAGE_SIZE) break
          from += PAGE_SIZE
          continue
        }
        throw error
      }
      const batch = (data ?? []) as T[]
      rows.push(...batch)
      if (batch.length < PAGE_SIZE) break
      from += PAGE_SIZE
      if (from > 50000) break // safety stop
    }
    return rows
  }

  const [players, matches, snapshots] = await Promise.all([
    fetchAll<DbPlayer>('players'),
    fetchAll<DbMatch>('matches'),
    loadWeeklySnapshots(),
  ])

  const merged = mergeWithSeedData({
    players: players.map(dbToPlayer),
    matches: matches.map(dbToMatch),
    ...(snapshots.length ? { weeklySnapshots: snapshots } : {}),
  })
  // Cache the latest server data so the next visit paints instantly and we can
  // fall back to real data (not just seed) when the server is slow/unreachable.
  saveLocalData(merged)
  return merged
}

export async function checkIsAdmin(): Promise<boolean> {
  if (!supabase) return true
  const { data, error } = await supabase.rpc('is_admin')
  if (error) return false
  return Boolean(data)
}

export function makeId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`
}

export function formatResultsLabel(playedOn: string) {
  const [year, month, day] = playedOn.split('-')
  if (!year || !month || !day) return 'Unlabelled week'
  return `Results ${day}-${month}-${year}`
}

const PLAYED_ON_FORMATTER = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
})

export function formatPlayedOnDate(playedOn: string | null | undefined) {
  if (!playedOn) return '-'
  const [year, month, day] = playedOn.split('-')
  const date = new Date(Number(year), Number(month) - 1, Number(day))
  if (Number.isNaN(date.getTime())) return playedOn
  return PLAYED_ON_FORMATTER.format(date)
}

export function latestPlayedOn(matches: Match[]) {
  if (matches.length === 0) return null
  return matches.reduce(
    (latest, match) => (match.playedOn > latest ? match.playedOn : latest),
    matches[0].playedOn,
  )
}

export { isSupabaseConfigured }
