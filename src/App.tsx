'use client'

import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from 'react'
import { AppHeader } from './components/AppShell'
import { ConfirmDialog } from './components/ConfirmDialog'
import { NoticeBanner } from './components/NoticeBanner'
import { OverallLeaderboard } from './components/OverallLeaderboard'
import { useMatchAdmin } from './hooks/useMatchAdmin'
import { useRemoteSync } from './hooks/useRemoteSync'

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
  formatPlayedOnDate,
  isSupabaseConfigured,
  latestPlayedOn,
  loadLocalData,
} from './lib/data'
import {
  buildOverallRankMovement,
  buildStandings,
  buildWeekOptions,
  buildWeeklyPlayerGames,
  buildWeeklyStandings,
  sortStandings,
  sortWeeklyStandings,
} from './lib/standings'
import {
  navigateTo,
  parsePathRoute,
  parseRoute,
  type AppRoute,
  type PublicTab,
} from './lib/routing'
import type { AppData, SortDirection, SortKey, WeeklySortKey } from './lib/types'

const THEME_STORAGE_KEY = 'pickleranker-theme'
const PINNED_PLAYER_STORAGE_KEY = 'pickleranker-pinned-player'

function readPinnedPlayerId(): string | null {
  try {
    if (typeof localStorage === 'undefined') return null
    return localStorage.getItem(PINNED_PLAYER_STORAGE_KEY)
  } catch {
    return null
  }
}

function readRouteFromLocation(): AppRoute {
  if (typeof window === 'undefined') return { page: 'public', tab: 'overall' }
  if (window.location.hash) return parseRoute(window.location.hash)
  return parsePathRoute(window.location.pathname, window.location.search)
}

