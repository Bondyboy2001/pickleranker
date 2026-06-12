import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { FormEvent, Ref } from 'react'
import {
  CalendarDays,
  ChevronDown,
  ChevronUp,
  Download,
  LineChart,
  LogIn,
  LogOut,
  Moon,
  Pencil,
  Plus,
  Save,
  Search,
  Sun,
  Trash2,
  Trophy,
  Upload,
} from 'lucide-react'
import './App.css'
import { AdminField, FieldInput } from './components/AdminField'
import { ConfirmDialog } from './components/ConfirmDialog'
import { NoticeBanner } from './components/NoticeBanner'
import { PlayerAutocomplete } from './components/PlayerAutocomplete'
import { PlayersPanel } from './components/PlayersPanel'
import { RatingExplainer } from './components/RatingExplainer'
import { TournamentPanel } from './components/TournamentPanel'
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
import { formatRating, roundRating } from './lib/scoring'
import { supabase } from './lib/supabase'
import type {
  AppData,
  Match,
  MatchFormState,
  Player,
  PlayerStanding,
  SortDirection,
  SortKey,
  WeeklyPlayerGame,
  WeeklySortKey,
  WeeklyStanding,
} from './lib/types'
import type { Session } from '@supabase/supabase-js'

const THEME_STORAGE_KEY = 'pickleranker-theme'
const LEADERBOARD_COLUMN_COUNT = 8
const ADMIN_USERNAME = 'ben'
const ADMIN_AUTH_EMAIL = 'ben@pickleranker.local'
const PUBLIC_REFRESH_MS = 60_000

type ConfirmAction =
  | { type: 'delete-match'; id: string }
  | { type: 'save-edited-match'; match: Match; previousMatchId: string }
type PublicTab = 'overall' | 'weekly' | 'players' | 'how-4dr'

const emptyMatch: MatchFormState = {
  playedOn: new Date().toISOString().slice(0, 10),
  teamA1: '',
  teamA2: '',
  teamB1: '',
  teamB2: '',
  scoreA: '0',
  scoreB: '0',
}

function formatWinRate(wins: number, games: number) {
  if (games === 0) return '0.0%'
  return `${((wins / games) * 100).toFixed(1)}%`
}

function movementClass(value: number) {
  if (value > 0) return 'movement positive'
  if (value < 0) return 'movement negative'
  return 'movement'
}

