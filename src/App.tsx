'use client'

import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import { AppFooter, AppHeader } from './components/AppShell'
import { ConfirmDialog } from './components/ConfirmDialog'
import { NoticeBanner } from './components/NoticeBanner'
import { OverallLeaderboard } from './components/OverallLeaderboard'

// Code-split the admin tools and the non-default tabs so the initial (public,
// overall-leaderboard) load doesn't ship them. Each chunk loads on first view.
const AdminPage = lazy(() =>
  import('./components/AdminPage').then((m) => ({ default: m.AdminPage })),
)
const PlayersPanel = lazy(() =>
  import('./components/PlayersPanel').then((m) => ({ default: m.PlayersPanel })),
)
const RatingExplainer = lazy(() =>
  import('./components/RatingExplainer').then((m) => ({ default: m.RatingExplainer })),
)
const WeeklyView = lazy(() =>
  import('./components/WeeklyView').then((m) => ({ default: m.WeeklyView })),
)
import {
  checkIsAdmin,
  exportDataSnapshot,
  formatPlayedOnDate,
  formatResultsLabel,
  isSupabaseConfigured,
  latestPlayedOn,
  loadLocalData,
  loadRemoteData,
  makeId,
  matchToDb,
  parseImportedData,
  playerToDb,
  saveLocalData,
} from './lib/data'
import {
  buildStandings,
  buildWeekOptions,
  buildWeeklyPlayerGames,
  buildWeeklyStandings,
  sortStandings,
  sortWeeklyStandings,
} from './lib/standings'
import { reportClientEvent } from './lib/monitoring'
import {
  navigateTo,
  parsePathRoute,
  parseRoute,
  type AppRoute,
  type PublicTab,
} from './lib/routing'
import { supabase } from './lib/supabase'
import type { AppData, Match, MatchFormState, Player, SortDirection, SortKey, WeeklySortKey } from './lib/types'
import type { Session } from '@supabase/supabase-js'

const THEME_STORAGE_KEY = 'pickleranker-theme'
const PINNED_PLAYER_STORAGE_KEY = 'pickleranker-pinned-player'
const ADMIN_USERNAME = 'ben'
const ADMIN_AUTH_EMAIL = 'ben@pickleranker.local'

const emptyMatch: MatchFormState = {
  playedOn: new Date().toISOString().slice(0, 10),
  teamA1: '',
  teamA2: '',
  teamB1: '',
  teamB2: '',
  scoreA: '0',
  scoreB: '0',
}

type ConfirmAction =
  | { type: 'delete-match'; id: string }
  | { type: 'save-edited-match'; match: Match; previousMatchId: string }

function readPinnedPlayerId(): string | null {
  if (typeof localStorage === 'undefined') return null
  return localStorage.getItem(PINNED_PLAYER_STORAGE_KEY)
}

// The optional round/court columns may be missing on older databases. Detect that
// specific case precisely — Postgres "undefined_column" is 42703 and PostgREST
// surfaces a stale schema cache as PGRST204 — so an unrelated error that merely
// mentions a "round" or a player named "Court" can never trigger the blind
// whole-day delete / metadata-strip fallbacks.
function isMissingColumnError(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false
  if (error.code === '42703' || error.code === 'PGRST204') return true
  return /column\b[^.]*\b(round|court|updated_at)\b[^.]*does not exist/i.test(error.message ?? '')
}

function stripOptionalMatchMetadata(row: ReturnType<typeof matchToDb>) {
  const stripped = { ...row }
  delete stripped.round
  delete stripped.court
  delete stripped.updated_at
  return stripped
}

function getInitialRoute(): AppRoute {
  if (typeof window === 'undefined') return { page: 'public', tab: 'overall' }
  if (window.location.hash) return parseRoute(window.location.hash)
  return parsePathRoute(window.location.pathname, window.location.search)
}

