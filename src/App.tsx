import { Fragment, useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import {
  LogIn,
  LogOut,
  LineChart,
  Plus,
  Save,
  Trophy,
  Upload,
  Users,
} from 'lucide-react'
import './App.css'
import { cardiffSeedData } from './data/cardiffSeed'
import {
  calculateMatch,
  formatRating,
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

type SortKey = 'rank' | 'player' | 'rating' | 'record' | 'games'
type SortDirection = 'asc' | 'desc'

const STORAGE_KEY = 'pickleranker-cardiff-data-v3'
const DEFAULT_RATING = 3
const LEADERBOARD_COLUMN_COUNT = 5
const ADMIN_USERNAME = 'ben'
const ADMIN_AUTH_EMAIL = 'ben@pickleranker.local'

const seededData = cardiffSeedData as unknown as AppData
const sourceWeeklySnapshots = seededData.weeklySnapshots ?? []

function nextWeekLabel(matches: Match[]) {
  const highest = matches.reduce((max, match) => {
    const numbered = match.week.match(/week\s*(\d+)/i)
    return numbered ? Math.max(max, Number(numbered[1])) : max
  }, 0)
  if (highest > 0) return `Week ${highest + 1}`
  // Seed data labels weeks "Results DD-MM-YYYY"; follow that convention.
  const [year, month, day] = new Date().toISOString().slice(0, 10).split('-')
  return `Results ${day}-${month}-${year}`
}

const emptyMatch = {
  week: '',
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

  const sortedMatches = [...data.matches].sort((a, b) =>
    `${a.playedOn}-${a.id}`.localeCompare(`${b.playedOn}-${b.id}`),
  )
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
      b.pointsFor - b.pointsAgainst - (a.pointsFor - a.pointsAgainst) ||
      a.name.localeCompare(b.name),
  )
}

function loadData(): AppData {
  const stored = localStorage.getItem(STORAGE_KEY)
  if (!stored) return seededData

  try {
    const parsed = JSON.parse(stored) as AppData
    if (!Array.isArray(parsed.players) || !Array.isArray(parsed.matches)) {
      return seededData
    }
    return parsed
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
  const [session, setSession] = useState<Session | null>(null)
  const [authForm, setAuthForm] = useState({ email: '', password: '' })
  const [authError, setAuthError] = useState('')
  const [isLoadingRemote, setIsLoadingRemote] = useState(isSupabaseConfigured)
  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(null)
  const [sort, setSort] = useState<{ key: SortKey; direction: SortDirection }>({
    key: 'rank',
    direction: 'asc',
  })
  const [matchForm, setMatchForm] = useState(() => ({
    ...emptyMatch,
    week: nextWeekLabel(loadData().matches),
  }))
  const [matchError, setMatchError] = useState('')
  const [playerForm, setPlayerForm] = useState({ name: '', skillLevel: '3.0' })
  const [importText, setImportText] = useState('')
  const [search, setSearch] = useState('')
  const [selectedWeek, setSelectedWeek] = useState('')
  const [notice, setNotice] = useState(
    `Seeded from David Lloyd Cardiff: ${seededData.players.length} players, ${seededData.matches.length} previous games.`,
  )
  const canEdit = !isSupabaseConfigured || Boolean(session)

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
          setData(remoteData)
          setNotice('Loaded shared online leaderboard.')
        } else {
          setNotice('Supabase is connected but has no data yet. Run the seed SQL.')
        }
      })
      .catch((error: Error) => {
        setNotice(`Could not load Supabase data: ${error.message}`)
      })
      .finally(() => setIsLoadingRemote(false))

    return () => listener.subscription.unsubscribe()
  }, [])

  const { standings, summaries } = useMemo(() => buildStandings(data), [data])
  const visibleSummaries = summaries.slice(0, 24)
  const weekOptions = useMemo(
    () => buildWeekOptions(summaries, sourceWeeklySnapshots),
    [summaries],
  )
  const activeWeek = selectedWeek || weekOptions[0]?.key || ''
  const activeWeeklySnapshot = useMemo(
    () => sourceWeeklySnapshots.find((snapshot) => snapshot.key === activeWeek),
    [activeWeek],
  )
  const weeklyStandings = useMemo(
    () => buildWeeklyStandings(activeWeek, summaries, data.players),
    [activeWeek, summaries, data.players],
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
    if (scoreA < 0 || scoreB < 0 || scoreA === scoreB) {
      setMatchError('Scores must be different — no draws in pickleball.')
      return
    }
    setMatchError('')

    const match: Match = {
      id: makeId('m'),
      week: matchForm.week.trim() || 'Unlabelled week',
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
      week: current.week,
      playedOn: current.playedOn,
    }))
  }

  async function resetSeedData() {
    if (!requireAdmin()) return
    if (
      !window.confirm(
        'Reset everything back to the imported David Lloyd Cardiff data? Any games or players you have added will be lost.',
      )
    ) {
      return
    }
    if (supabase) {
      const { error: matchesError } = await supabase
        .from('matches')
        .delete()
        .neq('id', '__never__')
      if (matchesError) {
        setNotice(matchesError.message)
        return
      }
      const { error: playersError } = await supabase
        .from('players')
        .delete()
        .neq('id', '__never__')
      if (playersError) {
        setNotice(playersError.message)
        return
      }
      const { error: insertPlayersError } = await supabase
        .from('players')
        .insert(seededData.players.map(playerToDb))
      if (insertPlayersError) {
        setNotice(insertPlayersError.message)
        return
      }
      const { error: insertMatchesError } = await supabase
        .from('matches')
        .insert(seededData.matches.map(matchToDb))
      if (insertMatchesError) {
        setNotice(insertMatchesError.message)
        return
      }
    }

    persist(seededData, 'Reset to David Lloyd Cardiff imported data.')
  }

  function exportData() {
    const payload = JSON.stringify(data, null, 2)
    navigator.clipboard.writeText(payload).catch(() => {})
    const blob = new Blob([payload], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `pickleranker-${new Date().toISOString().slice(0, 10)}.json`
    link.click()
    URL.revokeObjectURL(url)
    setNotice('Backup downloaded and copied to clipboard as JSON.')
  }

  async function importCsv() {
    if (!requireAdmin()) return
    const rows = importText
      .split('\n')
      .map((row) => row.trim())
      .filter(Boolean)

    const nextPlayers = [...data.players]
    const nextMatches: Match[] = []

    rows.forEach((row) => {
      const [week, playedOn, a1, a2, b1, b2, scoreA, scoreB] = row
        .split(',')
        .map((cell) => cell.trim())
      if (!week || !playedOn || !a1 || !a2 || !b1 || !b2 || !scoreA || !scoreB) {
        return
      }

      const getPlayerId = (name: string) => {
        const existing = nextPlayers.find(
          (player) => player.name.toLowerCase() === name.toLowerCase(),
        )
        if (existing) return existing.id
        const player = { id: makeId('p'), name, skillLevel: 3.0 }
        nextPlayers.push(player)
        return player.id
      }

      nextMatches.push({
        id: makeId('m'),
        week,
        playedOn,
        teamA: [getPlayerId(a1), getPlayerId(a2)],
        teamB: [getPlayerId(b1), getPlayerId(b2)],
        scoreA: Number(scoreA),
        scoreB: Number(scoreB),
      })
    })

    if (nextMatches.length === 0) {
      setNotice('No valid CSV rows found.')
      return
    }

    const nextData = { players: nextPlayers, matches: [...data.matches, ...nextMatches] }

    if (supabase) {
      const newPlayers = nextPlayers.filter(
        (player) => !data.players.some((existing) => existing.id === player.id),
      )
      if (newPlayers.length > 0) {
        const { error } = await supabase.from('players').insert(newPlayers.map(playerToDb))
        if (error) {
          setNotice(error.message)
          return
        }
      }
      const { error } = await supabase.from('matches').insert(nextMatches.map(matchToDb))
      if (error) {
        setNotice(error.message)
        return
      }
    }

    persist(
      nextData,
      `${nextMatches.length} previous score${nextMatches.length === 1 ? '' : 's'} imported.`,
    )
    setImportText('')
  }

  const playerName = (id: string) =>
    data.players.find((player) => player.id === id)?.name ?? 'Unknown'

  function toggleSort(key: SortKey) {
    setSort((current) => ({
      key,
      direction:
        current.key === key && current.direction === 'asc' ? 'desc' : 'asc',
    }))
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <div>
          <div className="brand-lockup">
            <span className="brand-mark">PR</span>
            <div>
              <h1>pickleranker</h1>
              <p>David Lloyd Cardiff 4DR rankings with weekly score history.</p>
            </div>
          </div>
        </div>
        <div className="topbar-actions">
          <a className="ghost-link" href={route === '#/admin' ? '#/' : '#/admin'}>
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
          importCsv={importCsv}
          importText={importText}
          isSupabaseConfigured={isSupabaseConfigured}
          matchError={matchError}
          matchForm={matchForm}
          playerForm={playerForm}
          resetSeedData={resetSeedData}
          session={session}
          setAuthForm={setAuthForm}
          setImportText={setImportText}
          setMatchError={setMatchError}
          setMatchForm={setMatchForm}
          setPlayerForm={setPlayerForm}
          signIn={signIn}
          signOut={signOut}
          addMatch={addMatch}
          addPlayer={addPlayer}
          exportData={exportData}
        />
      ) : (
        <>
          <section className="summary-strip" aria-label="League summary">
            <div>
              <span>
                <Users size={15} />
                Players
              </span>
              <strong>{data.players.length}</strong>
            </div>
            <div>
              <span>
                <LineChart size={15} />
                Games logged
              </span>
              <strong>{data.matches.length}</strong>
            </div>
            <div>
              <span>
                <Trophy size={15} />
                Top 4DR
              </span>
              <strong>
                {standings[0] ? formatRating(standings[0].rating) : '0.000'}
              </strong>
            </div>
            <div>
              <span>Status</span>
              <strong>{isLoadingRemote ? 'Loading online data...' : notice}</strong>
            </div>
          </section>

          <div className="workspace">
            <section className="panel leaderboard-panel">
              <div className="panel-heading">
                <div>
                  <h2>Leaderboard</h2>
                  <p>Overall 4DR leaderboard. Click a player for rating history.</p>
                </div>
                <input
                  type="search"
                  className="search-input"
                  placeholder="Find player..."
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  aria-label="Find player"
                />
              </div>
              <div className="table-wrap">
                <table>
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
                        label="4DR"
                        sortKey="rating"
                        activeSort={sort}
                        onSort={toggleSort}
                      />
                      <SortableHeader
                        label="W-L"
                        sortKey="record"
                        activeSort={sort}
                        onSort={toggleSort}
                      />
                      <SortableHeader
                        label="Games"
                        sortKey="games"
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
                              className={`rank-cell rank-pos-${
                                rank <= 3 ? rank : 'other'
                              }`}
                            >
                              {rank}
                            </td>
                            <td>
                              <strong>{player.name}</strong>
                            </td>
                            <td className="rating-cell">
                              {formatRating(player.rating)}
                            </td>
                            <td>
                              {player.wins}-{player.losses}
                            </td>
                            <td>{player.games}</td>
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

            <section className="panel weekly-panel">
              <div className="panel-heading weekly-heading">
                <div>
                  <h2>Weekly leaderboard</h2>
                  <p>
                    {activeWeeklySnapshot
                      ? 'Active 4DR ranking list and position movement for this week.'
                      : 'Ranks players by 4DR points gained in the selected week.'}
                  </p>
                </div>
                <select
                  className="week-select"
                  value={activeWeek}
                  onChange={(event) => setSelectedWeek(event.target.value)}
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
                        <th>POS +/-</th>
                      </tr>
                    ) : (
                      <tr>
                        <th>Rank</th>
                        <th>Player</th>
                        <th>Weekly +/-</th>
                        <th>W-L</th>
                      </tr>
                    )}
                  </thead>
                  <tbody>
                    {activeWeeklySnapshot
                      ? activeWeeklySnapshot.players.map((player) => (
                          <tr key={player.playerId}>
                            <td className="rank-cell">{player.rank}</td>
                            <td>
                              <strong>{player.name}</strong>
                            </td>
                            <td className="rating-cell">
                              {formatRating(player.rating)}
                            </td>
                            <td>
                              <span
                                className={
                                  player.movement.startsWith('+')
                                    ? 'movement positive'
                                    : player.movement.startsWith('-')
                                      ? 'movement negative'
                                      : 'movement'
                                }
                              >
                                {player.movement}
                              </span>
                            </td>
                          </tr>
                        ))
                      : weeklyStandings.map((player, index) => {
                      const pointDifference = player.pointsFor - player.pointsAgainst

                      return (
                        <tr key={player.playerId}>
                          <td className="rank-cell">{index + 1}</td>
                          <td>
                            <strong>{player.name}</strong>
                            <span>
                              {player.games} game{player.games === 1 ? '' : 's'} |
                              point {pointDifference >= 0 ? '+' : ''}
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
                            {player.wins}-{player.losses}
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
          </div>

          <section className="panel recent-panel">
            <div className="panel-heading">
              <div>
                <h2>Recent results</h2>
                <p>
                  Showing latest {visibleSummaries.length} of {summaries.length}{' '}
                  saved games.
                </p>
              </div>
            </div>
            <div className="results-grid">
              {visibleSummaries.map((match) => (
                <article className="result-card" key={match.id}>
                  <div>
                    <strong>{match.week}</strong>
                    <span className="result-meta">{match.playedOn}</span>
                  </div>
                  <p>
                    <span
                      className={match.winner === 'A' ? 'winning-team' : undefined}
                    >
                      {playerName(match.teamA[0])} / {playerName(match.teamA[1])}
                    </span>
                    <b>
                      {match.scoreA}-{match.scoreB}
                    </b>
                    <span
                      className={match.winner === 'B' ? 'winning-team' : undefined}
                    >
                      {playerName(match.teamB[0])} / {playerName(match.teamB[1])}
                    </span>
                  </p>
                  <small>
                    Base {match.baseDelta.toFixed(3)} | Team A{' '}
                    {match.teamADelta >= 0 ? '+' : ''}
                    {match.teamADelta.toFixed(3)} | Team B{' '}
                    {match.teamBDelta >= 0 ? '+' : ''}
                    {match.teamBDelta.toFixed(3)}
                  </small>
                </article>
              ))}
            </div>
          </section>
        </>
      )}
    </main>
  )
}

