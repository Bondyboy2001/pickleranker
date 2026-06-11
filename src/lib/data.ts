import type { AppData, DbMatch, DbPlayer, Match, Player } from './types'
import { isSupabaseConfigured, supabase } from './supabase'
import { cardiffSeedData } from '../data/cardiffSeed'

export const STORAGE_KEY = 'pickleranker-data-v4'

export const EMPTY_DATA: AppData = { players: [], matches: [] }
const seededData = cardiffSeedData as unknown as AppData
const sourceWeeklySnapshots = seededData.weeklySnapshots ?? []

function normalizeName(name: string) {
  return name.trim().toLowerCase()
}

export function sortMatches(matches: Match[]) {
  return [...matches].sort((a, b) =>
    `${a.playedOn}-${a.id}`.localeCompare(`${b.playedOn}-${b.id}`),
  )
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

export function mergeWithSeedData(data: AppData): AppData {
  const seededPlayerById = new Map(seededData.players.map((player) => [player.id, player]))
  const seededPlayerByName = new Map(
    seededData.players.map((player) => [normalizeName(player.name), player]),
  )
  const players = new Map<string, Player>()

  seededData.players.forEach((player) => players.set(player.id, player))
  data.players.forEach((player) => {
    const seededPlayer =
      seededPlayerById.get(player.id) ?? seededPlayerByName.get(normalizeName(player.name))

    if (!seededPlayer) {
      players.set(player.id, player)
      return
    }

    players.set(seededPlayer.id, {
      ...player,
      id: seededPlayer.id,
      name: seededPlayer.name,
      skillLevel: seededPlayer.skillLevel,
      importedRating: seededPlayer.importedRating,
      importedRank: seededPlayer.importedRank,
      importedMovement: seededPlayer.importedMovement,
    })
  })

  const seededImportedMatchesById = new Map(
    seededData.matches
      .filter((match) => match.imported)
      .map((match) => [match.id, match]),
  )
  const matches = new Map<string, Match>()

  seededData.matches.forEach((match) => matches.set(match.id, match))
  data.matches.forEach((match) => {
    const seededMatch = seededImportedMatchesById.get(match.id)
    if (seededMatch) {
      matches.set(match.id, seededMatch)
      return
    }
    matches.set(match.id, match)
  })

  return {
    players: [...players.values()],
    matches: sortMatches([...matches.values()]),
    weeklySnapshots: sourceWeeklySnapshots,
  }
}

export function saveLocalData(data: AppData) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
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
    importedRating:
      player.imported_rating === null || player.imported_rating === undefined
        ? undefined
        : Number(player.imported_rating),
    importedRank:
      player.imported_rank === null || player.imported_rank === undefined
        ? undefined
        : Number(player.imported_rank),
    importedMovement: player.imported_movement ?? undefined,
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
    imported: Boolean(match.imported),
  }
}

export async function loadRemoteData(): Promise<AppData> {
  if (!supabase) return loadLocalData()

  const [{ data: players, error: playersError }, { data: matches, error: matchesError }] =
    await Promise.all([
      supabase.from('players').select('*').order('name'),
      supabase.from('matches').select('*').order('played_on').order('id'),
    ])

  if (playersError) throw playersError
  if (matchesError) throw matchesError

  return mergeWithSeedData({
    players: (players as DbPlayer[]).map(dbToPlayer),
    matches: (matches as DbMatch[]).map(dbToMatch),
  })
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

export function formatPlayedOnDate(playedOn: string | null | undefined) {
  if (!playedOn) return '-'
  const [year, month, day] = playedOn.split('-')
  const date = new Date(Number(year), Number(month) - 1, Number(day))
  if (Number.isNaN(date.getTime())) return playedOn
  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(date)
}

export function latestPlayedOn(matches: Match[]) {
  if (matches.length === 0) return null
  return matches.reduce(
    (latest, match) => (match.playedOn > latest ? match.playedOn : latest),
    matches[0].playedOn,
  )
}

export { isSupabaseConfigured }