function App() {
  // Only the initial state below depends on this, so read the URL once rather
  // than on every render.
  const initialRoute = useMemo(readRouteFromLocation, [])
  // Always seed from the local cache (last server snapshot merged with seed
  // data) so the leaderboard paints instantly; the remote fetch then revalidates
  // it in the background.
  const [data, setData] = useState<AppData>(() => loadLocalData())
  const [route, setRoute] = useState<AppRoute>(initialRoute)
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    try {
      const stored = localStorage.getItem(THEME_STORAGE_KEY)
      if (stored === 'dark' || stored === 'light') return stored
      if (window.matchMedia?.('(prefers-color-scheme: dark)').matches) return 'dark'
    } catch {
      // SSR / private mode — fall through to light.
    }
    return 'light'
  })
  const [notice, setNotice] = useState('')

  // Server data, auth, and realtime sync live in the hook; App renders from
  // whatever data it hands back.
  const {
    session,
    isAdmin,
    authForm,
    setAuthForm,
    authError,
    loadState,
    loadError,
    lastSyncedAt,
    refreshRemoteData,
    signIn,
    signOut,
  } = useRemoteSync({ onData: setData, notify: setNotice })

  const canEdit = !isSupabaseConfigured || isAdmin

  const matchAdmin = useMatchAdmin({
    data,
    canEdit,
    notify: setNotice,
    onData: setData,
    refreshRemoteData,
  })
  const {
    matchForm,
    setMatchForm,
    lastSavedMatchForm,
    editingMatchId,
    matchError,
    setMatchError,
    playerForm,
    setPlayerForm,
    savingAction,
    confirmAction,
    setConfirmAction,
    confirmDialog,
    addPlayer,
    exportLocalBackup,
    importLocalBackup,
    saveMatch,
    cancelEditMatch,
    startEditMatch,
    requestDeleteMatch,
    handleConfirmAction,
    saveTournamentRound,
  } = matchAdmin
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
  const [search, setSearch] = useState('')
  const [minimumGames, setMinimumGames] = useState(10)
  const [weeklySearch, setWeeklySearch] = useState('')
  const [selectedWeek, setSelectedWeek] = useState(() =>
    initialRoute.page === 'public' ? (initialRoute.week ?? '') : '',
  )
  const [pinnedPlayerId, setPinnedPlayerId] = useState<string | null>(readPinnedPlayerId)

  const isAdminPage = route.page === 'admin'
  const activeTab: PublicTab = route.page === 'public' ? route.tab : 'overall'

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    try {
      localStorage.setItem(THEME_STORAGE_KEY, theme)
    } catch {
      // Private mode / quota — theme just won't persist.
    }
  }, [theme])

  useEffect(() => {
    const readRoute = () => setRoute(readRouteFromLocation())
    window.addEventListener('hashchange', readRoute)
    window.addEventListener('popstate', readRoute)
    return () => {
      window.removeEventListener('hashchange', readRoute)
      window.removeEventListener('popstate', readRoute)
    }
  }, [])

  useEffect(() => {
    if (route.page !== 'public') return
    if (route.tab === 'players') setSelectedPlayerId(route.playerId ?? null)
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
    try {
      if (pinnedPlayerId) {
        localStorage.setItem(PINNED_PLAYER_STORAGE_KEY, pinnedPlayerId)
      } else {
        localStorage.removeItem(PINNED_PLAYER_STORAGE_KEY)
      }
    } catch {
      // Private mode / quota — pinning just won't persist.
    }
  }, [pinnedPlayerId])

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
        ? buildWeeklyStandings(latestWeekKey, summaries, data.players, data.matches)
        : [],
    [latestWeekKey, summaries, data.players, data.matches],
  )
  // Only the name and change reach the leaderboard, so narrow it here: the
  // memoized view then doesn't re-render when an unrelated field of the winning
  // player's standing changes.
  const mostImprovedPlayer = useMemo(() => {
    const activePlayers = latestWeekStandings.filter((player) => player.games > 0)
    if (activePlayers.length === 0) return null
    const best = activePlayers.reduce((leader, player) =>
      player.change > leader.change ? player : leader,
    )
    return { name: best.name, change: best.change }
  }, [latestWeekStandings])
  const averageRating = useMemo(() => {
    if (standings.length === 0) return 0
    return standings.reduce((total, player) => total + player.rating, 0) / standings.length
  }, [standings])
  const weeklyStandings = useMemo(
    () =>
      buildWeeklyStandings(activeWeek, summaries, data.players, data.matches).filter(
        (player) => player.games > 0,
      ),
    [activeWeek, summaries, data.players, data.matches],
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
  const rankMovementByPlayerId = useMemo(
    () => buildOverallRankMovement(data, standings),
    [data, standings],
  )
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
  const comparePlayerAId =
    route.page === 'public' && route.tab === 'players' ? (route.comparePlayerAId ?? '') : ''
  const comparePlayerBId =
    route.page === 'public' && route.tab === 'players' ? (route.comparePlayerBId ?? '') : ''
  const effectiveWeeklyPlayerId =
    selectedWeeklyPlayerId ?? routePlayerId ?? weeklyStandings[0]?.playerId ?? null
  const selectedWeeklyComputedPlayer = useMemo(
    () => weeklyStandings.find((player) => player.playerId === effectiveWeeklyPlayerId),
    [effectiveWeeklyPlayerId, weeklyStandings],
  )
  const selectedWeeklyPlayerName =
    selectedWeeklyComputedPlayer?.name ??
    standingByPlayerId.get(effectiveWeeklyPlayerId ?? '')?.name ??
    ''
  const weeklyPlayerGames = useMemo(
    () =>
      effectiveWeeklyPlayerId
        ? buildWeeklyPlayerGames(effectiveWeeklyPlayerId, activeWeek, data.matches, data.players)
        : [],
    [activeWeek, data.matches, data.players, effectiveWeeklyPlayerId],
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
    (
      tab: PublicTab,
      options?: {
        playerId?: string
        comparePlayerAId?: string
        comparePlayerBId?: string
        week?: string
      },
    ) => {
      if (tab === 'overall') setSort({ key: 'rank', direction: 'asc' })
      if (tab === 'weekly') setWeeklySort({ key: 'rank', direction: 'asc' })
      navigateTo({
        page: 'public',
        tab,
        playerId: options?.playerId,
        comparePlayerAId: options?.comparePlayerAId,
        comparePlayerBId: options?.comparePlayerBId,
        week: options?.week,
      })
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
  const handlePlayersSelect = useCallback(
    (playerId: string) => {
      setSelectedPlayerId(playerId)
      navigateTo({
        page: 'public',
        tab: 'players',
        playerId,
        comparePlayerAId: comparePlayerAId || undefined,
        comparePlayerBId: comparePlayerBId || undefined,
      })
    },
    [comparePlayerAId, comparePlayerBId],
  )
  const handlePlayerComparisonChange = useCallback(
    (playerAId: string, playerBId: string) => {
      navigateTo({
        page: 'public',
        tab: 'players',
        playerId: selectedPlayerId ?? undefined,
        comparePlayerAId: playerAId || undefined,
        comparePlayerBId: playerBId || undefined,
      })
    },
    [selectedPlayerId],
  )
  const handleWeeklyWeekChange = useCallback((week: string) => {
    setSelectedWeek(week)
    setWeeklySort({ key: 'rank', direction: 'asc' })
    setSelectedWeeklyPlayerId(null)
    navigateTo({ page: 'public', tab: 'weekly', week })
  }, [])

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
                onSortChange={setSort}
                rankMovementByPlayerId={rankMovementByPlayerId}
                playerCount={data.players.length}
                matchCount={data.matches.length}
                averageRating={averageRating}
                mostImprovedPlayer={mostImprovedPlayer}
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
                comparePlayerAId={comparePlayerAId}
                comparePlayerBId={comparePlayerBId}
                onSelectPlayer={handlePlayersSelect}
                onComparisonChange={handlePlayerComparisonChange}
                onOpenWeeklyWeek={openWeeklyWeek}
              />
            )}
          </div>
        )}
        </Suspense>
      </div>
    </main>
  )
}

export default App