function AdminPage({
  authForm,
  authError,
  canEdit,
  data,
  importCsv,
  importText,
  isSupabaseConfigured,
  matchError,
  matchForm,
  playerForm,
  resetSeedData,
  session,
  setAuthForm,
  setImportText,
  setMatchError,
  setMatchForm,
  setPlayerForm,
  signIn,
  signOut,
  addMatch,
  addPlayer,
  exportData,
}: {
  authForm: { email: string; password: string }
  authError: string
  canEdit: boolean
  data: AppData
  importCsv: () => void
  importText: string
  isSupabaseConfigured: boolean
  matchError: string
  matchForm: typeof emptyMatch
  playerForm: { name: string; skillLevel: string }
  resetSeedData: () => void
  session: Session | null
  setAuthForm: (value: { email: string; password: string }) => void
  setImportText: (value: string) => void
  setMatchError: (value: string) => void
  setMatchForm: (value: typeof emptyMatch) => void
  setPlayerForm: (value: { name: string; skillLevel: string }) => void
  signIn: (event: FormEvent<HTMLFormElement>) => void
  signOut: () => void
  addMatch: (event: FormEvent<HTMLFormElement>) => void
  addPlayer: (event: FormEvent<HTMLFormElement>) => void
  exportData: () => void
}) {
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

      <div className="admin-grid">
        <section className="panel">
          <div className="panel-heading">
            <div>
              <h2>Add weekly game</h2>
              <p>Four different players, doubles format.</p>
            </div>
          </div>
          <form className="form-grid" onSubmit={addMatch}>
            <label>
              Week
              <input
                value={matchForm.week}
                onChange={(event) =>
                  setMatchForm({ ...matchForm, week: event.target.value })
                }
              />
            </label>
            <label>
              Date
              <input
                type="date"
                value={matchForm.playedOn}
                onChange={(event) =>
                  setMatchForm({ ...matchForm, playedOn: event.target.value })
                }
              />
            </label>
            <fieldset>
              <legend>Team A</legend>
              <PlayerSelect
                players={data.players}
                value={matchForm.teamA1}
                excludeIds={[matchForm.teamA2, matchForm.teamB1, matchForm.teamB2]}
                onChange={(value) => {
                  setMatchForm({ ...matchForm, teamA1: value })
                  setMatchError('')
                }}
              />
              <PlayerSelect
                players={data.players}
                value={matchForm.teamA2}
                excludeIds={[matchForm.teamA1, matchForm.teamB1, matchForm.teamB2]}
                onChange={(value) => {
                  setMatchForm({ ...matchForm, teamA2: value })
                  setMatchError('')
                }}
              />
            </fieldset>
            <fieldset>
              <legend>Team B</legend>
              <PlayerSelect
                players={data.players}
                value={matchForm.teamB1}
                excludeIds={[matchForm.teamA1, matchForm.teamA2, matchForm.teamB2]}
                onChange={(value) => {
                  setMatchForm({ ...matchForm, teamB1: value })
                  setMatchError('')
                }}
              />
              <PlayerSelect
                players={data.players}
                value={matchForm.teamB2}
                excludeIds={[matchForm.teamA1, matchForm.teamA2, matchForm.teamB1]}
                onChange={(value) => {
                  setMatchForm({ ...matchForm, teamB2: value })
                  setMatchError('')
                }}
              />
            </fieldset>
            <label>
              Team A score
              <input
                type="number"
                min="0"
                value={matchForm.scoreA}
                onChange={(event) =>
                  setMatchForm({ ...matchForm, scoreA: event.target.value })
                }
              />
            </label>
            <label>
              Team B score
              <input
                type="number"
                min="0"
                value={matchForm.scoreB}
                onChange={(event) =>
                  setMatchForm({ ...matchForm, scoreB: event.target.value })
                }
              />
            </label>
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

        <section className="panel">
          <div className="panel-heading">
            <div>
              <h2>Import previous weeks</h2>
              <p>CSV: week,date,A1,A2,B1,B2,scoreA,scoreB</p>
            </div>
          </div>
          <textarea
            rows={4}
            value={importText}
            placeholder="Week 1,2026-05-21,Ava,Ben,Cara,Dan,11,7"
            onChange={(event) => setImportText(event.target.value)}
          />
          <button
            type="button"
            className="ghost-button full-width"
            onClick={importCsv}
            disabled={!canEdit}
          >
            <Upload size={16} />
            Import scores
          </button>
        </section>

        <section className="panel">
          <div className="panel-heading">
            <div>
              <h2>Maintenance</h2>
              <p>Backup or reset the Cardiff seed data.</p>
            </div>
          </div>
          <div className="admin-actions">
            <button type="button" className="ghost-button" onClick={exportData}>
              Export backup
            </button>
            <button
              type="button"
              className="ghost-button danger"
              onClick={resetSeedData}
              disabled={!canEdit}
            >
              Reset Cardiff data
            </button>
          </div>
        </section>
      </div>
    </section>
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