function App() {
  const initialRoute = getInitialRoute()
  // Always seed from the local cache (last server snapshot merged with seed
  // data) so the leaderboard paints instantly; the remote fetch then revalidates
  // it in the background.
  const [data, setData] = useState<AppData>(() => loadLocalData())
  const [route, setRoute] = useState<AppRoute>(initialRoute)
  const [theme, setTheme] = useState<'light' | 'dark'>(() =>
    localStorage.getItem(THEME_STORAGE_KEY) === 'dark' ? 'dark' : 'light',
  )
  const [session, setSession] = useState<Session | null>(null)
  const [isAdmin, setIsAdmin] = useState(false)
  const [authForm, setAuthForm] = useState({ username: '', password: '' })
  const [authError, setAuthError] = useState('')
  const [notice, setNotice] = useState('')
  const [loadState, setLoadState] = useState<'idle' | 'loading' | 'error'>(
    isSupabaseConfigured ? 'loading' : 'idle',
  )
  const [loadError, setLoadError] = useState('')
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null)
  const [selectedWeeklyPlayerId, setSelectedWeeklyPlayerId] = useState<string | null>(() =>
    initialRoute.page === 'public' && initialRoute.tab === 'weekly'
      ? (initialRoute.playerId ?? null)
      : null,
  )
  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(() =>
    initialRoute.page === 'public' && initialRoute.tab === 'players'
      ? (initialRoute.playerId ?? null)
      : null,
  )
  const [sort, setSort] = useState<{ key: SortKey; direction: SortDirection }>({
    key: 'rank',
    direction: 'asc',
  })
  const [weeklySort, setWeeklySort] = useState<{ key: WeeklySortKey; direction: SortDirection }>({
    key: 'rank',
    direction: 'asc',
  })
  const [matchForm, setMatchForm] = useState(emptyMatch)
  const [lastSavedMatchForm, setLastSavedMatchForm] = useState<MatchFormState | null>(null)
  const [editingMatchId, setEditingMatchId] = useState<string | null>(null)
  const [matchError, setMatchError] = useState('')
  const [playerForm, setPlayerForm] = useState({ name: '', skillLevel: '3.0' })
  const [search, setSearch] = useState('')
  const [minimumGames, setMinimumGames] = useState(10)
  const [weeklySearch, setWeeklySearch] = useState('')
  const [selectedWeek, setSelectedWeek] = useState(() =>
    initialRoute.page === 'public' ? (initialRoute.week ?? '') : '',
  )
  const [pinnedPlayerId, setPinnedPlayerId] = useState<string | null>(readPinnedPlayerId)
  const [confirmAction, setConfirmAction] = useState<ConfirmAction | null>(null)
  const [savingAction, setSavingAction] = useState<string | null>(null)

  const canEdit = !isSupabaseConfigured || isAdmin
  const isAdminPage = route.page === 'admin'
  const activeTab: PublicTab = route.page === 'public' ? route.tab : 'overall'

  const refreshRemoteData = useCallback(async (message?: string) => {
    if (!supabase) return
    setLoadState('loading')
    setLoadError('')
    try {
      const remoteData = await loadRemoteData()
      setData(remoteData)
      setLoadState('idle')
      setLastSyncedAt(new Date().toISOString())
      if (message) setNotice(message)
    } catch (error) {
      const text = error instanceof Error ? error.message : 'Could not load data.'
      reportClientEvent('remote-data-refresh-failed', error)
      setLoadError(text)
      setLoadState('error')
      // We still have cached data on screen, so keep the message low-key.
      setNotice('Couldn’t reach the server — showing saved data.')
    }
  }, [])

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    localStorage.setItem(THEME_STORAGE_KEY, theme)
  }, [theme])

  useEffect(() => {
    const readRoute = () =>
      setRoute(
        window.location.hash
          ? parseRoute(window.location.hash)
          : parsePathRoute(window.location.pathname, window.location.search),
      )
    const onHashChange = () => readRoute()
    const onPopState = () => readRoute()
    window.addEventListener('hashchange', onHashChange)
    window.addEventListener('popstate', onPopState)
    return () => {
      window.removeEventListener('hashchange', onHashChange)
      window.removeEventListener('popstate', onPopState)
    }
  }, [])

  useEffect(() => {
    if (route.page !== 'public') return
    if (route.tab === 'players' && route.playerId) setSelectedPlayerId(route.playerId)
    if (route.tab === 'weekly') {
      if (route.playerId) setSelectedWeeklyPlayerId(route.playerId)
      if (route.week) setSelectedWeek(route.week)
    }
  }, [route])

  useEffect(() => {
    if (!notice) return
    const timer = window.setTimeout(() => setNotice(''), 5000)
    return () => window.clearTimeout(timer)
  }, [notice])

  useEffect(() => {
    if (pinnedPlayerId) {
      localStorage.setItem(PINNED_PLAYER_STORAGE_KEY, pinnedPlayerId)
    } else {
      localStorage.removeItem(PINNED_PLAYER_STORAGE_KEY)
    }
  }, [pinnedPlayerId])

  useEffect(() => {
    const client = supabase
    if (!client) return

    let cancelled = false

    const syncAdmin = (nextSession: Session | null) => {
      if (!nextSession) {
        setIsAdmin(false)
        return
      }
      void checkIsAdmin().then((admin) => {
        if (!cancelled) setIsAdmin(admin)
      })
    }

    client.auth.getSession().then(({ data: authData }) => {
      if (cancelled) return
      setSession(authData.session)
      syncAdmin(authData.session)
    })

    const { data: listener } = client.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession)
      syncAdmin(nextSession)
    })

    void loadRemoteData()
      .then((remoteData) => {
        if (cancelled) return
        setData(remoteData)
        setLoadState('idle')
        setLastSyncedAt(new Date().toISOString())
      })
      .catch((error: unknown) => {
        if (cancelled) return
        const text = error instanceof Error ? error.message : 'Could not load data.'
        reportClientEvent('remote-data-load-failed', error)
        setLoadError(text)
        setLoadState('error')
        // The cached leaderboard is already showing, so don't alarm the user.
        setNotice('Couldn’t reach the server — showing saved data.')
      })

    const channel = client
      .channel('pickleranker-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'matches' }, () => {
        void refreshRemoteData()
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'players' }, () => {
        void refreshRemoteData()
      })
      .subscribe()

    return () => {
      cancelled = true
      listener.subscription.unsubscribe()
      void client.removeChannel(channel)
    }
  }, [refreshRemoteData])

  const applyData = useCallback((nextData: AppData, message: string) => {
    if (!isSupabaseConfigured) saveLocalData(nextData)
    setData(nextData)
    setNotice(message)
  }, [])

  const weeklySnapshots = useMemo(() => data.weeklySnapshots ?? [], [data.weeklySnapshots])
  const { standings, summaries } = useMemo(() => buildStandings(data), [data])
  const weekOptions = useMemo(
    () => buildWeekOptions(summaries, weeklySnapshots),
    [summaries, weeklySnapshots],
  )
  const activeWeek = selectedWeek || weekOptions[0]?.key || ''
  const latestWeekKey = weekOptions[0]?.key ?? ''
  const latestWeekStandings = useMemo(
    () =>
      latestWeekKey
        ? buildWeeklyStandings(
            latestWeekKey,
            summaries,
            data.players,
            data.matches,
            weeklySnapshots,
          )
        : [],
    [latestWeekKey, summaries, data.players, data.matches, weeklySnapshots],
  )
  const mostImprovedPlayer = useMemo(() => {
    const activePlayers = latestWeekStandings.filter((player) => player.games > 0)
    if (activePlayers.length === 0) return null
    return activePlayers.reduce((best, player) => (player.change > best.change ? player : best))
  }, [latestWeekStandings])
  const averageRating = useMemo(() => {
    if (standings.length === 0) return 0
    return standings.reduce((total, player) => total + player.rating, 0) / standings.length
  }, [standings])
  const weeklyStandings = useMemo(
    () =>
      buildWeeklyStandings(
        activeWeek,
        summaries,
        data.players,
        data.matches,
        weeklySnapshots,
      ).filter((player) => player.games > 0),
    [activeWeek, summaries, data.players, data.matches, weeklySnapshots],
  )
  const weeklySearchPlayers = useMemo(
    () => weeklyStandings.map((player) => ({ id: player.playerId, name: player.name })),
    [weeklyStandings],
  )
  const rankByPlayerId = useMemo(
    () => new Map(standings.map((player, index) => [player.id, index + 1])),
    [standings],
  )
  const standingByPlayerId = useMemo(
    () => new Map(standings.map((player) => [player.id, player])),
    [standings],
  )
  const rankMovementByPlayerId = useMemo(() => {
    const previousSnapshot = weeklySnapshots.at(-1)
    if (!previousSnapshot) return new Map<string, number>()

    const previousRankByPlayerId = new Map(
      previousSnapshot.players.map((player) => [player.playerId, player.rank]),
    )

    return new Map(
      standings.map((player, index) => {
        const currentRank = index + 1
        const previousRank = previousRankByPlayerId.get(player.id)
        return [player.id, previousRank ? previousRank - currentRank : 0]
      }),
    )
  }, [standings, weeklySnapshots])
  const sortedStandings = useMemo(
    () => sortStandings(standings, sort.key, sort.direction),
    [sort, standings],
  )
  const filteredStandings = useMemo(() => {
    const query = search.trim().toLowerCase()
    return sortedStandings.filter((player) => {
      // An active name search takes precedence: a matching player is always shown,
      // even below the games threshold, so searching never hides an exact match.
      if (query) return player.name.toLowerCase().includes(query)
      return player.games >= minimumGames
    })
  }, [minimumGames, search, sortedStandings])
  const sortedWeeklyStandings = useMemo(
    () => sortWeeklyStandings(weeklyStandings, weeklySort.key, weeklySort.direction),
    [weeklyStandings, weeklySort],
  )
  const filteredWeeklyStandings = useMemo(() => {
    const query = weeklySearch.trim().toLowerCase()
    if (!query) return sortedWeeklyStandings
    return sortedWeeklyStandings.filter((player) => player.name.toLowerCase().includes(query))
  }, [weeklySearch, sortedWeeklyStandings])
  const routePlayerId = route.page === 'public' ? route.playerId : undefined
  const effectiveWeeklyPlayerId =
    selectedWeeklyPlayerId ?? routePlayerId ?? weeklyStandings[0]?.playerId ?? null
  const selectedWeeklyComputedPlayer = useMemo(
    () => weeklyStandings.find((player) => player.playerId === effectiveWeeklyPlayerId),
    [effectiveWeeklyPlayerId, weeklyStandings],
  )
  const selectedWeeklyPlayerName = useMemo(
    () =>
      selectedWeeklyComputedPlayer?.name ??
      standingByPlayerId.get(effectiveWeeklyPlayerId ?? '')?.name ??
      '',
    [effectiveWeeklyPlayerId, selectedWeeklyComputedPlayer?.name, standingByPlayerId],
  )
  const weeklyPlayerGames = useMemo(
    () =>
      effectiveWeeklyPlayerId
        ? buildWeeklyPlayerGames(
            effectiveWeeklyPlayerId,
            activeWeek,
            data.matches,
            data.players,
            weeklySnapshots,
          )
        : [],
    [activeWeek, data.matches, data.players, effectiveWeeklyPlayerId, weeklySnapshots],
  )
  const recentMatches = useMemo(
    () => [...data.matches].sort((a, b) => b.playedOn.localeCompare(a.playedOn) || b.id.localeCompare(a.id)),
    [data.matches],
  )
  const playerNameById = useMemo(
    () => new Map(data.players.map((player) => [player.id, player.name])),
    [data.players],
  )
  const lastUpdated = formatPlayedOnDate(latestPlayedOn(data.matches))

  const goToTab = useCallback(
    (tab: PublicTab, options?: { playerId?: string; week?: string }) => {
      if (tab === 'overall') setSort({ key: 'rank', direction: 'asc' })
      if (tab === 'weekly') setWeeklySort({ key: 'rank', direction: 'asc' })
      navigateTo({ page: 'public', tab, playerId: options?.playerId, week: options?.week })
    },
    [],
  )

  const openPlayerProfile = useCallback(
    (playerId: string) => {
      setSelectedPlayerId(playerId)
      goToTab('players', { playerId })
    },
    [goToTab],
  )

  const selectWeeklyPlayer = useCallback(
    (playerId: string) => {
      setSelectedWeeklyPlayerId(playerId)
      navigateTo({
        page: 'public',
        tab: 'weekly',
        playerId,
        week: activeWeek || undefined,
      })
    },
    [activeWeek],
  )

  const openWeeklyWeek = useCallback((playerId: string, week: string) => {
    setSelectedWeeklyPlayerId(playerId)
    setSelectedWeek(week)
    setWeeklySort({ key: 'rank', direction: 'asc' })
    navigateTo({
      page: 'public',
      tab: 'weekly',
      playerId,
      week,
    })
  }, [])

  function requireAdmin() {
    if (canEdit) return true
    setNotice('Admin login required to update games.')
    return false
  }

  async function signIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!supabase) return
    setAuthError('')
    const username = authForm.username.trim().toLowerCase()
    if (username !== ADMIN_USERNAME) {
      setAuthError('Invalid username or password.')
      return
    }
    const { error } = await supabase.auth.signInWithPassword({
      email: ADMIN_AUTH_EMAIL,
      password: authForm.password,
    })
    if (error) {
      setAuthError('Invalid username or password.')
      return
    }
    setAuthForm({ username: '', password: '' })
    const admin = await checkIsAdmin()
    setIsAdmin(admin)
    setNotice(admin ? 'Admin signed in.' : 'Signed in, but this account is not an admin.')
  }

  async function signOut() {
    if (!supabase) return
    setIsAdmin(false)
    setSession(null)
    setNotice('Signed out.')
    const { error } = await supabase.auth.signOut({ scope: 'local' })
    if (error) {
      reportClientEvent('admin_sign_out_failed', { message: error.message })
    }
  }

  async function addPlayer(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!requireAdmin()) return
    const name = playerForm.name.trim()
    const skillLevel = Number(playerForm.skillLevel)
    if (!name || Number.isNaN(skillLevel)) return

    setSavingAction('player')
    try {
      const player: Player = { id: makeId('p'), name, skillLevel }

      if (supabase) {
        const { error } = await supabase.from('players').insert(playerToDb(player))
        if (error) {
          reportClientEvent('player-save-failed', error, { name })
          setNotice(error.message)
          return
        }
      }

      applyData({ ...data, players: [...data.players, player] }, `${name} added at ${skillLevel.toFixed(1)}.`)
      setPlayerForm({ name: '', skillLevel: '3.0' })
    } finally {
      setSavingAction(null)
    }
  }

  function exportLocalBackup() {
    const blob = new Blob([exportDataSnapshot(data)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `pickleranker-backup-${new Date().toISOString().slice(0, 10)}.json`
    anchor.click()
    URL.revokeObjectURL(url)
    setNotice('Backup downloaded.')
  }

  function importLocalBackup(file: File) {
    const reader = new FileReader()
    reader.onload = () => {
      const result = parseImportedData(String(reader.result ?? ''))
      if ('error' in result) {
        setNotice(result.error)
        return
      }
      applyData(result, 'Backup imported on this device.')
    }
    reader.readAsText(file)
  }

  function validateMatchForm() {
    const playerIds = [matchForm.teamA1, matchForm.teamA2, matchForm.teamB1, matchForm.teamB2]
    const scoreA = Number(matchForm.scoreA)
    const scoreB = Number(matchForm.scoreB)

    if (playerIds.some((id) => !id)) {
      setMatchError('Pick all four players before saving.')
      return null
    }
    if (new Set(playerIds).size !== 4) {
      setMatchError('Each player can only appear once in a game.')
      return null
    }
    if (!matchForm.playedOn) {
      setMatchError('Pick a date before saving.')
      return null
    }
    if (scoreA < 0 || scoreB < 0) {
      setMatchError('Scores cannot be negative.')
      return null
    }
    if (scoreA === scoreB) {
      setMatchError('Scores must be different.')
      return null
    }
    setMatchError('')

    let winningTeamA: [string, string] = [matchForm.teamA1, matchForm.teamA2]
    let losingTeamB: [string, string] = [matchForm.teamB1, matchForm.teamB2]
    let winningScore = scoreA
    let losingScore = scoreB

    if (scoreB > scoreA) {
      winningTeamA = [matchForm.teamB1, matchForm.teamB2]
      losingTeamB = [matchForm.teamA1, matchForm.teamA2]
      winningScore = scoreB
      losingScore = scoreA
    }

    return {
      playerIds,
      teamA: winningTeamA,
      teamB: losingTeamB,
      scoreA: winningScore,
      scoreB: losingScore,
    }
  }

  async function persistMatch(match: Match, previousMatchId: string | null) {
    setSavingAction('match')
    try {
      if (supabase) {
        const row = matchToDb(match)
        let { error } = previousMatchId
          ? await supabase.from('matches').update(row).eq('id', previousMatchId)
          : await supabase.from('matches').insert(row)
        if (isMissingColumnError(error)) {
          const stripped = stripOptionalMatchMetadata(row)
          ;({ error } = previousMatchId
            ? await supabase.from('matches').update(stripped).eq('id', previousMatchId)
            : await supabase.from('matches').insert(stripped))
        }
        if (error) {
          reportClientEvent('match-save-failed', error, { previousMatchId: previousMatchId ?? 'new' })
          setMatchError(error.message)
          return
        }
      }

      const nextMatches = previousMatchId
        ? data.matches.map((existing) => (existing.id === previousMatchId ? match : existing))
        : [...data.matches, match]

      applyData(
        { ...data, matches: nextMatches },
        previousMatchId ? `${match.week} updated.` : `${match.week} score saved.`,
      )
      setLastSavedMatchForm({ ...matchForm })
      setEditingMatchId(null)
      setMatchForm((current) => ({ ...emptyMatch, playedOn: current.playedOn }))
    } finally {
      setSavingAction(null)
    }
  }

  async function saveMatch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!requireAdmin()) return
    const validated = validateMatchForm()
    if (!validated) return

    const match: Match = {
      id: editingMatchId ?? makeId('m'),
      week: formatResultsLabel(matchForm.playedOn),
      playedOn: matchForm.playedOn,
      teamA: validated.teamA,
      teamB: validated.teamB,
      scoreA: validated.scoreA,
      scoreB: validated.scoreB,
      ...(editingMatchId ? { updatedAt: new Date().toISOString() } : {}),
    }

    if (editingMatchId) {
      setConfirmAction({ type: 'save-edited-match', match, previousMatchId: editingMatchId })
      return
    }

    await persistMatch(match, null)
  }

  function startEditMatch(match: Match) {
    setEditingMatchId(match.id)
    setMatchError('')
    setMatchForm({
      playedOn: match.playedOn,
      teamA1: match.teamA[0],
      teamA2: match.teamA[1],
      teamB1: match.teamB[0],
      teamB2: match.teamB[1],
      scoreA: String(match.scoreA),
      scoreB: String(match.scoreB),
    })
  }

  function cancelEditMatch() {
    setEditingMatchId(null)
    setMatchError('')
    setMatchForm(emptyMatch)
  }

  function requestDeleteMatch(matchId: string) {
    if (!requireAdmin()) return
    setConfirmAction({ type: 'delete-match', id: matchId })
  }

  async function deleteMatch(matchId: string) {
    if (!requireAdmin()) return

    setSavingAction('delete-match')
    try {
      if (supabase) {
        const { error } = await supabase.from('matches').delete().eq('id', matchId)
        if (error) {
          reportClientEvent('match-delete-failed', error, { matchId })
          setNotice(error.message)
          return
        }
      }

      if (editingMatchId === matchId) cancelEditMatch()
      applyData(
        { ...data, matches: data.matches.filter((match) => match.id !== matchId) },
        'Game deleted.',
      )
    } finally {
      setSavingAction(null)
    }
  }

  async function handleConfirmAction() {
    if (!confirmAction) return
    const action = confirmAction
    setConfirmAction(null)
    if (action.type === 'delete-match') await deleteMatch(action.id)
    if (action.type === 'save-edited-match') {
      await persistMatch(action.match, action.previousMatchId)
    }
  }

  async function saveTournamentRound(newMatches: Match[]) {
    if (!requireAdmin()) return false

    const message = `${newMatches.length} tournament games saved to the leaderboard.`
    // A tournament owns its day's results, so replace any tournament matches
    // already saved for that date. This keeps the leaderboard in sync with the
    // final bracket (e.g. after swapping a player) instead of stacking
    // stale/duplicate rows from an earlier save. Only rows tagged with a round
    // are removed, so manually-entered games on the same day are left intact.
    const playedOnDates = [...new Set(newMatches.map((match) => match.playedOn))]

    if (supabase) {
      if (playedOnDates.length > 0) {
        // Scope the replace to tournament-originated rows (round is set). Older
        // DBs without the round column can't make that distinction, so fall
        // back to replacing the whole day there.
        // Caveat: tournament rows saved before the round column existed are
        // stored with round=null and are indistinguishable from manual games, so
        // re-finishing such a tournament after the column was added leaves the old
        // null-round copies behind (double-counting). Those legacy rows need a
        // one-time manual cleanup; nothing here can tell them apart safely.
        let { error: deleteError } = await supabase
          .from('matches')
          .delete()
          .in('played_on', playedOnDates)
          .not('round', 'is', null)
        if (isMissingColumnError(deleteError)) {
          ;({ error: deleteError } = await supabase
            .from('matches')
            .delete()
            .in('played_on', playedOnDates))
        }
        if (deleteError) {
          reportClientEvent('tournament-replace-failed', deleteError)
          setNotice(deleteError.message)
          return false
        }
      }
      const rows = newMatches.map(matchToDb)
      let { error } = await supabase.from('matches').insert(rows)
      // The round/court columns are optional (older DBs may not have them yet).
      // If they're missing, retry without that metadata so saving still works.
      if (isMissingColumnError(error)) {
        const stripped = rows.map(stripOptionalMatchMetadata)
        ;({ error } = await supabase.from('matches').insert(stripped))
      }
      if (error) {
        reportClientEvent('tournament-save-failed', error)
        setNotice(error.message)
        return false
      }
      // Re-pull authoritative data so the leaderboard, weekly and players views
      // (and the local cache) all reflect the new results.
      await refreshRemoteData(message)
      return true
    }

    // Mirror the remote behaviour: only drop this date's tournament rows (round
    // is set), leaving manually-entered games for the same day in place.
    const kept = data.matches.filter(
      (match) => !(playedOnDates.includes(match.playedOn) && match.round != null),
    )
    applyData({ ...data, matches: [...kept, ...newMatches] }, message)
    return true
  }

  const toggleSort = useCallback((key: SortKey) => {
    setSort((current) => ({
      key,
      direction: current.key === key && current.direction === 'asc' ? 'desc' : 'asc',
    }))
  }, [])

  const toggleWeeklySort = useCallback((key: WeeklySortKey) => {
    setWeeklySort((current) => ({
      key,
      direction: current.key === key && current.direction === 'asc' ? 'desc' : 'asc',
    }))
  }, [])

  // Stable callbacks/objects so the memoized view components don't re-render on
  // unrelated parent updates (e.g. the auto-dismiss notice timer).
  const toggleTheme = useCallback(
    () => setTheme((current) => (current === 'dark' ? 'light' : 'dark')),
    [],
  )
  const goToAdminFromLogo = useCallback(() => {
    navigateTo({ page: 'admin' })
  }, [])
  const handlePlayersSelect = useCallback((playerId: string) => {
    setSelectedPlayerId(playerId)
    navigateTo({ page: 'public', tab: 'players', playerId })
  }, [])
  const handleWeeklyWeekChange = useCallback((week: string) => {
    setSelectedWeek(week)
    setWeeklySort({ key: 'rank', direction: 'asc' })
    setSelectedWeeklyPlayerId(null)
    navigateTo({ page: 'public', tab: 'weekly', week })
  }, [])
  const mostImprovedSummary = useMemo(
    () =>
      mostImprovedPlayer
        ? { name: mostImprovedPlayer.name, change: mostImprovedPlayer.change }
        : null,
    [mostImprovedPlayer],
  )

  const confirmDialog = confirmAction
    ? confirmAction.type === 'delete-match'
      ? {
          title: 'Delete this game?',
          message: 'Ratings will be recalculated for everyone who played in it.',
          confirmLabel: 'Delete game',
          danger: true,
        }
      : {
          title: 'Save edited game?',
          message: 'This will update the saved result and recalculate affected ratings.',
          confirmLabel: 'Save changes',
          danger: false,
        }
    : null

  return (
    <main className="app-shell">
      <a href="#main-content" className="skip-link">
        Skip to content
      </a>
      <NoticeBanner message={notice} onDismiss={() => setNotice('')} />
      <ConfirmDialog
        open={Boolean(confirmAction)}
        title={confirmDialog?.title ?? ''}
        message={confirmDialog?.message ?? ''}
        confirmLabel={confirmDialog?.confirmLabel}
        danger={confirmDialog?.danger}
        onConfirm={() => void handleConfirmAction()}
        onCancel={() => setConfirmAction(null)}
      />
      {!isSupabaseConfigured ? (
        <div className="dev-mode-banner" role="status">
          <strong>Development mode.</strong> Scores save only in this browser. Set up Supabase and
          deploy env vars so everyone sees the same leaderboard.
        </div>
      ) : null}

      <AppHeader
        isAdminPage={isAdminPage}
        activeTab={activeTab}
        theme={theme}
        onTabChange={goToTab}
        onThemeToggle={toggleTheme}
        lastSyncedAt={lastSyncedAt}
        isLoading={loadState === 'loading' && isSupabaseConfigured}
        hasVisibleData={data.players.length > 0}
        onLogoLongPress={goToAdminFromLogo}
      />

      {loadState === 'loading' && isSupabaseConfigured && data.players.length === 0 ? (
        <div className="load-banner">Loading leaderboard…</div>
      ) : null}
      {loadState === 'error' && data.players.length === 0 ? (
        <div className="load-banner error">
          <span>{loadError}</span>
          <button type="button" className="ghost-button" onClick={() => refreshRemoteData()}>
            Retry
          </button>
        </div>
      ) : null}

      <div id="main-content">
        <Suspense fallback={<div className="load-banner">Loading…</div>}>
        {isAdminPage ? (
          <AdminPage
            authForm={authForm}
            authError={authError}
            canEdit={canEdit}
            data={data}
            editingMatchId={editingMatchId}
            isAdmin={isAdmin}
            isSupabaseConfigured={isSupabaseConfigured}
            matchError={matchError}
            matchForm={matchForm}
            playerForm={playerForm}
            playerNameById={playerNameById}
            recentMatches={recentMatches}
            savingAction={savingAction}
            session={session}
            standings={standings}
            saveTournamentRound={saveTournamentRound}
            setAuthForm={setAuthForm}
            setMatchError={setMatchError}
            setMatchForm={setMatchForm}
            setPlayerForm={setPlayerForm}
            signIn={signIn}
            signOut={signOut}
            addPlayer={addPlayer}
            exportLocalBackup={exportLocalBackup}
            importLocalBackup={importLocalBackup}
            saveMatch={saveMatch}
            cancelEditMatch={cancelEditMatch}
            startEditMatch={startEditMatch}
            requestDeleteMatch={requestDeleteMatch}
            lastSavedMatchForm={lastSavedMatchForm}
          />
        ) : (
          <div className="public-dashboard">
            {activeTab === 'how-4dr' ? (
              <RatingExplainer />
            ) : activeTab === 'overall' ? (
              <OverallLeaderboard
                standings={standings}
                sortedStandings={sortedStandings}
                filteredStandings={filteredStandings}
                rankByPlayerId={rankByPlayerId}
                standingByPlayerId={standingByPlayerId}
                search={search}
                onSearchChange={setSearch}
                minimumGames={minimumGames}
                onMinimumGamesChange={setMinimumGames}
                onPlayerSelect={openPlayerProfile}
                pinnedPlayerId={pinnedPlayerId}
                onPinPlayer={setPinnedPlayerId}
                sort={sort}
                onToggleSort={toggleSort}
                rankMovementByPlayerId={rankMovementByPlayerId}
                playerCount={data.players.length}
                matchCount={data.matches.length}
                averageRating={averageRating}
                mostImprovedPlayer={mostImprovedSummary}
                lastUpdated={lastUpdated}
              />
            ) : activeTab === 'weekly' ? (
              <WeeklyView
                weekOptions={weekOptions}
                activeWeek={activeWeek}
                onWeekChange={handleWeeklyWeekChange}
                weeklySearch={weeklySearch}
                onWeeklySearchChange={setWeeklySearch}
                weeklySearchPlayers={weeklySearchPlayers}
                onSelectPlayer={selectWeeklyPlayer}
                filteredWeeklyStandings={filteredWeeklyStandings}
                effectiveWeeklyPlayerId={effectiveWeeklyPlayerId}
                weeklySort={weeklySort}
                onToggleWeeklySort={toggleWeeklySort}
                selectedWeeklyPlayerName={selectedWeeklyPlayerName}
                selectedWeeklyComputedPlayer={selectedWeeklyComputedPlayer}
                weeklyPlayerGames={weeklyPlayerGames}
              />
            ) : (
              <PlayersPanel
                data={data}
                standings={standings}
                rankByPlayerId={rankByPlayerId}
                selectedPlayerId={selectedPlayerId}
                onSelectPlayer={handlePlayersSelect}
                onOpenWeeklyWeek={openWeeklyWeek}
              />
            )}
          </div>
        )}
        </Suspense>
      </div>

      {!isAdminPage ? <AppFooter /> : null}
    </main>
  )
}

export default App
