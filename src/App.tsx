import { Fragment, useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import {
  ArrowUpDown,
  CalendarDays,
  LogIn,
  LogOut,
  LineChart,
  Moon,
  Plus,
  Save,
  Search,
  SlidersHorizontal,
  Sun,
  Trophy,
} from 'lucide-react'
import './App.css'
import { cardiffSeedData } from './data/cardiffSeed'
import {
  calculateMatch,
  formatRating,
  probabilityForTeam,
  roundRating,
  type MatchSummary,
} from './lib/scoring'
import { isSupabaseConfigured, supabase } from './lib/supabase'
import type { Session } from '@supabase/supabase-js'

type Player = {
  id: string
  name: string
  skillLevel: number
  importedRating?: number
  importedRank?: number
  importedMovement?: string
}

type Match = {
  id: string
  week: string
  playedOn: string
  teamA: [string, string]
  teamB: [string, string]
  scoreA: number
  scoreB: number
  imported?: boolean
}

type PlayerStanding = Player & {
  rating: number
  wins: number
  losses: number
  games: number
  pointsFor: number
  pointsAgainst: number
}

type PlayerWeekPoint = {
  key: string
  label: string
  playedOn: string
  change: number
  cumulative: number
  games: number
  wins: number
  losses: number
  pointsFor: number
  pointsAgainst: number
}

type WeeklyStanding = {
  playerId: string
  name: string
  change: number
  wins: number
  losses: number
  games: number
  pointsFor: number
  pointsAgainst: number
}

type WeeklyGamePlayer = {
  id: string
  name: string
  start: number
  change: number
  finish: number
}

type WeeklyPlayerGame = {
  id: string
  gameNumber: number
  week: string
  playedOn: string
  selectedPlayerId: string
  selectedTeam: 'A' | 'B'
  winner: 'A' | 'B'
  scoreA: number
  scoreB: number
  teamAStart: number
  teamBStart: number
  teamAWinProbability: number
  teamADelta: number
  teamBDelta: number
  baseDelta: number
  teamA: WeeklyGamePlayer[]
  teamB: WeeklyGamePlayer[]
  result: 'Win' | 'Loss'
  ratingChange: number
}

type WeeklySnapshot = {
  key: string
  label: string
  playedOn: string
  players: {
    playerId: string
    name: string
    rank: number
    rating: number
    movement: string
  }[]
}

type AppData = {
  players: Player[]
  matches: Match[]
  weeklySnapshots?: WeeklySnapshot[]
}

type DbPlayer = {
  id: string
  name: string
  skill_level: number
  imported_rating: number | null
  imported_rank: number | null
  imported_movement: string | null
}

type DbMatch = {
  id: string
  week: string
  played_on: string
  team_a1: string
  team_a2: string
  team_b1: string
  team_b2: string
  score_a: number
  score_b: number
  imported: boolean
}

type SortKey = 'rank' | 'player' | 'rating' | 'record' | 'games' | 'wins' | 'losses'
type SortDirection = 'asc' | 'desc'

const STORAGE_KEY = 'pickleranker-cardiff-data-v3'
const THEME_STORAGE_KEY = 'pickleranker-theme'
const DEFAULT_RATING = 3
const LEADERBOARD_COLUMN_COUNT = 7
const ADMIN_USERNAME = 'ben'
const ADMIN_AUTH_EMAIL = 'ben@pickleranker.local'

const seededData = cardiffSeedData as unknown as AppData
const sourceWeeklySnapshots = seededData.weeklySnapshots ?? []

function normalizeName(name: string) {
  return name.trim().toLowerCase()
}

function sortMatches(matches: Match[]) {
  return [...matches].sort((a, b) =>
    `${a.playedOn}-${a.id}`.localeCompare(`${b.playedOn}-${b.id}`),
  )
}

function mergeWithSeedData(data: AppData): AppData {
  const seededPlayerById = new Map(
    seededData.players.map((player) => [player.id, player]),
  )
  const seededPlayerByName = new Map(
    seededData.players.map((player) => [normalizeName(player.name), player]),
  )
  const players = new Map<string, Player>()

  seededData.players.forEach((player) => players.set(player.id, player))
  data.players.forEach((player) => {
    const seededPlayer =
      seededPlayerById.get(player.id) ??
      seededPlayerByName.get(normalizeName(player.name))

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
    if (match.imported) {
      const seededMatch = seededImportedMatchesById.get(match.id)
      if (seededMatch) matches.set(match.id, seededMatch)
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

function buildSnapshotRatingChanges(snapshots: WeeklySnapshot[]) {
  const changesByWeek = new Map<string, Map<string, number | null>>()
  const previousRatingByPlayer = new Map<string, number>()

  const chronologicalSnapshots = [...snapshots].sort((a, b) =>
    a.playedOn.localeCompare(b.playedOn),
  )

  chronologicalSnapshots.forEach((snapshot) => {
    const weekChanges = new Map<string, number | null>()

    snapshot.players.forEach((player) => {
      const previousRating = previousRatingByPlayer.get(player.playerId)
      weekChanges.set(
        player.playerId,
        previousRating === undefined
          ? null
          : roundRating(player.rating - previousRating),
      )
    })
    snapshot.players.forEach((player) => {
      previousRatingByPlayer.set(player.playerId, player.rating)
    })
    changesByWeek.set(snapshot.key, weekChanges)
  })

  return changesByWeek
}

function formatRatingChange(change: number | null | undefined) {
  if (change === null || change === undefined) return '-'
  return `${change >= 0 ? '+' : ''}${change.toFixed(3)}`
}

function formatWinRate(wins: number, games: number) {
  if (games === 0) return '0.0%'
  return `${((wins / games) * 100).toFixed(1)}%`
}

function formatSnapshotDate(label: string | undefined) {
  if (!label) return '-'
  const [day, month, year] = label.split('-')
  const date = new Date(Number(year), Number(month) - 1, Number(day))
  if (Number.isNaN(date.getTime())) return label
  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(date)
}

function movementClass(value: string | number | null | undefined) {
  if (typeof value === 'number') {
    return value >= 0 ? 'movement positive' : 'movement negative'
  }
  if (value?.startsWith('+')) return 'movement positive'
  if (value?.startsWith('-')) return 'movement negative'
  return 'movement'
}

function formatPositionMovement(previousRank: number | undefined, currentRank: number) {
  if (previousRank === undefined) return '-'
  const movement = previousRank - currentRank
  return movement > 0 ? `+${movement}` : String(movement)
}

function formatResultsLabel(playedOn: string) {
  const [year, month, day] = playedOn.split('-')
  if (!year || !month || !day) return 'Unlabelled week'
  return `Results ${day}-${month}-${year}`
}

const emptyMatch = {
  playedOn: new Date().toISOString().slice(0, 10),
  teamA1: '',
  teamA2: '',
  teamB1: '',
  teamB2: '',
  scoreA: '11',
  scoreB: '0',
}

function makeId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`
}

function getInitialRating(player: Player) {
  return player.importedRating ?? player.skillLevel ?? DEFAULT_RATING
}

function buildStandings(data: AppData) {
  const ratings = new Map<string, number>()
  const standings = new Map<string, PlayerStanding>()

  data.players.forEach((player) => {
    const initialRating = getInitialRating(player)
    ratings.set(player.id, initialRating)
    standings.set(player.id, {
      ...player,
      rating: initialRating,
      wins: 0,
      losses: 0,
      games: 0,
      pointsFor: 0,
      pointsAgainst: 0,
    })
  })

  const sortedMatches = sortMatches(data.matches)
  const summaries: MatchSummary[] = []

  sortedMatches.forEach((match) => {
    const summary = calculateMatch(match, ratings)
    summaries.push(summary)

    if (!match.imported) {
      const teamADelta = summary.teamADelta
      const teamBDelta = summary.teamBDelta
      match.teamA.forEach((playerId) => {
        ratings.set(
          playerId,
          roundRating((ratings.get(playerId) ?? DEFAULT_RATING) + teamADelta),
        )
      })
      match.teamB.forEach((playerId) => {
        ratings.set(
          playerId,
          roundRating((ratings.get(playerId) ?? DEFAULT_RATING) + teamBDelta),
        )
      })
    }

    match.teamA.forEach((playerId) => {
      const standing = standings.get(playerId)
      if (!standing) return
      standing.games += 1
      standing.pointsFor += match.scoreA
      standing.pointsAgainst += match.scoreB
      standing.wins += summary.winner === 'A' ? 1 : 0
      standing.losses += summary.winner === 'B' ? 1 : 0
    })
    match.teamB.forEach((playerId) => {
      const standing = standings.get(playerId)
      if (!standing) return
      standing.games += 1
      standing.pointsFor += match.scoreB
      standing.pointsAgainst += match.scoreA
      standing.wins += summary.winner === 'B' ? 1 : 0
      standing.losses += summary.winner === 'A' ? 1 : 0
    })
  })

  standings.forEach((standing, playerId) => {
    standing.rating = ratings.get(playerId) ?? standing.skillLevel
  })

  return {
    standings: [...standings.values()].sort((a, b) => b.rating - a.rating),
    summaries: summaries.reverse(),
  }
}

function buildPlayerWeekPoints(
  playerId: string,
  summaries: MatchSummary[],
  snapshots: WeeklySnapshot[],
) {
  const weeks = new Map<string, PlayerWeekPoint>()
  const chronological = [...summaries].reverse()

  chronological.forEach((match) => {
    const team = match.teamA.includes(playerId)
      ? 'A'
      : match.teamB.includes(playerId)
        ? 'B'
        : null
    if (!team) return

    const key = match.playedOn
    const existing = weeks.get(key) ?? {
      key,
      label: match.week.replace(/^Results\s+/, ''),
      playedOn: match.playedOn,
      change: 0,
      cumulative: 0,
      games: 0,
      wins: 0,
      losses: 0,
      pointsFor: 0,
      pointsAgainst: 0,
    }

    const won = match.winner === team
    const change = team === 'A' ? match.teamADelta : match.teamBDelta
    existing.change = roundRating(existing.change + change)
    existing.games += 1
    existing.wins += won ? 1 : 0
    existing.losses += won ? 0 : 1
    existing.pointsFor += team === 'A' ? match.scoreA : match.scoreB
    existing.pointsAgainst += team === 'A' ? match.scoreB : match.scoreA
    weeks.set(key, existing)
  })

  const snapshotWeeks = snapshots
    .map((snapshot) => {
      const snapshotPlayer = snapshot.players.find((player) => player.playerId === playerId)
      const existing = weeks.get(snapshot.key)
      if (!snapshotPlayer) return null

      return {
        key: snapshot.key,
        label: snapshot.label,
        playedOn: snapshot.playedOn,
        change: 0,
        cumulative: roundRating(snapshotPlayer.rating - DEFAULT_RATING),
        games: existing?.games ?? 0,
        wins: existing?.wins ?? 0,
        losses: existing?.losses ?? 0,
        pointsFor: existing?.pointsFor ?? 0,
        pointsAgainst: existing?.pointsAgainst ?? 0,
      }
    })
    .filter((week): week is PlayerWeekPoint => Boolean(week))
    .sort((a, b) => a.playedOn.localeCompare(b.playedOn))

  if (snapshotWeeks.length > 0) {
    let previousRating = DEFAULT_RATING
    return snapshotWeeks.map((week) => {
      const rating = roundRating(DEFAULT_RATING + week.cumulative)
      const change = roundRating(rating - previousRating)
      previousRating = rating
      return { ...week, change }
    })
  }

  let cumulative = 0
  return [...weeks.values()]
    .sort((a, b) => a.playedOn.localeCompare(b.playedOn))
    .map((week) => {
      cumulative = roundRating(cumulative + week.change)
      return { ...week, cumulative }
    })
}

function buildWeekOptions(summaries: MatchSummary[], snapshots: WeeklySnapshot[]) {
  const weeks = new Map<string, { key: string; label: string; playedOn: string }>()
  snapshots.forEach((snapshot) => {
    weeks.set(snapshot.key, {
      key: snapshot.key,
      label: snapshot.label,
      playedOn: snapshot.playedOn,
    })
  })
  summaries.forEach((match) => {
    const key = match.playedOn
    if (!weeks.has(key)) {
      weeks.set(key, {
        key,
        label: match.week.replace(/^Results\s+/, ''),
        playedOn: match.playedOn,
      })
    }
  })
  return [...weeks.values()].sort((a, b) => b.playedOn.localeCompare(a.playedOn))
}

function buildWeeklyStandings(
  selectedWeek: string,
  summaries: MatchSummary[],
  players: Player[],
) {
  const playerNames = new Map(players.map((player) => [player.id, player.name]))
  const standings = new Map<string, WeeklyStanding>()

  players.forEach((player) => {
    standings.set(player.id, {
      playerId: player.id,
      name: player.name,
      change: 0,
      wins: 0,
      losses: 0,
      games: 0,
      pointsFor: 0,
      pointsAgainst: 0,
    })
  })

  summaries
    .filter((match) => match.playedOn === selectedWeek)
    .forEach((match) => {
      const applyTeam = (
        playerId: string,
        team: 'A' | 'B',
        change: number,
        pointsFor: number,
        pointsAgainst: number,
      ) => {
        const won = match.winner === team
        const standing = standings.get(playerId) ?? {
          playerId,
          name: playerNames.get(playerId) ?? 'Unknown',
          change: 0,
          wins: 0,
          losses: 0,
          games: 0,
          pointsFor: 0,
          pointsAgainst: 0,
        }
        standing.change = roundRating(standing.change + change)
        standing.wins += won ? 1 : 0
        standing.losses += won ? 0 : 1
        standing.games += 1
        standing.pointsFor += pointsFor
        standing.pointsAgainst += pointsAgainst
        standings.set(playerId, standing)
      }

      match.teamA.forEach((playerId) =>
        applyTeam(playerId, 'A', match.teamADelta, match.scoreA, match.scoreB),
      )
      match.teamB.forEach((playerId) =>
        applyTeam(playerId, 'B', match.teamBDelta, match.scoreB, match.scoreA),
      )
    })

  return [...standings.values()].sort(
    (a, b) =>
      b.change - a.change ||
      b.wins - a.wins ||
      b.games - a.games ||
      b.pointsFor - b.pointsAgainst - (a.pointsFor - a.pointsAgainst) ||
      a.name.localeCompare(b.name),
  )
}

function buildFullWeeklySnapshotRows(
  snapshot: WeeklySnapshot,
  standings: PlayerStanding[],
  snapshots: WeeklySnapshot[],
) {
  const fallbackRatings = new Map(
    standings.map((player) => [player.id, getInitialRating(player)]),
  )
  const names = new Map(standings.map((player) => [player.id, player.name]))
  const snapshotRowsByPlayer = new Map(
    snapshot.players.map((player) => [player.playerId, player]),
  )
  const previousRatings = new Map(fallbackRatings)
  const currentRatings = new Map(fallbackRatings)
  const chronologicalSnapshots = [...snapshots].sort((a, b) =>
    a.playedOn.localeCompare(b.playedOn),
  )

  chronologicalSnapshots
    .filter((weeklySnapshot) => weeklySnapshot.playedOn < snapshot.playedOn)
    .forEach((weeklySnapshot) => {
      weeklySnapshot.players.forEach((player) => {
        previousRatings.set(player.playerId, player.rating)
        currentRatings.set(player.playerId, player.rating)
      })
    })

  snapshot.players.forEach((player) => {
    currentRatings.set(player.playerId, player.rating)
  })

  const previousRankByPlayer = new Map(
    standings
      .map((player) => ({
        playerId: player.id,
        rating: previousRatings.get(player.id) ?? getInitialRating(player),
        name: player.name,
      }))
      .sort((a, b) => b.rating - a.rating || a.name.localeCompare(b.name))
      .map((player, index) => [player.playerId, index + 1]),
  )

  return standings
    .map((player) => {
      const snapshotRow = snapshotRowsByPlayer.get(player.id)
      const rating = currentRatings.get(player.id) ?? getInitialRating(player)
      return {
        playerId: player.id,
        name: snapshotRow?.name ?? names.get(player.id) ?? 'Unknown',
        rank: 0,
        rating,
        movement: '-',
      }
    })
    .sort((a, b) => b.rating - a.rating || a.name.localeCompare(b.name))
    .map((player, index) => {
      const rank = index + 1
      return {
        ...player,
        rank,
        movement: formatPositionMovement(
          previousRankByPlayer.get(player.playerId),
          rank,
        ),
      }
    })
}

function buildWeekStartRatings(
  selectedWeek: string,
  players: Player[],
  matches: Match[],
  snapshots: WeeklySnapshot[],
) {
  const ratings = new Map(
    players.map((player) => [player.id, player.skillLevel ?? DEFAULT_RATING]),
  )
  const previousSnapshotDates = snapshots
    .filter((snapshot) => snapshot.playedOn < selectedWeek)
    .sort((a, b) => a.playedOn.localeCompare(b.playedOn))

  previousSnapshotDates.forEach((snapshot) => {
    snapshot.players.forEach((player) => {
      ratings.set(player.playerId, player.rating)
    })
  })

  const latestSnapshotDate = previousSnapshotDates.at(-1)?.playedOn
  if (latestSnapshotDate) {
    sortMatches(matches)
      .filter(
        (match) =>
          !match.imported &&
          match.playedOn > latestSnapshotDate &&
          match.playedOn < selectedWeek,
      )
      .forEach((match) => {
        const summary = calculateMatch(match, ratings)
        match.teamA.forEach((matchPlayerId) => {
          ratings.set(
            matchPlayerId,
            roundRating(
              (ratings.get(matchPlayerId) ?? DEFAULT_RATING) + summary.teamADelta,
            ),
          )
        })
        match.teamB.forEach((matchPlayerId) => {
          ratings.set(
            matchPlayerId,
            roundRating(
              (ratings.get(matchPlayerId) ?? DEFAULT_RATING) + summary.teamBDelta,
            ),
          )
        })
      })
  }

  return ratings
}

function buildWeeklyPlayerGames(
  playerId: string,
  selectedWeek: string,
  matches: Match[],
  players: Player[],
  snapshots: WeeklySnapshot[],
) {
  const playerNames = new Map(players.map((player) => [player.id, player.name]))
  const ratings = buildWeekStartRatings(selectedWeek, players, matches, snapshots)
  const games: WeeklyPlayerGame[] = []

  sortMatches(matches)
    .filter((match) => match.playedOn === selectedWeek)
    .forEach((match, index) => {
      const summary = calculateMatch(match, ratings)
      const teamAWinProbability = probabilityForTeam(
        summary.teamAStart,
        summary.teamBStart,
      )
      const makePlayer = (matchPlayerId: string, change: number) => {
        const start = ratings.get(matchPlayerId) ?? DEFAULT_RATING
        return {
          id: matchPlayerId,
          name: playerNames.get(matchPlayerId) ?? 'Unknown',
          start,
          change,
          finish: roundRating(start + change),
        }
      }
      const teamA = match.teamA.map((matchPlayerId) =>
        makePlayer(matchPlayerId, summary.teamADelta),
      )
      const teamB = match.teamB.map((matchPlayerId) =>
        makePlayer(matchPlayerId, summary.teamBDelta),
      )

      if (match.teamA.includes(playerId) || match.teamB.includes(playerId)) {
        const selectedTeam = match.teamA.includes(playerId) ? 'A' : 'B'
        const ratingChange =
          selectedTeam === 'A' ? summary.teamADelta : summary.teamBDelta

        games.push({
          id: match.id,
          gameNumber: index + 1,
          week: match.week,
          playedOn: match.playedOn,
          selectedPlayerId: playerId,
          selectedTeam,
          winner: summary.winner,
          scoreA: match.scoreA,
          scoreB: match.scoreB,
          teamAStart: summary.teamAStart,
          teamBStart: summary.teamBStart,
          teamAWinProbability,
          teamADelta: summary.teamADelta,
          teamBDelta: summary.teamBDelta,
          baseDelta: summary.baseDelta,
          teamA,
          teamB,
          result: summary.winner === selectedTeam ? 'Win' : 'Loss',
          ratingChange,
        })
      }

      match.teamA.forEach((matchPlayerId) => {
        ratings.set(
          matchPlayerId,
          roundRating(
            (ratings.get(matchPlayerId) ?? DEFAULT_RATING) + summary.teamADelta,
          ),
        )
      })
      match.teamB.forEach((matchPlayerId) => {
        ratings.set(
          matchPlayerId,
          roundRating(
            (ratings.get(matchPlayerId) ?? DEFAULT_RATING) + summary.teamBDelta,
          ),
        )
      })
    })

  return games
}

function loadData(): AppData {
  const stored = localStorage.getItem(STORAGE_KEY)
  if (!stored) return seededData

  try {
    const parsed = JSON.parse(stored) as AppData
    if (!Array.isArray(parsed.players) || !Array.isArray(parsed.matches)) {
      return seededData
    }
    return mergeWithSeedData(parsed)
  } catch {
    return seededData
  }
}

function playerToDb(player: Player) {
  return {
    id: player.id,
    name: player.name,
    skill_level: player.skillLevel,
    imported_rating: player.importedRating ?? null,
    imported_rank: player.importedRank ?? null,
    imported_movement: player.importedMovement ?? null,
  }
}

function dbToPlayer(player: DbPlayer): Player {
  return {
    id: player.id,
    name: player.name,
    skillLevel: Number(player.skill_level),
    importedRating: player.imported_rating ?? undefined,
    importedRank: player.imported_rank ?? undefined,
    importedMovement: player.imported_movement ?? undefined,
  }
}

function matchToDb(match: Match) {
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
    imported: Boolean(match.imported),
  }
}

function dbToMatch(match: DbMatch): Match {
  return {
    id: match.id,
    week: match.week,
    playedOn: match.played_on,
    teamA: [match.team_a1, match.team_a2],
    teamB: [match.team_b1, match.team_b2],
    scoreA: match.score_a,
    scoreB: match.score_b,
    imported: match.imported,
  }
}

async function loadRemoteData(): Promise<AppData> {
  if (!supabase) return loadData()
  const [{ data: players, error: playersError }, { data: matches, error: matchesError }] =
    await Promise.all([
      supabase.from('players').select('*').order('name'),
      supabase.from('matches').select('*').order('played_on').order('id'),
    ])

  if (playersError) throw playersError
  if (matchesError) throw matchesError

  return {
    players: (players as DbPlayer[]).map(dbToPlayer),
    matches: (matches as DbMatch[]).map(dbToMatch),
  }
}

function App() {
  const [data, setData] = useState<AppData>(() => loadData())
  const [route, setRoute] = useState(() => window.location.hash || '#/')
  const [theme, setTheme] = useState<'light' | 'dark'>(() =>
    localStorage.getItem(THEME_STORAGE_KEY) === 'dark' ? 'dark' : 'light',
  )
  const [session, setSession] = useState<Session | null>(null)
  const [authForm, setAuthForm] = useState({ email: '', password: '' })
  const [authError, setAuthError] = useState('')
  const [, setNotice] = useState('')
  const [activePublicTab, setActivePublicTab] = useState<'overall' | 'weekly'>(
    'overall',
  )
  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(null)
  const [selectedWeeklyPlayerId, setSelectedWeeklyPlayerId] = useState<string | null>(
    null,
  )
  const [sort, setSort] = useState<{ key: SortKey; direction: SortDirection }>({
    key: 'rank',
    direction: 'asc',
  })
  const [matchForm, setMatchForm] = useState(emptyMatch)
  const [matchError, setMatchError] = useState('')
  const [playerForm, setPlayerForm] = useState({ name: '', skillLevel: '3.0' })
  const [search, setSearch] = useState('')
  const [selectedWeek, setSelectedWeek] = useState('')
  const canEdit = !isSupabaseConfigured || Boolean(session)

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    localStorage.setItem(THEME_STORAGE_KEY, theme)
  }, [theme])

  useEffect(() => {
    const onHashChange = () => setRoute(window.location.hash || '#/')
    window.addEventListener('hashchange', onHashChange)
    return () => window.removeEventListener('hashchange', onHashChange)
  }, [])

  useEffect(() => {
    if (!supabase) return

    supabase.auth.getSession().then(({ data: authData }) => {
      setSession(authData.session)
    })

    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession)
    })

    loadRemoteData()
      .then((remoteData) => {
        if (remoteData.players.length > 0) {
          setData(mergeWithSeedData(remoteData))
          setNotice('Loaded shared online leaderboard.')
        } else {
          setNotice('Supabase is connected but has no data yet. Run the seed SQL.')
        }
      })
      .catch((error: Error) => {
        setNotice(`Could not load Supabase data: ${error.message}`)
      })

    return () => listener.subscription.unsubscribe()
  }, [])

  const { standings, summaries } = useMemo(() => buildStandings(data), [data])
  const weekOptions = useMemo(
    () => buildWeekOptions(summaries, sourceWeeklySnapshots),
    [summaries],
  )
  const activeWeek = selectedWeek || weekOptions[0]?.key || ''
  const activeWeeklySnapshot = useMemo(
    () => sourceWeeklySnapshots.find((snapshot) => snapshot.key === activeWeek),
    [activeWeek],
  )
  const activeWeeklySnapshotPlayerIds = useMemo(
    () =>
      new Set(
        activeWeeklySnapshot?.players.map((player) => player.playerId) ?? [],
      ),
    [activeWeeklySnapshot],
  )
  const snapshotRatingChanges = useMemo(
    () => buildSnapshotRatingChanges(sourceWeeklySnapshots),
    [],
  )
  const activeSnapshotRatingChanges = useMemo(
    () => snapshotRatingChanges.get(activeWeek) ?? new Map<string, number | null>(),
    [activeWeek, snapshotRatingChanges],
  )
  const averageRating = useMemo(() => {
    if (standings.length === 0) return 0
    return standings.reduce((total, player) => total + player.rating, 0) / standings.length
  }, [standings])
  const weeklyStandings = useMemo(
    () => buildWeeklyStandings(activeWeek, summaries, data.players),
    [activeWeek, summaries, data.players],
  )
  const fullWeeklySnapshotRows = useMemo(
    () =>
      activeWeeklySnapshot
        ? buildFullWeeklySnapshotRows(
            activeWeeklySnapshot,
            standings,
            sourceWeeklySnapshots,
          )
        : [],
    [activeWeeklySnapshot, standings],
  )
  const rankByPlayerId = useMemo(
    () => new Map(standings.map((player, index) => [player.id, index + 1])),
    [standings],
  )
  const sortedStandings = useMemo(
    () => sortStandings(standings, sort.key, sort.direction),
    [sort, standings],
  )
  const filteredStandings = useMemo(() => {
    const query = search.trim().toLowerCase()
    if (!query) return sortedStandings
    return sortedStandings.filter((player) =>
      player.name.toLowerCase().includes(query),
    )
  }, [search, sortedStandings])
  const weeklyPlayerGames = useMemo(
    () =>
      selectedWeeklyPlayerId
        ? buildWeeklyPlayerGames(
            selectedWeeklyPlayerId,
            activeWeek,
            data.matches,
            data.players,
            sourceWeeklySnapshots,
          )
        : [],
    [activeWeek, data.matches, data.players, selectedWeeklyPlayerId],
  )
  const selectedWeeklySnapshotPlayer = fullWeeklySnapshotRows.find(
    (player) => player.playerId === selectedWeeklyPlayerId,
  )
  const selectedWeeklySnapshotRatingChange =
    selectedWeeklyPlayerId && activeWeeklySnapshot
      ? activeWeeklySnapshotPlayerIds.has(selectedWeeklyPlayerId)
        ? activeSnapshotRatingChanges.get(selectedWeeklyPlayerId)
        : 0
      : undefined
  const selectedWeeklyComputedPlayer = weeklyStandings.find(
    (player) => player.playerId === selectedWeeklyPlayerId,
  )
  const selectedWeeklyPlayerName =
    selectedWeeklySnapshotPlayer?.name ??
    selectedWeeklyComputedPlayer?.name ??
    standings.find((player) => player.id === selectedWeeklyPlayerId)?.name ??
    ''

  function persist(nextData: AppData, message: string) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(nextData))
    setData(nextData)
    setNotice(message)
  }

  function requireAdmin() {
    if (canEdit) return true
    setNotice('Admin login required to update games.')
    return false
  }

  async function signIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!supabase) return
    setAuthError('')
    const login = authForm.email.trim()
    const email =
      login.toLowerCase() === ADMIN_USERNAME ? ADMIN_AUTH_EMAIL : login
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password: authForm.password,
    })
    if (error) {
      setAuthError(error.message)
      return
    }
    setAuthForm({ email: '', password: '' })
    setNotice('Admin signed in.')
  }

  async function signOut() {
    if (!supabase) return
    await supabase.auth.signOut()
    setNotice('Admin signed out.')
  }

  async function addPlayer(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!requireAdmin()) return
    const name = playerForm.name.trim()
    const skillLevel = Number(playerForm.skillLevel)
    if (!name || Number.isNaN(skillLevel)) return

    const player = { id: makeId('p'), name, skillLevel }

    if (supabase) {
      const { error } = await supabase.from('players').insert(playerToDb(player))
      if (error) {
        setNotice(error.message)
        return
      }
    }

    persist(
      {
        ...data,
        players: [...data.players, player],
      },
      `${name} added at ${skillLevel.toFixed(1)}.`,
    )
    setPlayerForm({ name: '', skillLevel: '3.0' })
  }

  async function addMatch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!requireAdmin()) return
    const playerIds = [
      matchForm.teamA1,
      matchForm.teamA2,
      matchForm.teamB1,
      matchForm.teamB2,
    ]
    const uniquePlayers = new Set(playerIds)
    const scoreA = Number(matchForm.scoreA)
    const scoreB = Number(matchForm.scoreB)

    if (playerIds.some((id) => !id)) {
      setMatchError('Pick all four players before saving.')
      return
    }
    if (uniquePlayers.size !== 4) {
      setMatchError('Each player can only appear once in a game.')
      return
    }
    if (!matchForm.playedOn) {
      setMatchError('Pick a date before saving.')
      return
    }
    if (scoreA < 0 || scoreB < 0) {
      setMatchError('Scores cannot be negative.')
      return
    }
    if (scoreA <= scoreB) {
      setMatchError('Winner score must be higher than loser score.')
      return
    }
    setMatchError('')

    const match: Match = {
      id: makeId('m'),
      week: formatResultsLabel(matchForm.playedOn),
      playedOn: matchForm.playedOn,
      teamA: [matchForm.teamA1, matchForm.teamA2],
      teamB: [matchForm.teamB1, matchForm.teamB2],
      scoreA,
      scoreB,
    }

    if (supabase) {
      const { error } = await supabase.from('matches').insert(matchToDb(match))
      if (error) {
        setMatchError(error.message)
        return
      }
    }

    persist(
      { ...data, matches: [...data.matches, match] },
      `${match.week} score saved.`,
    )
    setMatchForm((current) => ({
      ...emptyMatch,
      playedOn: current.playedOn,
    }))
  }

  function toggleSort(key: SortKey) {
    setSort((current) => ({
      key,
      direction:
        current.key === key && current.direction === 'asc' ? 'desc' : 'asc',
    }))
  }

  function setSortFromValue(value: string) {
    const [key, direction] = value.split(':') as [SortKey, SortDirection]
    setSort({ key, direction })
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <div>
          <div className="brand-lockup">
            <img
              className="brand-logo"
              src="./david-lloyd-pickleball-logo.png"
              alt="David Lloyd Clubs Pickleball"
            />
          </div>
        </div>
        <div className="topbar-actions">
          {route !== '#/admin' ? (
            <div className="view-tabs header-tabs" role="tablist" aria-label="Leaderboard views">
              <button
                type="button"
                className={activePublicTab === 'overall' ? 'active' : ''}
                onClick={() => setActivePublicTab('overall')}
              >
                Leaderboard
              </button>
              <button
                type="button"
                className={activePublicTab === 'weekly' ? 'active' : ''}
                onClick={() => setActivePublicTab('weekly')}
              >
                Weekly
              </button>
            </div>
          ) : null}
          <button
            type="button"
            className="theme-toggle"
            onClick={() =>
              setTheme((current) => (current === 'dark' ? 'light' : 'dark'))
            }
            aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
            title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
          >
            {theme === 'dark' ? <Sun size={17} /> : <Moon size={17} />}
          </button>
          <a className="ghost-link admin-link" href={route === '#/admin' ? '#/' : '#/admin'}>
            {route === '#/admin' ? 'View public site' : 'Admin login'}
          </a>
        </div>
      </header>

      {route === '#/admin' ? (
        <AdminPage
          authForm={authForm}
          authError={authError}
          canEdit={canEdit}
          data={data}
          isSupabaseConfigured={isSupabaseConfigured}
          matchError={matchError}
          matchForm={matchForm}
          playerForm={playerForm}
          session={session}
          setAuthForm={setAuthForm}
          setMatchError={setMatchError}
          setMatchForm={setMatchForm}
          setPlayerForm={setPlayerForm}
          signIn={signIn}
          signOut={signOut}
          addMatch={addMatch}
          addPlayer={addPlayer}
        />
      ) : (
        <div className="public-dashboard">
          <section className="summary-strip" aria-label="League summary">
            <div className="summary-card">
              <span className="summary-icon">
                <Trophy size={28} />
              </span>
              <div>
                <span>Top rated</span>
                <strong>{standings[0]?.name ?? '-'}</strong>
                <b>{standings[0] ? formatRating(standings[0].rating) : '0.000'}</b>
              </div>
            </div>
            <div className="summary-card">
              <span className="summary-icon">
                <LineChart size={28} />
              </span>
              <div>
                <span>Average 4DR</span>
                <strong>{averageRating.toFixed(3)}</strong>
                <small>Across {data.players.length} players</small>
              </div>
            </div>
            <div className="summary-card">
              <span className="summary-icon">
                <CalendarDays size={28} />
              </span>
              <div>
                <span>Last updated</span>
                <strong>{formatSnapshotDate(activeWeeklySnapshot?.label)}</strong>
                <small>{data.matches.length} saved games</small>
              </div>
            </div>
          </section>

          {activePublicTab === 'overall' ? (
            <>
              <section className="panel leaderboard-panel dashboard-table-panel">
                <div className="leaderboard-toolbar">
                  <label className="search-control">
                    <Search size={18} />
                    <input
                      type="search"
                      placeholder="Search players..."
                      value={search}
                      onChange={(event) => setSearch(event.target.value)}
                      aria-label="Search players"
                    />
                  </label>
                  <button type="button" className="toolbar-select">
                    <SlidersHorizontal size={16} />
                    All Players
                  </button>
                  <label className="sort-control">
                    <ArrowUpDown size={17} />
                    <select
                      value={`${sort.key}:${sort.direction}`}
                      onChange={(event) => setSortFromValue(event.target.value)}
                      aria-label="Sort leaderboard"
                    >
                      <option value="rating:desc">Sort by 4DR</option>
                      <option value="record:desc">Sort by win %</option>
                      <option value="games:desc">Sort by games</option>
                      <option value="player:asc">Sort by player</option>
                    </select>
                  </label>
                </div>
                <div className="table-wrap">
                  <table className="leaderboard-table">
                    <thead>
                      <tr>
                        <SortableHeader
                          label="#"
                          sortKey="rank"
                          activeSort={sort}
                          onSort={toggleSort}
                        />
                        <SortableHeader
                          label="Player"
                          sortKey="player"
                          activeSort={sort}
                          onSort={toggleSort}
                        />
                        <SortableHeader
                          label="4DR Rating"
                          sortKey="rating"
                          activeSort={sort}
                          onSort={toggleSort}
                        />
                        <SortableHeader
                          label="Wins"
                          sortKey="wins"
                          activeSort={sort}
                          onSort={toggleSort}
                        />
                        <SortableHeader
                          label="Losses"
                          sortKey="losses"
                          activeSort={sort}
                          onSort={toggleSort}
                        />
                        <SortableHeader
                          label="Games"
                          sortKey="games"
                          activeSort={sort}
                          onSort={toggleSort}
                        />
                        <SortableHeader
                          label="Win %"
                          sortKey="record"
                          activeSort={sort}
                          onSort={toggleSort}
                        />
                      </tr>
                    </thead>
                    <tbody>
                      {filteredStandings.map((player) => {
                        const isSelected = selectedPlayerId === player.id
                        const playerWeeks = isSelected
                          ? buildPlayerWeekPoints(
                              player.id,
                              summaries,
                              sourceWeeklySnapshots,
                            )
                          : []
                        const rank = rankByPlayerId.get(player.id) ?? 0
                        return (
                          <Fragment key={player.id}>
                            <tr
                              className={isSelected ? 'selected-row' : ''}
                              tabIndex={0}
                              onClick={() =>
                                setSelectedPlayerId((current) =>
                                  current === player.id ? null : player.id,
                                )
                              }
                              onKeyDown={(event) => {
                                if (event.key === 'Enter' || event.key === ' ') {
                                  event.preventDefault()
                                  setSelectedPlayerId((current) =>
                                    current === player.id ? null : player.id,
                                  )
                                }
                              }}
                            >
                              <td
                                data-rank={rank}
                                className={`rank-cell rank-pos-${
                                  rank <= 3 ? rank : 'other'
                                }`}
                              >
                                {rank}
                              </td>
                              <td>
                                <div className="player-cell">
                                  <span className="player-avatar" aria-hidden="true">
                                    {player.name.slice(0, 1)}
                                  </span>
                                  <strong>{player.name}</strong>
                                </div>
                              </td>
                              <td className="rating-cell">
                                {formatRating(player.rating)}
                              </td>
                              <td>{player.wins}</td>
                              <td>{player.losses}</td>
                              <td>{player.games}</td>
                              <td>{formatWinRate(player.wins, player.games)}</td>
                            </tr>
                            {isSelected ? (
                              <tr className="expanded-row">
                                <td colSpan={LEADERBOARD_COLUMN_COUNT}>
                                  <PlayerDetailPanel player={player} weeks={playerWeeks} />
                                </td>
                              </tr>
                            ) : null}
                          </Fragment>
                        )
                      })}
                      {filteredStandings.length === 0 ? (
                        <tr>
                          <td
                            colSpan={LEADERBOARD_COLUMN_COUNT}
                            className="empty-table"
                          >
                            No players match "{search.trim()}".
                          </td>
                        </tr>
                      ) : null}
                    </tbody>
                  </table>
                </div>
              </section>
            </>
          ) : (
            <div className="weekly-workspace">
              <section className="panel weekly-panel">
                <div className="panel-heading weekly-heading">
                  <div>
                    <h2>Weekly leaderboard</h2>
                    <p>
                      {activeWeeklySnapshot
                        ? 'Full 4DR ranking list and position movement for this week.'
                        : 'Shows every player ranked by 4DR points gained in the selected week.'}
                    </p>
                  </div>
                  <select
                    className="week-select"
                    value={activeWeek}
                    onChange={(event) => {
                      setSelectedWeek(event.target.value)
                      setSelectedWeeklyPlayerId(null)
                    }}
                    aria-label="Select week"
                  >
                    {weekOptions.map((week) => (
                      <option key={week.key} value={week.key}>
                        {week.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="table-wrap">
                  <table className="weekly-table">
                    <thead>
                      {activeWeeklySnapshot ? (
                        <tr>
                          <th>Rank</th>
                          <th>Player</th>
                          <th>4DR</th>
                          <th>4DR +/-</th>
                          <th>POS +/-</th>
                        </tr>
                      ) : (
                        <tr>
                          <th>Rank</th>
                          <th>Player</th>
                          <th>Weekly +/-</th>
                          <th>Diff</th>
                        </tr>
                      )}
                    </thead>
                    <tbody>
                      {activeWeeklySnapshot
                        ? fullWeeklySnapshotRows.map((player) => {
                            const ratingChange = activeWeeklySnapshotPlayerIds.has(
                              player.playerId,
                            )
                              ? activeSnapshotRatingChanges.get(player.playerId)
                              : 0

                            return (
                              <tr
                                key={player.playerId}
                                className={
                                  selectedWeeklyPlayerId === player.playerId
                                    ? 'selected-row'
                                    : ''
                                }
                                tabIndex={0}
                                onClick={() =>
                                  setSelectedWeeklyPlayerId(player.playerId)
                                }
                                onKeyDown={(event) => {
                                  if (event.key === 'Enter' || event.key === ' ') {
                                    event.preventDefault()
                                    setSelectedWeeklyPlayerId(player.playerId)
                                  }
                                }}
                              >
                                <td className="rank-cell">{player.rank}</td>
                                <td>
                                  <strong>{player.name}</strong>
                                </td>
                                <td className="rating-cell">
                                  {formatRating(player.rating)}
                                </td>
                                <td>
                                  <span className={movementClass(ratingChange)}>
                                    {formatRatingChange(ratingChange)}
                                  </span>
                                </td>
                                <td>
                                  <span className={movementClass(player.movement)}>
                                    {player.movement}
                                  </span>
                                </td>
                              </tr>
                            )
                          })
                        : weeklyStandings.map((player, index) => {
                            const pointDifference =
                              player.pointsFor - player.pointsAgainst
                            const recordDifference = player.wins - player.losses

                            return (
                              <tr
                                key={player.playerId}
                                className={
                                  selectedWeeklyPlayerId === player.playerId
                                    ? 'selected-row'
                                    : ''
                                }
                                tabIndex={0}
                                onClick={() =>
                                  setSelectedWeeklyPlayerId(player.playerId)
                                }
                                onKeyDown={(event) => {
                                  if (event.key === 'Enter' || event.key === ' ') {
                                    event.preventDefault()
                                    setSelectedWeeklyPlayerId(player.playerId)
                                  }
                                }}
                              >
                                <td className="rank-cell">{index + 1}</td>
                                <td>
                                  <strong>{player.name}</strong>
                                  <span>
                                    {player.games} game
                                    {player.games === 1 ? '' : 's'} | point{' '}
                                    {pointDifference >= 0 ? '+' : ''}
                                    {pointDifference}
                                  </span>
                                </td>
                                <td>
                                  <span
                                    className={
                                      player.change >= 0
                                        ? 'movement positive'
                                        : 'movement negative'
                                    }
                                  >
                                    {player.change >= 0 ? '+' : ''}
                                    {player.change.toFixed(3)}
                                  </span>
                                </td>
                                <td>
                                  <span className={movementClass(recordDifference)}>
                                    {recordDifference >= 0 ? '+' : ''}
                                    {recordDifference}
                                  </span>
                                </td>
                              </tr>
                            )
                          })}
                      {!activeWeeklySnapshot && weeklyStandings.length === 0 ? (
                        <tr>
                          <td colSpan={4} className="empty-table">
                            No games found for this week.
                          </td>
                        </tr>
                      ) : null}
                    </tbody>
                  </table>
                </div>
              </section>

              <WeeklyPlayerDetail
                games={weeklyPlayerGames}
                playerName={selectedWeeklyPlayerName}
                snapshotPlayer={selectedWeeklySnapshotPlayer}
                snapshotRatingChange={selectedWeeklySnapshotRatingChange}
                computedPlayer={selectedWeeklyComputedPlayer}
              />
            </div>
          )}
        </div>
      )}
    </main>
  )
}

function AdminPage({
  authForm,
  authError,
  canEdit,
  data,
  isSupabaseConfigured,
  matchError,
  matchForm,
  playerForm,
  session,
  setAuthForm,
  setMatchError,
  setMatchForm,
  setPlayerForm,
  signIn,
  signOut,
  addMatch,
  addPlayer,
}: {
  authForm: { email: string; password: string }
  authError: string
  canEdit: boolean
  data: AppData
  isSupabaseConfigured: boolean
  matchError: string
  matchForm: typeof emptyMatch
  playerForm: { name: string; skillLevel: string }
  session: Session | null
  setAuthForm: (value: { email: string; password: string }) => void
  setMatchError: (value: string) => void
  setMatchForm: (value: typeof emptyMatch) => void
  setPlayerForm: (value: { name: string; skillLevel: string }) => void
  signIn: (event: FormEvent<HTMLFormElement>) => void
  signOut: () => void
  addMatch: (event: FormEvent<HTMLFormElement>) => void
  addPlayer: (event: FormEvent<HTMLFormElement>) => void
}) {
  const updateMatchForm = (next: Partial<typeof emptyMatch>) => {
    setMatchForm({ ...matchForm, ...next })
    setMatchError('')
  }

  return (
    <section className="admin-page">
      <section className="panel login-panel">
        <div className="panel-heading">
          <div>
            <h2>Admin Login</h2>
            <p>
              {isSupabaseConfigured
                ? session
                  ? 'Signed in. Updates save online.'
                  : 'Sign in to update games and players.'
                : 'Supabase is not configured, so local admin mode is enabled.'}
            </p>
          </div>
        </div>
        {isSupabaseConfigured ? (
          session ? (
            <div className="admin-status">
              <span>{session.user.email}</span>
              <button type="button" className="ghost-button" onClick={signOut}>
                <LogOut size={16} />
                Sign out
              </button>
            </div>
          ) : (
            <form className="admin-form" onSubmit={signIn}>
              <input
                type="text"
                placeholder="Username"
                value={authForm.email}
                onChange={(event) =>
                  setAuthForm({ ...authForm, email: event.target.value })
                }
              />
              <input
                type="password"
                placeholder="Password"
                value={authForm.password}
                onChange={(event) =>
                  setAuthForm({ ...authForm, password: event.target.value })
                }
              />
              {authError ? <p className="form-error">{authError}</p> : null}
              <button type="submit" className="primary-button">
                <LogIn size={16} />
                Sign in
              </button>
            </form>
          )
        ) : (
          <div className="admin-status">
            <span>Local editing is active on this computer.</span>
          </div>
        )}
      </section>

      {canEdit ? (
      <div className="admin-grid">
        <section className="panel match-entry-panel">
          <div className="panel-heading match-entry-heading">
            <div>
              <h2>Add weekly game</h2>
              <p>Enter winners first, then losers and the final score.</p>
            </div>
          </div>
          <form className="game-entry-form" onSubmit={addMatch}>
            <div className="game-entry-row">
              <label>
                Date
                <input
                  type="date"
                  required
                  value={matchForm.playedOn}
                  onChange={(event) =>
                    updateMatchForm({ playedOn: event.target.value })
                  }
                />
              </label>
            </div>

            <div className="team-entry-grid">
              <fieldset className="team-card winner-card">
                <legend>Winners</legend>
                <PlayerSelect
                  players={data.players}
                  value={matchForm.teamA1}
                  excludeIds={[matchForm.teamA2, matchForm.teamB1, matchForm.teamB2]}
                  onChange={(value) => updateMatchForm({ teamA1: value })}
                />
                <PlayerSelect
                  players={data.players}
                  value={matchForm.teamA2}
                  excludeIds={[matchForm.teamA1, matchForm.teamB1, matchForm.teamB2]}
                  onChange={(value) => updateMatchForm({ teamA2: value })}
                />
              </fieldset>
              <fieldset className="team-card loser-card">
                <legend>Losers</legend>
                <PlayerSelect
                  players={data.players}
                  value={matchForm.teamB1}
                  excludeIds={[matchForm.teamA1, matchForm.teamA2, matchForm.teamB2]}
                  onChange={(value) => updateMatchForm({ teamB1: value })}
                />
                <PlayerSelect
                  players={data.players}
                  value={matchForm.teamB2}
                  excludeIds={[matchForm.teamA1, matchForm.teamA2, matchForm.teamB1]}
                  onChange={(value) => updateMatchForm({ teamB2: value })}
                />
              </fieldset>
            </div>

            <section className="score-entry" aria-label="Game score">
              <div className="score-inputs">
                <label>
                  Winners score
                  <input
                    type="number"
                    min="1"
                    value={matchForm.scoreA}
                    onChange={(event) =>
                      updateMatchForm({ scoreA: event.target.value })
                    }
                  />
                </label>
                <label>
                  Losers score
                  <input
                    type="number"
                    min="0"
                    value={matchForm.scoreB}
                    onChange={(event) =>
                      updateMatchForm({ scoreB: event.target.value })
                    }
                  />
                </label>
              </div>
            </section>

            {matchError ? <p className="form-error">{matchError}</p> : null}
            <button type="submit" className="primary-button" disabled={!canEdit}>
              <Save size={17} />
              {canEdit ? 'Save game' : 'Sign in to save'}
            </button>
          </form>
        </section>

        <section className="panel">
          <div className="panel-heading">
            <div>
              <h2>Add player</h2>
              <p>New players start from their skill level.</p>
            </div>
          </div>
          <form className="inline-form" onSubmit={addPlayer}>
            <input
              placeholder="Player name"
              value={playerForm.name}
              onChange={(event) =>
                setPlayerForm({ ...playerForm, name: event.target.value })
              }
            />
            <select
              value={playerForm.skillLevel}
              onChange={(event) =>
                setPlayerForm({ ...playerForm, skillLevel: event.target.value })
              }
            >
              <option value="2.5">2.5</option>
              <option value="3.0">3.0</option>
              <option value="3.5">3.5</option>
              <option value="4.0">4.0</option>
              <option value="4.5">4.5</option>
            </select>
            <button
              type="submit"
              className="icon-button"
              aria-label="Add player"
              disabled={!canEdit}
            >
              <Plus size={18} />
            </button>
          </form>
        </section>
      </div>
      ) : null}
    </section>
  )
}

function WeeklyPlayerDetail({
  games,
  playerName,
  snapshotPlayer,
  snapshotRatingChange,
  computedPlayer,
}: {
  games: WeeklyPlayerGame[]
  playerName: string
  snapshotPlayer?: WeeklySnapshot['players'][number]
  snapshotRatingChange?: number | null
  computedPlayer?: WeeklyStanding
}) {
  const wins = games.filter((game) => game.result === 'Win').length
  const losses = games.length - wins
  const pointsFor = games.reduce(
    (total, game) =>
      total + (game.selectedTeam === 'A' ? game.scoreA : game.scoreB),
    0,
  )
  const pointsAgainst = games.reduce(
    (total, game) =>
      total + (game.selectedTeam === 'A' ? game.scoreB : game.scoreA),
    0,
  )
  const gameTotalChange = roundRating(
    games.reduce((total, game) => total + game.ratingChange, 0),
  )
  const totalChange = snapshotRatingChange ?? gameTotalChange

  if (!playerName) {
    return (
      <aside className="panel weekly-detail-panel empty-weekly-detail">
        <h2>Weekly player overview</h2>
        <p>Select a player in the weekly leaderboard to see their games.</p>
      </aside>
    )
  }

  return (
    <aside className="panel weekly-detail-panel">
      <div className="weekly-detail-head">
        <div>
          <span className="eyebrow">Weekly player overview</span>
          <h2>{playerName}</h2>
          <p>
            {games.length} game{games.length === 1 ? '' : 's'} this week
          </p>
        </div>
        {snapshotPlayer ? (
          <strong>{formatRating(snapshotPlayer.rating)}</strong>
        ) : computedPlayer ? (
          <strong>
            {computedPlayer.change >= 0 ? '+' : ''}
            {computedPlayer.change.toFixed(3)}
          </strong>
        ) : null}
      </div>

      <div className="weekly-detail-metrics">
        <div>
          <span>Record</span>
          <strong>
            {wins}-{losses}
          </strong>
        </div>
        <div>
          <span>Points</span>
          <strong>
            {pointsFor}-{pointsAgainst}
          </strong>
        </div>
        <div>
          <span>4DR move</span>
          <strong
            className={
              totalChange === null
                ? undefined
                : totalChange >= 0
                  ? 'positive'
                  : 'negative'
            }
          >
            {formatRatingChange(totalChange)}
          </strong>
        </div>
      </div>

      <div className="weekly-games-list">
        {games.map((game) => (
          <WeeklyGameStatsCard game={game} key={game.id} />
        ))}
        {games.length === 0 ? (
          <div className="empty-table">
            No game details were found for this player in the selected week.
          </div>
        ) : null}
      </div>
    </aside>
  )
}

function formatPercent(value: number) {
  return `${(value * 100).toFixed(2)}%`
}

function formatSignedPoints(value: number) {
  return `${value >= 0 ? '+' : ''}${value.toFixed(3)}`
}

function formatGameRating(value: number) {
  return (Math.round((value + Number.EPSILON) * 1000) / 1000).toFixed(3)
}

function WeeklyGameStatsCard({ game }: { game: WeeklyPlayerGame }) {
  const teamAIsWinner = game.winner === 'A'
  const winnerTeam = teamAIsWinner ? game.teamA : game.teamB
  const loserTeam = teamAIsWinner ? game.teamB : game.teamA
  const winnerAverage = teamAIsWinner ? game.teamAStart : game.teamBStart
  const loserAverage = teamAIsWinner ? game.teamBStart : game.teamAStart
  const winnerProbability = teamAIsWinner
    ? game.teamAWinProbability
    : 1 - game.teamAWinProbability
  const baseShare = 1 - winnerProbability
  const marginBonus = Math.abs(game.scoreA - game.scoreB) * 0.001
  const loserPointBonus = Math.min(game.scoreA, game.scoreB) * 0.001
  const winnerDelta = teamAIsWinner ? game.teamADelta : game.teamBDelta
  const loserDelta = teamAIsWinner ? game.teamBDelta : game.teamADelta
  const scoreLabel = `${game.scoreA}-${game.scoreB}`

  return (
    <article className="weekly-game-card">
      <div className="game-card-top">
        <div>
          <span className="eyebrow">Game #{game.gameNumber}</span>
          <h3>{scoreLabel}</h3>
        </div>
        <span className={game.result === 'Win' ? 'result-win' : 'result-loss'}>
          {game.result}
        </span>
      </div>

      <div className="matchup-board" aria-label={`Game ${game.gameNumber} matchup`}>
        <GameTeam
          label="Team A"
          players={game.teamA}
          score={game.scoreA}
          isWinner={teamAIsWinner}
          selectedPlayerId={game.selectedPlayerId}
        />
        <div className="matchup-divider">vs</div>
        <GameTeam
          label="Team B"
          players={game.teamB}
          score={game.scoreB}
          isWinner={!teamAIsWinner}
          selectedPlayerId={game.selectedPlayerId}
        />
      </div>

      <div className="game-stat-grid">
        <div>
          <span>Winners avg 4DR</span>
          <strong>{formatGameRating(winnerAverage)}</strong>
        </div>
        <div>
          <span>Losers avg 4DR</span>
          <strong>{formatGameRating(loserAverage)}</strong>
        </div>
      </div>

      <div className="probability-block">
        <div className="probability-head">
          <span>Win probability</span>
          <strong>{formatPercent(winnerProbability)}</strong>
        </div>
        <div className="probability-track">
          <span style={{ width: formatPercent(winnerProbability) }} />
        </div>
        <p>
          {formatPercent(baseShare)} of 0.100 = {game.baseDelta.toFixed(3)}{' '}
          4DR points
        </p>
      </div>

      <table className="points-breakdown">
        <thead>
          <tr>
            <th />
            <th>4DR</th>
            <th>Score</th>
            <th>Total</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <th>Winners</th>
            <td className="positive">{formatSignedPoints(game.baseDelta)}</td>
            <td className="positive">{formatSignedPoints(marginBonus)}</td>
            <td className="positive">{formatSignedPoints(winnerDelta)}</td>
          </tr>
          <tr>
            <th>Losers</th>
            <td className="negative">{formatSignedPoints(-game.baseDelta)}</td>
            <td className="positive">{formatSignedPoints(loserPointBonus)}</td>
            <td className={loserDelta >= 0 ? 'positive' : 'negative'}>
              {formatSignedPoints(loserDelta)}
            </td>
          </tr>
        </tbody>
      </table>

      <table className="player-breakdown">
        <thead>
          <tr>
            <th>Name</th>
            <th>Start</th>
            <th>+/-</th>
            <th>Finish</th>
          </tr>
        </thead>
        <tbody>
          {[...winnerTeam, ...loserTeam].map((player) => (
            <tr
              className={player.id === game.selectedPlayerId ? 'selected-player' : ''}
              key={`${game.id}-${player.id}`}
            >
              <th
                className={
                  winnerTeam.some((winner) => winner.id === player.id)
                    ? 'positive'
                    : 'negative'
                }
              >
                {player.name}
              </th>
              <td>{formatGameRating(player.start)}</td>
              <td className={player.change >= 0 ? 'positive' : 'negative'}>
                {formatSignedPoints(player.change)}
              </td>
              <td>{formatGameRating(player.finish)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </article>
  )
}

function GameTeam({
  label,
  players,
  score,
  isWinner,
  selectedPlayerId,
}: {
  label: string
  players: WeeklyPlayerGame['teamA']
  score: number
  isWinner: boolean
  selectedPlayerId: string
}) {
  return (
    <div className={isWinner ? 'game-team winner' : 'game-team'}>
      <div>
        <span>{label}</span>
        <strong>{score}</strong>
      </div>
      {players.map((player) => (
        <p
          className={player.id === selectedPlayerId ? 'selected-player-name' : ''}
          key={player.id}
        >
          {player.name}
        </p>
      ))}
    </div>
  )
}

function sortStandings(
  standings: PlayerStanding[],
  key: SortKey,
  direction: SortDirection,
) {
  const directionMultiplier = direction === 'asc' ? 1 : -1
  const ranked = standings.map((player, rankIndex) => ({ player, rankIndex }))

  return ranked
    .sort((a, b) => {
      let result = 0
      if (key === 'rank') result = a.rankIndex - b.rankIndex
      if (key === 'player') result = a.player.name.localeCompare(b.player.name)
      if (key === 'rating') result = a.player.rating - b.player.rating
      if (key === 'record') {
        const aRate = a.player.games ? a.player.wins / a.player.games : 0
        const bRate = b.player.games ? b.player.wins / b.player.games : 0
        result = aRate - bRate || a.player.wins - b.player.wins
      }
      if (key === 'wins') result = a.player.wins - b.player.wins
      if (key === 'losses') result = a.player.losses - b.player.losses
      if (key === 'games') result = a.player.games - b.player.games
      return result * directionMultiplier || a.rankIndex - b.rankIndex
    })
    .map((item) => item.player)
}

function SortableHeader({
  label,
  sortKey,
  activeSort,
  onSort,
}: {
  label: string
  sortKey: SortKey
  activeSort: { key: SortKey; direction: SortDirection }
  onSort: (key: SortKey) => void
}) {
  const isActive = activeSort.key === sortKey
  return (
    <th>
      <button
        type="button"
        className={isActive ? 'sort-button active' : 'sort-button'}
        onClick={() => onSort(sortKey)}
        aria-sort={
          isActive
            ? activeSort.direction === 'asc'
              ? 'ascending'
              : 'descending'
            : 'none'
        }
      >
        {label}
        <span>{isActive ? (activeSort.direction === 'asc' ? '↑' : '↓') : '↕'}</span>
      </button>
    </th>
  )
}

function PlayerDetailPanel({
  player,
  weeks,
}: {
  player: PlayerStanding
  weeks: PlayerWeekPoint[]
}) {
  const latestWeek = weeks.at(-1)
  const bestWeek = weeks.reduce<PlayerWeekPoint | null>(
    (best, week) => (!best || week.change > best.change ? week : best),
    null,
  )
  const latestRows = [...weeks].reverse().slice(0, 5)

  return (
    <section className="panel player-panel">
      <div className="player-panel-head">
        <div>
          <span className="eyebrow">Selected player</span>
          <h2>{player.name}</h2>
          <p>
            David Lloyd Cardiff · {player.wins}W – {player.losses}L across{' '}
            {player.games} games
          </p>
        </div>
        <strong>{formatRating(player.rating)}</strong>
      </div>

      <RatingChart weeks={weeks} currentRating={player.rating} />

      <div className="player-metrics">
        <div>
          <span>Total change</span>
          <strong>
            {latestWeek && latestWeek.cumulative >= 0 ? '+' : ''}
            {latestWeek ? latestWeek.cumulative.toFixed(3) : '0.000'}
          </strong>
        </div>
        <div>
          <span>Best week</span>
          <strong>
            {bestWeek && bestWeek.change >= 0 ? '+' : ''}
            {bestWeek ? bestWeek.change.toFixed(3) : '0.000'}
          </strong>
        </div>
        <div>
          <span>Point +/-</span>
          <strong>{player.pointsFor - player.pointsAgainst}</strong>
        </div>
      </div>

      <div className="week-list" aria-label={`${player.name} weekly changes`}>
        {latestRows.map((week) => (
          <div key={week.key}>
            <span>{week.label}</span>
            <small>
              {week.wins}-{week.losses} | {week.pointsFor}-{week.pointsAgainst}
            </small>
            <strong className={week.change >= 0 ? 'positive' : 'negative'}>
              {week.change >= 0 ? '+' : ''}
              {week.change.toFixed(3)}
            </strong>
          </div>
        ))}
      </div>
    </section>
  )
}

function formatWeekLabel(label: string) {
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  const m = label.match(/(\d{1,2})-(\d{2})-\d{4}/)
  if (!m) return label.slice(0, 6)
  return `${parseInt(m[1])} ${months[parseInt(m[2]) - 1]}`
}

function RatingChart({
  weeks,
  currentRating,
}: {
  weeks: PlayerWeekPoint[]
  currentRating: number
}) {
  if (weeks.length === 0) {
    return <div className="empty-chart">No sessions logged yet.</div>
  }

  const W = 340, H = 178
  const PX = 10, PT = 14, PB = 28
  const chartW = W - PX * 2
  const chartH = H - PT - PB

  // Index 0 = start (before any games), 1..n = one per session
  const ratings = [
    DEFAULT_RATING,
    ...weeks.map((week) => roundRating(DEFAULT_RATING + week.cumulative)),
  ]
  const currentChartRating = ratings.at(-1) ?? currentRating
  const n = ratings.length

  const minR = Math.min(...ratings)
  const maxR = Math.max(...ratings)
  const range = maxR - minR || 0.05
  const pad = range * 0.12

  const px = (i: number) => PX + (n === 1 ? chartW / 2 : (i / (n - 1)) * chartW)
  const py = (r: number) => PT + chartH - ((r - (minR - pad)) / (range + pad * 2)) * chartH

  const pts = ratings.map((r, i) => ({ x: px(i), y: py(r), r }))
  const linePath = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')
  const floorY = py(minR - pad)
  const areaPath = `${linePath} L${pts.at(-1)!.x.toFixed(1)},${floorY.toFixed(1)} L${pts[0].x.toFixed(1)},${floorY.toFixed(1)} Z`
  const baselineY = py(DEFAULT_RATING)

  // Show labels at start, every ~4 sessions, and last
  const labelSet = new Set<number>([0])
  const step = Math.max(3, Math.ceil(weeks.length / 4))
  for (let i = step; i < weeks.length; i += step) labelSet.add(i + 1)
  labelSet.add(n - 1)

  return (
    <div className="chart-card">
      <div className="chart-title">
        <span>4DR rating over time</span>
        <strong>{weeks.length} sessions</strong>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="4DR rating over time">
        <defs>
          <linearGradient id="chartFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#108953" stopOpacity="0.18" />
            <stop offset="100%" stopColor="#108953" stopOpacity="0.01" />
          </linearGradient>
        </defs>
        <line x1={PX} x2={W - PX} y1={baselineY} y2={baselineY} className="chart-zero" />
        <path d={areaPath} fill="url(#chartFill)" />
        <path d={linePath} className="chart-line" />
        {pts.map((p, i) => (
          <circle
            key={i}
            cx={p.x}
            cy={p.y}
            r={i === 0 ? 3 : 3.8}
            className={
              i === 0
                ? 'chart-dot-start'
                : (weeks[i - 1]?.change ?? 0) >= 0
                  ? 'chart-dot positive'
                  : 'chart-dot negative'
            }
          />
        ))}
        {[...labelSet].map((i) => {
          const lbl = i === 0 ? 'Start' : formatWeekLabel(weeks[i - 1]?.label ?? '')
          return (
            <text key={i} x={px(i).toFixed(1)} y={H - 6} className="chart-label" textAnchor="middle">
              {lbl}
            </text>
          )
        })}
      </svg>
      <div className="chart-scale">
        <span>Start {DEFAULT_RATING.toFixed(3)}</span>
        <span>Now {currentChartRating.toFixed(3)}</span>
      </div>
    </div>
  )
}

function PlayerSelect({
  players,
  value,
  onChange,
  excludeIds = [],
}: {
  players: Player[]
  value: string
  onChange: (value: string) => void
  excludeIds?: string[]
}) {
  const options = players
    .filter((player) => player.id === value || !excludeIds.includes(player.id))
    .sort((a, b) => a.name.localeCompare(b.name))
  return (
    <select value={value} onChange={(event) => onChange(event.target.value)}>
      <option value="">Choose player</option>
      {options.map((player) => (
        <option key={player.id} value={player.id}>
          {player.name}
        </option>
      ))}
    </select>
  )
}

export default App