function App() {
  const [data, setData] = useState<AppData>(() =>
    isSupabaseConfigured ? { players: [], matches: [] } : loadLocalData(),
  )
  const [route, setRoute] = useState(() => window.location.hash || '#/')
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
  const [activePublicTab, setActivePublicTab] = useState<PublicTab>('overall')
  const [selectedWeeklyPlayerId, setSelectedWeeklyPlayerId] = useState<string | null>(null)
  const [sort, setSort] = useState<{ key: SortKey; direction: SortDirection }>({
    key: 'rank',
    direction: 'asc',
  })
  const [weeklySort, setWeeklySort] = useState<{ key: WeeklySortKey; direction: SortDirection }>({
    key: 'rank',
    direction: 'asc',
  })
  const [matchForm, setMatchForm] = useState(emptyMatch)
  const [editingMatchId, setEditingMatchId] = useState<string | null>(null)
  const [matchError, setMatchError] = useState('')
  const [playerForm, setPlayerForm] = useState({ name: '', skillLevel: '3.0' })
  const [search, setSearch] = useState('')
  const [weeklySearch, setWeeklySearch] = useState('')
  const [selectedWeek, setSelectedWeek] = useState('')
  const [confirmAction, setConfirmAction] = useState<ConfirmAction | null>(null)
  const [savingAction, setSavingAction] = useState<string | null>(null)
  const weeklyDetailRef = useRef<HTMLElement | null>(null)

  const canEdit = !isSupabaseConfigured || isAdmin

  const refreshRemoteData = useCallback(async (message?: string) => {
    if (!supabase) return
    setLoadState('loading')
    setLoadError('')
    try {
      const remoteData = await loadRemoteData()
      setData(remoteData)
      setLoadState('idle')
      if (message) setNotice(message)
    } catch (error) {
      const text = error instanceof Error ? error.message : 'Could not load data.'
      setLoadError(text)
      setLoadState('error')
      setNotice(text)
    }
  }, [])

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
    if (!notice) return
    const timer = window.setTimeout(() => setNotice(''), 5000)
    return () => window.clearTimeout(timer)
  }, [notice])

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
      })
      .catch((error: unknown) => {
        if (cancelled) return
        const text = error instanceof Error ? error.message : 'Could not load data.'
        setLoadError(text)
        setLoadState('error')
        setNotice(text)
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

  useEffect(() => {
    if (!supabase || route === '#/admin') return
    const pollTimer = window.setInterval(() => {
      void refreshRemoteData()
    }, PUBLIC_REFRESH_MS)
    return () => window.clearInterval(pollTimer)
  }, [refreshRemoteData, route])

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
  const averageRating = useMemo(() => {
    if (standings.length === 0) return 0
    return standings.reduce((total, player) => total + player.rating, 0) / standings.length
  }, [standings])
  const weeklyStandings = useMemo(
    () => buildWeeklyStandings(activeWeek, summaries, data.players, data.matches, weeklySnapshots),
    [activeWeek, summaries, data.players, data.matches, weeklySnapshots],
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
    return sortedStandings.filter((player) => player.name.toLowerCase().includes(query))
  }, [search, sortedStandings])
  const sortedWeeklyStandings = useMemo(
    () => sortWeeklyStandings(weeklyStandings, weeklySort.key, weeklySort.direction),
    [weeklyStandings, weeklySort],
  )
  const weeklyRankByPlayerId = useMemo(
    () =>
      new Map(
        [...weeklyStandings]
          .sort(
            (a, b) =>
              b.rating - a.rating ||
              b.change - a.change ||
              b.wins - a.wins ||
              a.name.localeCompare(b.name),
          )
          .map((player, index) => [player.playerId, index + 1]),
      ),
    [weeklyStandings],
  )
  const filteredWeeklyStandings = useMemo(() => {
    const query = weeklySearch.trim().toLowerCase()
    if (!query) return sortedWeeklyStandings
    return sortedWeeklyStandings.filter((player) => player.name.toLowerCase().includes(query))
  }, [weeklySearch, sortedWeeklyStandings])
  const effectiveWeeklyPlayerId = selectedWeeklyPlayerId ?? weeklyStandings[0]?.playerId ?? null
  const selectedWeeklyComputedPlayer = useMemo(
    () => weeklyStandings.find((player) => player.playerId === effectiveWeeklyPlayerId),
    [effectiveWeeklyPlayerId, weeklyStandings],
  )
  const selectedWeeklyPlayerName = useMemo(
    () =>
      selectedWeeklyComputedPlayer?.name ??
      standings.find((player) => player.id === effectiveWeeklyPlayerId)?.name ??
      '',
    [effectiveWeeklyPlayerId, selectedWeeklyComputedPlayer?.name, standings],
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
    await supabase.auth.signOut()
    setIsAdmin(false)
    setNotice('Signed out.')
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
        const { error } = previousMatchId
          ? await supabase.from('matches').update(matchToDb(match)).eq('id', previousMatchId)
          : await supabase.from('matches').insert(matchToDb(match))
        if (error) {
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

    if (supabase) {
      const { error } = await supabase.from('matches').insert(newMatches.map(matchToDb))
      if (error) {
        setNotice(error.message)
        return false
      }
    }

    applyData(
      { ...data, matches: [...data.matches, ...newMatches] },
      `${newMatches.length} tournament games saved to the leaderboard.`,
    )
    return true
  }

  function toggleSort(key: SortKey) {
    setSort((current) => ({
      key,
      direction: current.key === key && current.direction === 'asc' ? 'desc' : 'asc',
    }))
  }

  function toggleWeeklySort(key: WeeklySortKey) {
    setWeeklySort((current) => ({
      key,
      direction: current.key === key && current.direction === 'asc' ? 'desc' : 'asc',
    }))
  }

  function selectWeeklyPlayer(playerId: string) {
    setSelectedWeeklyPlayerId(playerId)
    if (!window.matchMedia('(max-width: 680px)').matches) return

    window.requestAnimationFrame(() => {
      weeklyDetailRef.current?.scrollIntoView({
        behavior: 'smooth',
        block: 'start',
      })
    })
  }

  function selectPublicTab(tab: PublicTab) {
    setActivePublicTab(tab)
    if (tab === 'overall') {
      setSort({ key: 'rank', direction: 'asc' })
    }
    if (tab === 'weekly') {
      setWeeklySort({ key: 'rank', direction: 'asc' })
    }
  }

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

      <header className="topbar">
        <div className="brand-lockup">
          <img
            className="brand-logo"
            src="/david-lloyd-pickleball-logo.png"
            alt="David Lloyd Clubs Pickleball"
          />
        </div>
        <div className="topbar-actions">
          {route !== '#/admin' ? (
            <div className="view-tabs header-tabs" role="tablist" aria-label="Leaderboard views">
              <button
                type="button"
                className={activePublicTab === 'overall' ? 'active' : ''}
                onClick={() => selectPublicTab('overall')}
              >
                Overall
              </button>
              <button
                type="button"
                className={activePublicTab === 'weekly' ? 'active' : ''}
                onClick={() => selectPublicTab('weekly')}
              >
                Weekly
              </button>
              <button
                type="button"
                className={activePublicTab === 'players' ? 'active' : ''}
                onClick={() => selectPublicTab('players')}
              >
                Players
              </button>
              <button
                type="button"
                className={activePublicTab === 'how-4dr' ? 'active' : ''}
                onClick={() => selectPublicTab('how-4dr')}
              >
                How 4DR works
              </button>
            </div>
          ) : null}
          <button
            type="button"
            className="theme-toggle"
            onClick={() => setTheme((current) => (current === 'dark' ? 'light' : 'dark'))}
            aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
            title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
          >
            {theme === 'dark' ? <Sun size={17} /> : <Moon size={17} />}
          </button>
          {route === '#/admin' ? (
            <a className="ghost-link admin-link" href="#/">
              View public site
            </a>
          ) : (
            <a className="ghost-link admin-link" href="#/admin">
              Admin
            </a>
          )}
        </div>
      </header>

      {loadState === 'loading' && isSupabaseConfigured ? (
        <div className="load-banner">Loading leaderboard…</div>
      ) : null}
      {loadState === 'error' ? (
        <div className="load-banner error">
          <span>{loadError}</span>
          <button type="button" className="ghost-button" onClick={() => refreshRemoteData()}>
            Retry
          </button>
        </div>
      ) : null}

      {route === '#/admin' ? (
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
        />
      ) : (
        <div className="public-dashboard">
          {activePublicTab === 'how-4dr' ? (
            <RatingExplainer />
          ) : (
            <>
          {activePublicTab === 'overall' && (
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
                  <strong>{lastUpdated}</strong>
                  <small>{data.matches.length} saved games</small>
                </div>
              </div>
            </section>
          )}

          {activePublicTab === 'overall' && (
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
              </div>
              <div className="table-wrap leaderboard-table-wrap">
                <table className="leaderboard-table">
                  <thead>
                    <tr>
                      <SortableHeader label="#" sortKey="rank" activeSort={sort} onSort={toggleSort} />
                      <SortableHeader label="Player" sortKey="player" activeSort={sort} onSort={toggleSort} />
                      <SortableHeader label="4DR" sortKey="rating" activeSort={sort} onSort={toggleSort} />
                      <SortableHeader label="Wins" sortKey="wins" activeSort={sort} onSort={toggleSort} />
                      <SortableHeader label="Losses" sortKey="losses" activeSort={sort} onSort={toggleSort} />
                      <SortableHeader label="Games" sortKey="games" activeSort={sort} onSort={toggleSort} />
                      <SortableHeader label="Point" sortKey="pointDiff" activeSort={sort} onSort={toggleSort} />
                      <SortableHeader label="Win %" sortKey="record" activeSort={sort} onSort={toggleSort} />
                    </tr>
                  </thead>
                  <tbody>
                    {filteredStandings.map((player) => {
                      const rank = rankByPlayerId.get(player.id) ?? 0
                      return (
                        <tr key={player.id}>
                          <td
                            data-rank={rank}
                            className={`rank-cell rank-pos-${rank <= 3 ? rank : 'other'}`}
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
                          <td className="rating-cell">{formatRating(player.rating)}</td>
                          <td>{player.wins}</td>
                          <td>{player.losses}</td>
                          <td>{player.games}</td>
                          <td>
                            {player.pointsFor - player.pointsAgainst >= 0 ? '+' : ''}
                            {player.pointsFor - player.pointsAgainst}
                          </td>
                          <td>{formatWinRate(player.wins, player.games)}</td>
                        </tr>
                      )
                    })}
                    {filteredStandings.length === 0 ? (
                      <tr>
                        <td colSpan={LEADERBOARD_COLUMN_COUNT} className="empty-table">
                          {data.players.length === 0
                            ? 'No players yet. Add players from the admin page.'
                            : `No players match "${search.trim()}".`}
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            </section>
          )}
          {activePublicTab === 'weekly' && (
            <div className="weekly-workspace">
              <section className="panel weekly-panel weekly-controls-panel">
                <div className="panel-heading weekly-heading">
                  <label className="search-control weekly-search">
                    <Search size={18} />
                    <input
                      type="search"
                      placeholder="Search players..."
                      value={weeklySearch}
                      onChange={(event) => setWeeklySearch(event.target.value)}
                      aria-label="Search weekly players"
                      list="weekly-player-search-options"
                    />
                    <datalist id="weekly-player-search-options">
                      {weeklyStandings.map((player) => (
                        <option key={player.playerId} value={player.name} />
                      ))}
                    </datalist>
                  </label>
                  <select
                    className="week-select"
                    value={activeWeek}
                    onChange={(event) => {
                      setSelectedWeek(event.target.value)
                      setWeeklySort({ key: 'rank', direction: 'asc' })
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
              </section>

              <WeeklyPlayerDetail
                detailRef={weeklyDetailRef}
                games={weeklyPlayerGames}
                playerName={selectedWeeklyPlayerName}
                computedPlayer={selectedWeeklyComputedPlayer}
              />

              <section className="panel weekly-panel weekly-table-panel">
                <div className="table-wrap">
                  <table className="weekly-table">
                    <thead>
                      <tr>
                        <SortableHeader
                          label="Rank"
                          sortKey="rank"
                          activeSort={weeklySort}
                          onSort={toggleWeeklySort}
                        />
                        <SortableHeader
                          label="Player"
                          sortKey="player"
                          activeSort={weeklySort}
                          onSort={toggleWeeklySort}
                        />
                        <SortableHeader
                          label="4DR"
                          sortKey="rating"
                          activeSort={weeklySort}
                          onSort={toggleWeeklySort}
                        />
                        <SortableHeader
                          label="Weekly +/-"
                          sortKey="weeklyChange"
                          activeSort={weeklySort}
                          onSort={toggleWeeklySort}
                        />
                        <SortableHeader
                          label="Diff"
                          sortKey="recordDiff"
                          activeSort={weeklySort}
                          onSort={toggleWeeklySort}
                        />
                      </tr>
                    </thead>
                    <tbody>
                      {filteredWeeklyStandings.map((player, index) => {
                        const pointDifference = player.pointsFor - player.pointsAgainst
                        const recordDifference = player.wins - player.losses
                        return (
                          <tr
                            key={player.playerId}
                            className={
                              effectiveWeeklyPlayerId === player.playerId ? 'selected-row' : ''
                            }
                            tabIndex={0}
                            onClick={() => selectWeeklyPlayer(player.playerId)}
                            onKeyDown={(event) => {
                              if (event.key === 'Enter' || event.key === ' ') {
                                event.preventDefault()
                                selectWeeklyPlayer(player.playerId)
                              }
                            }}
                          >
                            <td className="rank-cell">
                              {weeklyRankByPlayerId.get(player.playerId) ?? index + 1}
                            </td>
                            <td>
                              <strong>{player.name}</strong>
                              <span>
                                {player.games} game{player.games === 1 ? '' : 's'} | point{' '}
                                {pointDifference >= 0 ? '+' : ''}
                                {pointDifference}
                              </span>
                            </td>
                            <td className="rating-cell">{formatRating(player.rating)}</td>
                            <td>
                              <span className={movementClass(player.change)}>
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
                      {filteredWeeklyStandings.length === 0 ? (
                        <tr>
                          <td colSpan={5} className="empty-table">
                            {weekOptions.length === 0
                              ? 'No games recorded yet.'
                              : weeklySearch.trim()
                                ? `No players match "${weeklySearch.trim()}".`
                                : 'No games found for this week.'}
                          </td>
                        </tr>
                      ) : null}
                    </tbody>
                  </table>
                </div>
              </section>
            </div>
          )}
          {activePublicTab === 'players' && (
            <PlayersPanel
              data={data}
              standings={standings}
              rankByPlayerId={rankByPlayerId}
            />
          )}
            </>
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
  editingMatchId,
  isAdmin,
  isSupabaseConfigured,
  matchError,
  matchForm,
  playerForm,
  playerNameById,
  recentMatches,
  savingAction,
  session,
  standings,
  saveTournamentRound,
  setAuthForm,
  setMatchError,
  setMatchForm,
  setPlayerForm,
  signIn,
  signOut,
  addPlayer,
  exportLocalBackup,
  importLocalBackup,
  saveMatch,
  cancelEditMatch,
  startEditMatch,
  requestDeleteMatch,
}: {
  authForm: { username: string; password: string }
  authError: string
  canEdit: boolean
  data: AppData
  editingMatchId: string | null
  isAdmin: boolean
  isSupabaseConfigured: boolean
  matchError: string
  matchForm: MatchFormState
  playerForm: { name: string; skillLevel: string }
  playerNameById: Map<string, string>
  recentMatches: Match[]
  savingAction: string | null
  session: Session | null
  standings: PlayerStanding[]
  saveTournamentRound: (matches: Match[]) => Promise<boolean>
  setAuthForm: (value: { username: string; password: string }) => void
  setMatchError: (value: string) => void
  setMatchForm: (value: MatchFormState) => void
  setPlayerForm: (value: { name: string; skillLevel: string }) => void
  signIn: (event: FormEvent<HTMLFormElement>) => void
  signOut: () => void
  addPlayer: (event: FormEvent<HTMLFormElement>) => void
  exportLocalBackup: () => void
  importLocalBackup: (file: File) => void
  saveMatch: (event: FormEvent<HTMLFormElement>) => void
  cancelEditMatch: () => void
  startEditMatch: (match: Match) => void
  requestDeleteMatch: (matchId: string) => void
}) {
  const [adminTab, setAdminTab] = useState<'games' | 'tournament' | 'recent'>('games')
  const [expandedWeeks, setExpandedWeeks] = useState<Set<string>>(new Set())
  const importInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (adminTab !== 'games' || !editingMatchId) return
    document
      .querySelector('.match-entry-panel')
      ?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [adminTab, editingMatchId])

  function editRecentMatch(match: Match) {
    startEditMatch(match)
    setAdminTab('games')
  }

  const updateMatchForm = (next: Partial<MatchFormState>) => {
    setMatchForm({ ...matchForm, ...next })
    setMatchError('')
  }

  const loginStatus = !isSupabaseConfigured
    ? 'Development mode — scores save only in this browser until Supabase is configured.'
    : session
      ? isAdmin
        ? 'Signed in as admin. Updates save online.'
        : 'Signed in, but this account is not listed as an admin.'
      : ''

  return (
    <section className="admin-page">
      <section className="panel login-panel">
        <div className="panel-heading">
          <div>
            <h2>Admin Login</h2>
            {loginStatus ? <p>{loginStatus}</p> : null}
          </div>
        </div>
        {isSupabaseConfigured ? (
          session ? (
            <div className="admin-status">
              <span>{isAdmin ? ADMIN_USERNAME : session.user.email}</span>
              <button type="button" className="ghost-button" onClick={signOut}>
                <LogOut size={16} />
                Sign out
              </button>
            </div>
          ) : (
            <form className="admin-form" onSubmit={signIn}>
              <AdminField label="Username">
                <FieldInput
                  type="text"
                  placeholder="Username"
                  autoComplete="username"
                  value={authForm.username}
                  onChange={(event) => setAuthForm({ ...authForm, username: event.target.value })}
                />
              </AdminField>
              <AdminField label="Password">
                <FieldInput
                  type="password"
                  placeholder="Password"
                  autoComplete="current-password"
                  value={authForm.password}
                  onChange={(event) => setAuthForm({ ...authForm, password: event.target.value })}
                />
              </AdminField>
              {authError ? <p className="form-error">{authError}</p> : null}
              <button type="submit" className="primary-button">
                <LogIn size={16} />
                Sign in
              </button>
            </form>
          )
        ) : (
          <div className="local-admin-tools">
            <div className="admin-status">
              <span>Local editing is active on this device only. Export a backup before clearing browser data.</span>
            </div>
            <div className="local-data-actions">
              <button type="button" className="ghost-button" onClick={exportLocalBackup}>
                <Download size={16} />
                Export backup
              </button>
              <button
                type="button"
                className="ghost-button"
                onClick={() => importInputRef.current?.click()}
              >
                <Upload size={16} />
                Import backup
              </button>
              <input
                ref={importInputRef}
                type="file"
                accept="application/json,.json"
                hidden
                onChange={(event) => {
                  const file = event.target.files?.[0]
                  if (file) importLocalBackup(file)
                  event.target.value = ''
                }}
              />
            </div>
          </div>
        )}
      </section>

      {canEdit ? (
        <div className="view-tabs admin-tabs" role="tablist" aria-label="Admin views">
          <button
            type="button"
            className={adminTab === 'games' ? 'active' : ''}
            onClick={() => setAdminTab('games')}
          >
            Score entry
          </button>
          <button
            type="button"
            className={adminTab === 'tournament' ? 'active' : ''}
            onClick={() => setAdminTab('tournament')}
          >
            Tournament
          </button>
          <button
            type="button"
            className={adminTab === 'recent' ? 'active' : ''}
            onClick={() => setAdminTab('recent')}
          >
            Recent games
          </button>
        </div>
      ) : null}

      {canEdit && adminTab === 'tournament' ? (
        <TournamentPanel standings={standings} saveRoundMatches={saveTournamentRound} />
      ) : null}

      {canEdit && adminTab === 'games' ? (
        <div className="admin-grid">
          <section className="panel match-entry-panel">
            <div className="panel-heading">
              <div>
                <h2>{editingMatchId ? 'Edit game' : 'Add weekly game'}</h2>
              </div>
            </div>
            <form className="game-entry-form" onSubmit={saveMatch}>
              <AdminField label="Date">
                <FieldInput
                  type="date"
                  required
                  value={matchForm.playedOn}
                  onChange={(event) => updateMatchForm({ playedOn: event.target.value })}
                />
              </AdminField>

              <div className="pair-entry-grid">
                <div className="pair-entry">
                  <p className="pair-entry-title">Pair 1</p>
                  <PlayerAutocomplete
                    players={data.players}
                    value={matchForm.teamA1}
                    excludeIds={[matchForm.teamA2, matchForm.teamB1, matchForm.teamB2]}
                    onChange={(value) => updateMatchForm({ teamA1: value })}
                  />
                  <PlayerAutocomplete
                    players={data.players}
                    value={matchForm.teamA2}
                    excludeIds={[matchForm.teamA1, matchForm.teamB1, matchForm.teamB2]}
                    onChange={(value) => updateMatchForm({ teamA2: value })}
                  />
                </div>
                <div className="pair-entry">
                  <p className="pair-entry-title">Pair 2</p>
                  <PlayerAutocomplete
                    players={data.players}
                    value={matchForm.teamB1}
                    excludeIds={[matchForm.teamA1, matchForm.teamA2, matchForm.teamB2]}
                    onChange={(value) => updateMatchForm({ teamB1: value })}
                  />
                  <PlayerAutocomplete
                    players={data.players}
                    value={matchForm.teamB2}
                    excludeIds={[matchForm.teamA1, matchForm.teamA2, matchForm.teamB1]}
                    onChange={(value) => updateMatchForm({ teamB2: value })}
                  />
                </div>
              </div>

              <div className="score-inputs">
                <AdminField label="Pair 1 score">
                  <FieldInput
                    type="number"
                    min="0"
                    value={matchForm.scoreA}
                    onChange={(event) => updateMatchForm({ scoreA: event.target.value })}
                  />
                </AdminField>
                <AdminField label="Pair 2 score">
                  <FieldInput
                    type="number"
                    min="0"
                    value={matchForm.scoreB}
                    onChange={(event) => updateMatchForm({ scoreB: event.target.value })}
                  />
                </AdminField>
              </div>

              {matchError ? <p className="form-error">{matchError}</p> : null}
              <div className="form-actions">
                <button
                  type="submit"
                  className="primary-button"
                  disabled={savingAction === 'match'}
                >
                  <Save size={17} />
                  {savingAction === 'match'
                    ? 'Saving...'
                    : editingMatchId
                      ? 'Update game'
                      : 'Save game'}
                </button>
                {editingMatchId ? (
                  <button type="button" className="ghost-button" onClick={cancelEditMatch}>
                    Cancel edit
                  </button>
                ) : null}
              </div>
            </form>
          </section>

          <section className="panel players-panel">
            <div className="panel-heading">
              <div>
                <h2>Add player</h2>
              </div>
            </div>
            <form className="add-player-form" onSubmit={addPlayer}>
              <AdminField label="Player name" hideLabel>
                <FieldInput
                  placeholder="Player name"
                  value={playerForm.name}
                  onChange={(event) => setPlayerForm({ ...playerForm, name: event.target.value })}
                />
              </AdminField>
              <AdminField label="Starting rating" hideLabel>
                <FieldInput
                  type="number"
                  placeholder="3.0"
                  min="0"
                  step="0.1"
                  inputMode="decimal"
                  value={playerForm.skillLevel}
                  onChange={(event) =>
                    setPlayerForm({ ...playerForm, skillLevel: event.target.value })
                  }
                />
              </AdminField>
              <button
                type="submit"
                className="icon-button"
                aria-label="Add player"
                disabled={savingAction === 'player'}
              >
                <Plus size={18} />
              </button>
            </form>
          </section>

        </div>
      ) : null}

      {canEdit && adminTab === 'recent' ? (
        <section className="panel recent-games-panel">
          <div className="panel-heading">
            <div>
              <h2>Recent games</h2>
            </div>
          </div>
          <div className="recent-games-weeks">
            {recentMatches.length === 0 ? (
              <p className="empty-table">No games saved yet.</p>
            ) : (
              (() => {
                const weeks = new Map<string, Match[]>()
                recentMatches.forEach((match) => {
                  const list = weeks.get(match.week) ?? []
                  list.push(match)
                  weeks.set(match.week, list)
                })
                return [...weeks.entries()].map(([week, matches]) => {
                  const isOpen = expandedWeeks.has(week)
                  return (
                    <div className="week-subwindow" key={week}>
                      <button
                        type="button"
                        className="week-subwindow-header"
                        onClick={() =>
                          setExpandedWeeks((current) => {
                            const next = new Set(current)
                            if (next.has(week)) next.delete(week)
                            else next.add(week)
                            return next
                          })
                        }
                      >
                        <span className="week-title">{week}</span>
                        <span className="week-count">{matches.length} game{matches.length === 1 ? '' : 's'}</span>
                        {isOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                      </button>
                      {isOpen ? (
                        <div className="table-wrap">
                          <table className="recent-games-table">
                            <thead>
                              <tr>
                                <th>Winners</th>
                                <th>Losers</th>
                                <th>Score</th>
                                <th style={{ textAlign: 'right' }}>Actions</th>
                              </tr>
                            </thead>
                            <tbody>
                              {matches.map((match) => (
                                <tr
                                  key={match.id}
                                  className={editingMatchId === match.id ? 'editing' : ''}
                                >
                                  <td>
                                    {playerNameById.get(match.teamA[0]) ?? '?'} &amp;{' '}
                                    {playerNameById.get(match.teamA[1]) ?? '?'}
                                  </td>
                                  <td>
                                    {playerNameById.get(match.teamB[0]) ?? '?'} &amp;{' '}
                                    {playerNameById.get(match.teamB[1]) ?? '?'}
                                  </td>
                                  <td>
                                    <span className="score-badge">{match.scoreA}-{match.scoreB}</span>
                                  </td>
                                  <td style={{ textAlign: 'right' }}>
                                    <div className="recent-match-actions">
                                      <button
                                        type="button"
                                        className="icon-button"
                                        aria-label="Edit game"
                                        onClick={() => editRecentMatch(match)}
                                      >
                                        <Pencil size={16} />
                                      </button>
                                      <button
                                        type="button"
                                        className="icon-button danger"
                                        aria-label="Delete game"
                                        onClick={() => requestDeleteMatch(match.id)}
                                      >
                                        <Trash2 size={16} />
                                      </button>
                                    </div>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      ) : null}
                    </div>
                  )
                })
              })()
            )}
          </div>
        </section>
      ) : null}
    </section>
  )
}

function WeeklyPlayerDetail({
  detailRef,
  games,
  playerName,
  computedPlayer,
}: {
  detailRef: Ref<HTMLElement>
  games: WeeklyPlayerGame[]
  playerName: string
  computedPlayer?: WeeklyStanding
}) {
  const wins = games.filter((game) => game.result === 'Win').length
  const losses = games.length - wins
  const pointsFor = games.reduce(
    (total, game) => total + (game.selectedTeam === 'A' ? game.scoreA : game.scoreB),
    0,
  )
  const pointsAgainst = games.reduce(
    (total, game) => total + (game.selectedTeam === 'A' ? game.scoreB : game.scoreA),
    0,
  )
  const totalChange =
    computedPlayer?.change ?? roundRating(games.reduce((total, game) => total + game.ratingChange, 0))

  if (!playerName) {
    return (
      <aside ref={detailRef} className="panel weekly-detail-panel empty-weekly-detail">
        <h2>Weekly player overview</h2>
        <p>Select a player in the weekly leaderboard to see their games.</p>
      </aside>
    )
  }

  return (
    <aside ref={detailRef} className="panel weekly-detail-panel">
      <div className="weekly-detail-head">
        <div>
          <span className="eyebrow">Weekly player overview</span>
          <h2>{playerName}</h2>
          <p>
            {games.length} game{games.length === 1 ? '' : 's'} this week
          </p>
        </div>
        {computedPlayer ? (
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
          <strong className={totalChange >= 0 ? 'positive' : 'negative'}>
            {totalChange >= 0 ? '+' : ''}
            {totalChange.toFixed(3)}
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
        <span className={game.result === 'Win' ? 'result-win' : 'result-loss'}>{game.result}</span>
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
          {formatPercent(baseShare)} of 0.100 = {game.baseDelta.toFixed(3)} 4DR points
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
                  winnerTeam.some((winner) => winner.id === player.id) ? 'positive' : 'negative'
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
    <div className={`game-team ${isWinner ? 'winner' : 'loser'}`}>
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

function SortableHeader<T extends string>({
  label,
  sortKey,
  activeSort,
  onSort,
}: {
  label: string
  sortKey: T
  activeSort: { key: T; direction: SortDirection }
  onSort: (key: T) => void
}) {
  const isActive = activeSort.key === sortKey
  return (
    <th>
      <button
        type="button"
        className={isActive ? 'sort-button active' : 'sort-button'}
        onClick={() => onSort(sortKey)}
        aria-sort={
          isActive ? (activeSort.direction === 'asc' ? 'ascending' : 'descending') : 'none'
        }
      >
        {label}
        <span>{isActive ? (activeSort.direction === 'asc' ? '↑' : '↓') : '↕'}</span>
      </button>
    </th>
  )
}

export default App
