import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { FormEvent } from 'react'
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
import { ConfirmDialog } from './components/ConfirmDialog'
import { NoticeBanner } from './components/NoticeBanner'
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
  playerHasMatches,
  playerToDb,
  saveLocalData,
} from './lib/data'
import {
  buildPlayerWeekPoints,
  buildStandings,
  buildWeekOptions,
  buildWeeklyPlayerGames,
  buildWeeklyStandings,
  DEFAULT_RATING,
  sortStandings,
} from './lib/standings'
import { formatRating, roundRating } from './lib/scoring'
import { supabase } from './lib/supabase'
import type {
  AppData,
  Match,
  MatchFormState,
  Player,
  PlayerStanding,
  PlayerWeekPoint,
  SortDirection,
  SortKey,
  WeeklyPlayerGame,
  WeeklyStanding,
} from './lib/types'
import type { Session } from '@supabase/supabase-js'

const THEME_STORAGE_KEY = 'pickleranker-theme'
const LEADERBOARD_COLUMN_COUNT = 8
const ADMIN_USERNAME = 'ben'
const ADMIN_AUTH_EMAIL = 'ben@pickleranker.local'
const PUBLIC_REFRESH_MS = 60_000

type ConfirmAction =
  | { type: 'match'; id: string }
  | { type: 'player'; id: string; name: string }

