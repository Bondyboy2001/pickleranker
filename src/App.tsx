import { Fragment, useCallback, useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import {
  CalendarDays,
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
} from 'lucide-react'
import './App.css'
import { NoticeBanner } from './components/NoticeBanner'
import {
  checkIsAdmin,
  formatPlayedOnDate,
  formatResultsLabel,
  isSupabaseConfigured,
  latestPlayedOn,
  loadLocalData,
  loadRemoteData,
  makeId,
  matchToDb,
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
const LEADERBOARD_COLUMN_COUNT = 7
const ADMIN_USERNAME = 'ben'
const ADMIN_AUTH_EMAIL = 'ben@pickleranker.local'

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
  const [search, setSearch] = useState('')
  const [selectedWeek, setSelectedWeek] = useState('')

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
    if (!supabase) return

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

    supabase.auth.getSession().then(({ data: authData }) => {
      if (cancelled) return
      setSession(authData.session)
      syncAdmin(authData.session)
    })

    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
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

    return () => {
      cancelled = true
      listener.subscription.unsubscribe()
    }
  }, [])

  const applyData = useCallback((nextData: AppData, message: string) => {
    if (!isSupabaseConfigured) saveLocalData(nextData)
    setData(nextData)
    setNotice(message)
  }, [])

  const weeklySnapshots = data.weeklySnapshots ?? []
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

  async function deleteMatch(matchId: string) {
    if (!requireAdmin()) return
    if (!window.confirm('Delete this game? Ratings will be recalculated.')) return

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
  }

  function toggleSort(key: SortKey) {
    setSort((current) => ({
      key,
      direction: current.key === key && current.direction === 'asc' ? 'desc' : 'asc',
    }))
  }

  return (
    <main className="app-shell">
      <NoticeBanner message={notice} onDismiss={() => setNotice('')} />

      <header className="topbar">
        <div className="brand-lockup">
          <span className="brand-title">pickleranker</span>
          <span className="brand-subtitle">4DR leaderboard</span>
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
          <a className="ghost-link admin-link" href={route === '#/admin' ? '#/' : '#/admin'}>
            {route === '#/admin' ? 'View public site' : 'Admin login'}
          </a>
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
          session={session}
          setAuthForm={setAuthForm}
          setMatchError={setMatchError}
          setMatchForm={setMatchForm}
          setPlayerForm={setPlayerForm}
          signIn={signIn}
          signOut={signOut}
          addPlayer={addPlayer}
          saveMatch={saveMatch}
          cancelEditMatch={cancelEditMatch}
          startEditMatch={startEditMatch}
          deleteMatch={deleteMatch}
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
              <div className="table-wrap">
                <table className="leaderboard-table">
                  <thead>
                    <tr>
                      <SortableHeader label="#" sortKey="rank" activeSort={sort} onSort={toggleSort} />
                      <SortableHeader label="Player" sortKey="player" activeSort={sort} onSort={toggleSort} />
                      <SortableHeader label="4DR Rating" sortKey="rating" activeSort={sort} onSort={toggleSort} />
                      <SortableHeader label="Wins" sortKey="wins" activeSort={sort} onSort={toggleSort} />
                      <SortableHeader label="Losses" sortKey="losses" activeSort={sort} onSort={toggleSort} />
                      <SortableHeader label="Games" sortKey="games" activeSort={sort} onSort={toggleSort} />
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
                      <tr>
                        <th>Rank</th>
                        <th>Player</th>
                        <th>Weekly +/-</th>
                        <th>Diff</th>
                      </tr>
                    </thead>
                    <tbody>
                      {weeklyStandings.map((player, index) => {
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
                      {weeklyStandings.length === 0 ? (
                        <tr>
                          <td colSpan={4} className="empty-table">
                            {weekOptions.length === 0
                              ? 'No games recorded yet.'
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
  session,
  setAuthForm,
  setMatchError,
  setMatchForm,
  setPlayerForm,
  signIn,
  signOut,
  addPlayer,
  saveMatch,
  cancelEditMatch,
  startEditMatch,
  deleteMatch,
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
  session: Session | null
  setAuthForm: (value: { username: string; password: string }) => void
  setMatchError: (value: string) => void
  setMatchForm: (value: MatchFormState) => void
  setPlayerForm: (value: { name: string; skillLevel: string }) => void
  signIn: (event: FormEvent<HTMLFormElement>) => void
  signOut: () => void
  addPlayer: (event: FormEvent<HTMLFormElement>) => void
  saveMatch: (event: FormEvent<HTMLFormElement>) => void
  cancelEditMatch: () => void
  startEditMatch: (match: Match) => void
  deleteMatch: (matchId: string) => void
}) {
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
                : 'Supabase is not configured, so local admin mode is enabled on this device.'}
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
                <button type="submit" className="primary-button">
                  <Save size={17} />
                  {editingMatchId ? 'Update game' : 'Save game'}
                </button>
                {editingMatchId ? (
                  <button type="button" className="ghost-button" onClick={cancelEditMatch}>
                    Cancel edit
                  </button>
                ) : null}
              </div>
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
              <button type="submit" className="icon-button" aria-label="Add player">
                <Plus size={18} />
              </button>
            </form>
          </section>

          <section className="panel recent-matches-panel">
            <div className="panel-heading">
              <div>
                <h2>Recent games</h2>
                <p>Edit or delete saved games.</p>
              </div>
            </div>
            <div className="recent-matches-list">
              {recentMatches.length === 0 ? (
                <p className="empty-table">No games saved yet.</p>
              ) : (
                recentMatches.slice(0, 30).map((match) => (
                  <div className="recent-match-row" key={match.id}>
                    <div>
                      <strong>{match.week}</strong>
                      <span>
                        {playerNameById.get(match.teamA[0]) ?? '?'} & {playerNameById.get(match.teamA[1]) ?? '?'}{' '}
                        beat {playerNameById.get(match.teamB[0]) ?? '?'} &{' '}
                        {playerNameById.get(match.teamB[1]) ?? '?'} ({match.scoreA}-{match.scoreB})
                      </span>
                    </div>
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
                        onClick={() => deleteMatch(match.id)}
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </section>
        </div>
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