const emptyMatch: MatchFormState = {
  playedOn: new Date().toISOString().slice(0, 10),
  teamA1: '',
  teamA2: '',
  teamB1: '',
  teamB2: '',
  scoreA: '11',
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
  const [activePublicTab, setActivePublicTab] = useState<'overall' | 'weekly'>('overall')
  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(null)
  const [selectedWeeklyPlayerId, setSelectedWeeklyPlayerId] = useState<string | null>(null)
  const [sort, setSort] = useState<{ key: SortKey; direction: SortDirection }>({
    key: 'rank',
    direction: 'asc',
  })
  const [matchForm, setMatchForm] = useState(emptyMatch)
  const [editingMatchId, setEditingMatchId] = useState<string | null>(null)
  const [matchError, setMatchError] = useState('')
  const [playerForm, setPlayerForm] = useState({ name: '', skillLevel: '3.0' })
  const [editingPlayerId, setEditingPlayerId] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [weeklySearch, setWeeklySearch] = useState('')
  const [selectedWeek, setSelectedWeek] = useState('')
  const [confirmAction, setConfirmAction] = useState<ConfirmAction | null>(null)
  const [savingAction, setSavingAction] = useState<string | null>(null)

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
    () => buildWeeklyStandings(activeWeek, summaries, data.players, weeklySnapshots),
    [activeWeek, summaries, data.players, weeklySnapshots],
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
  const filteredWeeklyStandings = useMemo(() => {
    const query = weeklySearch.trim().toLowerCase()
    if (!query) return weeklyStandings
    return weeklyStandings.filter((player) => player.name.toLowerCase().includes(query))
  }, [weeklySearch, weeklyStandings])
  const weeklyPlayerGames = useMemo(
    () =>
      selectedWeeklyPlayerId
        ? buildWeeklyPlayerGames(
            selectedWeeklyPlayerId,
            activeWeek,
            data.matches,
            data.players,
            weeklySnapshots,
          )
        : [],
    [activeWeek, data.matches, data.players, selectedWeeklyPlayerId, weeklySnapshots],
  )
  const selectedWeeklyComputedPlayer = weeklyStandings.find(
    (player) => player.playerId === selectedWeeklyPlayerId,
  )
  const selectedWeeklyPlayerName =
    selectedWeeklyComputedPlayer?.name ??
    standings.find((player) => player.id === selectedWeeklyPlayerId)?.name ??
    ''
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
      if (editingPlayerId) {
        const existing = data.players.find((player) => player.id === editingPlayerId)
        if (!existing) return

        const updated: Player = { ...existing, name, skillLevel }

        if (supabase) {
          const { error } = await supabase
            .from('players')
            .update(playerToDb(updated))
            .eq('id', editingPlayerId)
          if (error) {
            setNotice(error.message)
            return
          }
        }

        applyData(
          {
            ...data,
            players: data.players.map((player) =>
              player.id === editingPlayerId ? updated : player,
            ),
          },
          `${name} updated.`,
        )
        setEditingPlayerId(null)
        setPlayerForm({ name: '', skillLevel: '3.0' })
        return
      }

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

  function startEditPlayer(player: Player) {
    setEditingPlayerId(player.id)
    setPlayerForm({ name: player.name, skillLevel: String(player.skillLevel) })
  }

  function cancelEditPlayer() {
    setEditingPlayerId(null)
    setPlayerForm({ name: '', skillLevel: '3.0' })
  }

  function requestDeletePlayer(playerId: string) {
    const player = data.players.find((entry) => entry.id === playerId)
    if (!player) return
    if (playerHasMatches(playerId, data.matches)) {
      setNotice(`${player.name} still has saved games and cannot be deleted.`)
      return
    }
    setConfirmAction({ type: 'player', id: playerId, name: player.name })
  }

  async function deletePlayer(playerId: string) {
    if (!requireAdmin()) return

    setSavingAction('delete-player')
    try {
      if (supabase) {
        const { error } = await supabase.from('players').delete().eq('id', playerId)
        if (error) {
          setNotice(error.message)
          return
        }
      }

      if (editingPlayerId === playerId) cancelEditPlayer()
      applyData(
        { ...data, players: data.players.filter((player) => player.id !== playerId) },
        'Player removed.',
      )
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
    if (scoreA <= scoreB) {
      setMatchError('Winner score must be higher than loser score.')
      return null
    }
    setMatchError('')
    return { playerIds, scoreA, scoreB }
  }

  async function saveMatch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!requireAdmin()) return
    const validated = validateMatchForm()
    if (!validated) return

    setSavingAction('match')
    try {
    const match: Match = {
      id: editingMatchId ?? makeId('m'),
      week: formatResultsLabel(matchForm.playedOn),
      playedOn: matchForm.playedOn,
      teamA: [matchForm.teamA1, matchForm.teamA2],
      teamB: [matchForm.teamB1, matchForm.teamB2],
      scoreA: validated.scoreA,
      scoreB: validated.scoreB,
    }

    if (supabase) {
      const { error } = editingMatchId
        ? await supabase.from('matches').update(matchToDb(match)).eq('id', editingMatchId)
        : await supabase.from('matches').insert(matchToDb(match))
      if (error) {
        setMatchError(error.message)
        return
      }
    }

    const nextMatches = editingMatchId
      ? data.matches.map((existing) => (existing.id === editingMatchId ? match : existing))
      : [...data.matches, match]

    applyData(
      { ...data, matches: nextMatches },
      editingMatchId ? `${match.week} updated.` : `${match.week} score saved.`,
    )
    setEditingMatchId(null)
    setMatchForm((current) => ({ ...emptyMatch, playedOn: current.playedOn }))
    } finally {
      setSavingAction(null)
    }
  }

  function startEditMatch(match: Match) {
    setEditingMatchId(match.id)
    setMatchError('')
    document
      .querySelector('.match-entry-panel')
      ?.scrollIntoView({ behavior: 'smooth', block: 'start' })
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
    setConfirmAction({ type: 'match', id: matchId })
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
    if (action.type === 'match') await deleteMatch(action.id)
    if (action.type === 'player') await deletePlayer(action.id)
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

  const confirmDialog =
    confirmAction?.type === 'match'
      ? {
          title: 'Delete this game?',
          message: 'Ratings will be recalculated for everyone who played in it.',
          confirmLabel: 'Delete game',
        }
      : confirmAction?.type === 'player'
        ? {
            title: `Remove ${confirmAction.name}?`,
            message: 'This only works when the player has no saved games.',
            confirmLabel: 'Remove player',
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
        danger
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
          ) : null}
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
          editingPlayerId={editingPlayerId}
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
          cancelEditPlayer={cancelEditPlayer}
          exportLocalBackup={exportLocalBackup}
          importLocalBackup={importLocalBackup}
          requestDeletePlayer={requestDeletePlayer}
          saveMatch={saveMatch}
          cancelEditMatch={cancelEditMatch}
          startEditMatch={startEditMatch}
          startEditPlayer={startEditPlayer}
          requestDeleteMatch={requestDeleteMatch}
        />
      ) : (
        <div className="public-dashboard">
          <RatingExplainer />
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

          {activePublicTab === 'overall' ? (
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
                      const isSelected = selectedPlayerId === player.id
                      const playerWeeks = isSelected
                        ? buildPlayerWeekPoints(player.id, summaries, weeklySnapshots)
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
          ) : (
            <div className="weekly-workspace">
              <section className="panel weekly-panel">
                <div className="panel-heading weekly-heading">
                  <div>
                    <h2>Weekly leaderboard</h2>
                    <p>Players ranked by 4DR points gained in the selected week.</p>
                  </div>
                  <div className="weekly-heading-controls">
                    <label className="search-control weekly-search">
                      <Search size={18} />
                      <input
                        type="search"
                        placeholder="Search players..."
                        value={weeklySearch}
                        onChange={(event) => setWeeklySearch(event.target.value)}
                        aria-label="Search weekly players"
                      />
                    </label>
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
                </div>
                <div className="table-wrap">
                  <table className="weekly-table">
                    <thead>
                      <tr>
                        <th>Rank</th>
                        <th>Player</th>
                        <th>Weekly +/-</th>
                        <th>Diff</th>
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
                              selectedWeeklyPlayerId === player.playerId ? 'selected-row' : ''
                            }
                            tabIndex={0}
                            onClick={() => setSelectedWeeklyPlayerId(player.playerId)}
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
                                {player.games} game{player.games === 1 ? '' : 's'} | point{' '}
                                {pointDifference >= 0 ? '+' : ''}
                                {pointDifference}
                              </span>
                            </td>
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
                          <td colSpan={4} className="empty-table">
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

              <WeeklyPlayerDetail
                games={weeklyPlayerGames}
                playerName={selectedWeeklyPlayerName}
                computedPlayer={selectedWeeklyComputedPlayer}
              />
            </div>
          )}
          <footer className="public-footer">
            <a className="footer-admin-link" href="#/admin">
              Admin
            </a>
          </footer>
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
  editingPlayerId,
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
  cancelEditPlayer,
  exportLocalBackup,
  importLocalBackup,
  requestDeletePlayer,
  saveMatch,
  cancelEditMatch,
  startEditMatch,
  startEditPlayer,
  requestDeleteMatch,
}: {
  authForm: { username: string; password: string }
  authError: string
  canEdit: boolean
  data: AppData
  editingMatchId: string | null
  editingPlayerId: string | null
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
  cancelEditPlayer: () => void
  exportLocalBackup: () => void
  importLocalBackup: (file: File) => void
  requestDeletePlayer: (playerId: string) => void
  saveMatch: (event: FormEvent<HTMLFormElement>) => void
  cancelEditMatch: () => void
  startEditMatch: (match: Match) => void
  startEditPlayer: (player: Player) => void
  requestDeleteMatch: (matchId: string) => void
}) {
  const [adminTab, setAdminTab] = useState<'games' | 'tournament' | 'recent'>('games')
  const [expandedWeeks, setExpandedWeeks] = useState<Set<string>>(new Set())
  const importInputRef = useRef<HTMLInputElement>(null)
  const sortedPlayers = useMemo(
    () => [...data.players].sort((a, b) => a.name.localeCompare(b.name)),
    [data.players],
  )

  const updateMatchForm = (next: Partial<MatchFormState>) => {
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
                  ? isAdmin
                    ? 'Signed in as admin. Updates save online.'
                    : 'Signed in, but this account is not listed as an admin.'
                  : 'Sign in with username ben to update games and players.'
                : 'Development mode — scores save only in this browser until Supabase is configured.'}
            </p>
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
              <input
                type="text"
                placeholder="Username"
                autoComplete="username"
                value={authForm.username}
                onChange={(event) => setAuthForm({ ...authForm, username: event.target.value })}
              />
              <input
                type="password"
                placeholder="Password"
                autoComplete="current-password"
                value={authForm.password}
                onChange={(event) => setAuthForm({ ...authForm, password: event.target.value })}
              />
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
            <div className="panel-heading match-entry-heading">
              <div>
                <h2>{editingMatchId ? 'Edit game' : 'Add weekly game'}</h2>
                <p>Enter winners first, then losers and the final score.</p>
              </div>
            </div>
            <form className="game-entry-form" onSubmit={saveMatch}>
              <div className="game-entry-row">
                <label>
                  Date
                  <input
                    type="date"
                    required
                    value={matchForm.playedOn}
                    onChange={(event) => updateMatchForm({ playedOn: event.target.value })}
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
                      onChange={(event) => updateMatchForm({ scoreA: event.target.value })}
                    />
                  </label>
                  <label>
                    Losers score
                    <input
                      type="number"
                      min="0"
                      value={matchForm.scoreB}
                      onChange={(event) => updateMatchForm({ scoreB: event.target.value })}
                    />
                  </label>
                </div>
              </section>

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
                <h2>{editingPlayerId ? 'Edit player' : 'Add player'}</h2>
                <p>New players start from their skill level.</p>
              </div>
            </div>
            <form className="inline-form" onSubmit={addPlayer}>
              <input
                placeholder="Player name"
                value={playerForm.name}
                onChange={(event) => setPlayerForm({ ...playerForm, name: event.target.value })}
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
                aria-label={editingPlayerId ? 'Save player' : 'Add player'}
                disabled={savingAction === 'player'}
              >
                {editingPlayerId ? <Save size={18} /> : <Plus size={18} />}
              </button>
              {editingPlayerId ? (
                <button type="button" className="ghost-button" onClick={cancelEditPlayer}>
                  Cancel
                </button>
              ) : null}
            </form>
            <div className="players-list">
              {sortedPlayers.map((player) => {
                const hasGames = playerHasMatches(player.id, data.matches)
                return (
                  <div
                    className={editingPlayerId === player.id ? 'player-row editing' : 'player-row'}
                    key={player.id}
                  >
                    <div>
                      <strong>{player.name}</strong>
                      <span>{player.skillLevel.toFixed(1)} skill</span>
                    </div>
                    <div className="player-row-actions">
                      <button
                        type="button"
                        className="icon-button"
                        aria-label={`Edit ${player.name}`}
                        onClick={() => startEditPlayer(player)}
                      >
                        <Pencil size={16} />
                      </button>
                      <button
                        type="button"
                        className="icon-button danger"
                        aria-label={`Remove ${player.name}`}
                        disabled={hasGames}
                        title={
                          hasGames ? 'Remove all of this player’s games before deleting them.' : undefined
                        }
                        onClick={() => requestDeletePlayer(player.id)}
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>
                )
              })}
              {sortedPlayers.length === 0 ? (
                <p className="empty-table">No players yet.</p>
              ) : null}
            </div>
          </section>

        </div>
      ) : null}

      {canEdit && adminTab === 'recent' ? (
        <section className="panel recent-games-panel">
          <div className="panel-heading">
            <div>
              <h2>Recent games</h2>
              <p>Edit or delete saved games grouped by week.</p>
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
                                        onClick={() => startEditMatch(match)}
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
  games,
  playerName,
  computedPlayer,
}: {
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
          isActive ? (activeSort.direction === 'asc' ? 'ascending' : 'descending') : 'none'
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
            {player.wins}W – {player.losses}L across {player.games} games
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

  const W = 340
  const H = 178
  const PX = 10
  const PT = 14
  const PB = 28
  const chartW = W - PX * 2
  const chartH = H - PT - PB

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
  const linePath = pts
    .map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`)
    .join(' ')
  const floorY = py(minR - pad)
  const areaPath = `${linePath} L${pts.at(-1)!.x.toFixed(1)},${floorY.toFixed(1)} L${pts[0].x.toFixed(1)},${floorY.toFixed(1)} Z`
  const baselineY = py(DEFAULT_RATING)

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
