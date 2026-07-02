import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import {
  ChevronDown,
  ChevronUp,
  Copy,
  Download,
  LogIn,
  LogOut,
  Pencil,
  Plus,
  Save,
  Trash2,
  Upload,
} from 'lucide-react'
import { AdminField, FieldInput } from './AdminField'
import { DatePicker } from './DatePicker'
import { PlayerAutocomplete, PlayerSearchAutocomplete } from './PlayerAutocomplete'
import { ScoreInput } from './ScoreInput'
import { TournamentPanel } from './TournamentPanel'
import { reconstructTournament, type TournamentState } from '../lib/tournament'
import { loadFinishedTournament } from '../lib/tournamentStorage'
import type { AppData, Match, MatchFormState, PlayerStanding } from '../lib/types'
import type { Session } from '@supabase/supabase-js'

const ADMIN_USERNAME = 'ben'

export function AdminPage({
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
  lastSavedMatchForm,
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
  lastSavedMatchForm: MatchFormState | null
}) {
  const [adminTab, setAdminTab] = useState<'games' | 'tournament' | 'recent'>('games')
  const [expandedWeeks, setExpandedWeeks] = useState<Set<string>>(new Set())
  // Free-text player filter for the Recent tournaments tab.
  const [recentSearch, setRecentSearch] = useState('')
  // When set, the Tournament tab opens this finished bracket for editing instead
  // of starting fresh. Cleared when finished or when the tab is opened normally.
  const [editTournament, setEditTournament] = useState<TournamentState | null>(null)
  const importInputRef = useRef<HTMLInputElement>(null)
  // Bumped on every user-driven tab switch so a slow openFullTournament load that
  // resolves after the user has navigated away doesn't yank them back.
  const openTournamentRequest = useRef(0)

  function goToTab(tab: 'games' | 'tournament' | 'recent') {
    openTournamentRequest.current += 1
    setAdminTab(tab)
  }

  // Reopen a finished tournament on the full tournament screen. Uses the
  // archived bracket if one was saved on finish, otherwise rebuilds it from the
  // saved game rows (older tournaments). Re-finishing replaces that date's
  // results on the leaderboard.
  async function openFullTournament(matches: Match[]) {
    const tagged = matches.filter((match) => typeof match.round === 'number')
    if (tagged.length === 0) {
      window.alert(
        "This tournament was saved without round info, so it can't be opened as a full bracket. Edit individual games instead.",
      )
      return
    }
    const playedOn = tagged[0].playedOn
    const sameDay = tagged.filter((match) => match.playedOn === playedOn)
    const confirmed = window.confirm(
      'Open this tournament in the full editor? Any tournament you have started but not finished will be replaced.',
    )
    if (!confirmed) return
    const token = (openTournamentRequest.current += 1)
    const archived = await loadFinishedTournament(playedOn)
    // The user switched tabs (or opened something else) while the load was in
    // flight — don't force them back to the Tournament tab.
    if (openTournamentRequest.current !== token) return
    setEditTournament(archived ?? reconstructTournament(sameDay, playedOn))
    setAdminTab('tournament')
  }

  useEffect(() => {
    if (adminTab !== 'games' || !editingMatchId) return
    document.querySelector('.match-entry-panel')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [adminTab, editingMatchId])

  function editRecentMatch(match: Match) {
    startEditMatch(match)
    goToTab('games')
  }

  const updateMatchForm = (next: Partial<MatchFormState>) => {
    setMatchForm({ ...matchForm, ...next })
    setMatchError('')
  }

  function duplicateLastGame() {
    if (!lastSavedMatchForm) return
    setMatchForm({
      ...lastSavedMatchForm,
      scoreA: '0',
      scoreB: '0',
    })
    setMatchError('')
    document.getElementById('match-score-a')?.focus()
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
              {authError ? <p className="form-error" role="alert">{authError}</p> : null}
              <button type="submit" className="primary-button">
                <LogIn size={16} />
                Sign in
              </button>
            </form>
          )
        ) : (
          <div className="local-admin-tools">
            <div className="admin-status">
              <span>
                Local editing is active on this device only. Export a backup before clearing browser
                data.
              </span>
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
            onClick={() => goToTab('games')}
          >
            Score entry
          </button>
          <button
            type="button"
            className={adminTab === 'tournament' ? 'active' : ''}
            onClick={() => {
              setEditTournament(null)
              goToTab('tournament')
            }}
          >
            Tournament
          </button>
          <button
            type="button"
            className={adminTab === 'recent' ? 'active' : ''}
            onClick={() => goToTab('recent')}
          >
            Recent tournaments
          </button>
        </div>
      ) : null}

      {canEdit && adminTab === 'tournament' ? (
        <TournamentPanel
          standings={standings}
          saveRoundMatches={saveTournamentRound}
          onFinished={() => {
            setEditTournament(null)
            goToTab('recent')
          }}
          openTournament={editTournament}
        />
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
                <DatePicker
                  required
                  value={matchForm.playedOn}
                  onChange={(value) => updateMatchForm({ playedOn: value })}
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
                  <ScoreInput
                    id="match-score-a"
                    value={matchForm.scoreA}
                    onChange={(value) => updateMatchForm({ scoreA: value })}
                  />
                </AdminField>
                <AdminField label="Pair 2 score">
                  <ScoreInput
                    value={matchForm.scoreB}
                    onChange={(value) => updateMatchForm({ scoreB: value })}
                  />
                </AdminField>
              </div>

              {matchError ? <p className="form-error" role="alert">{matchError}</p> : null}
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
                ) : lastSavedMatchForm ? (
                  <button type="button" className="ghost-button" onClick={duplicateLastGame}>
                    <Copy size={16} />
                    Same players
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
              <h2>Recent tournaments</h2>
            </div>
          </div>
          {recentMatches.length > 0 ? (
            <PlayerSearchAutocomplete
              players={data.players}
              value={recentSearch}
              onChange={setRecentSearch}
              placeholder="Filter by player..."
              ariaLabel="Filter recent games by player"
              className="recent-games-search"
            />
          ) : null}
          <div className="recent-games-weeks">
            {recentMatches.length === 0 ? (
              <p className="empty-table">No tournaments saved yet.</p>
            ) : (
              (() => {
                const query = recentSearch.trim().toLowerCase()
                const matchHasPlayer = (match: Match) =>
                  !query ||
                  [match.teamA[0], match.teamA[1], match.teamB[0], match.teamB[1]].some((id) =>
                    (playerNameById.get(id) ?? '').toLowerCase().includes(query),
                  )
                const renderPlayerName = (id: string) => {
                  const name = playerNameById.get(id) ?? '?'
                  return query && name.toLowerCase().includes(query) ? (
                    <mark className="recent-player-highlight">{name}</mark>
                  ) : (
                    name
                  )
                }

                const weeks = new Map<string, Match[]>()
                recentMatches.forEach((match) => {
                  const list = weeks.get(match.week) ?? []
                  list.push(match)
                  weeks.set(match.week, list)
                })

                // Keep the full match list per week for "Edit Tournament" (which
                // reopens the whole bracket), but only show the games that match
                // the player filter.
                const visibleWeeks = [...weeks.entries()]
                  .map(([week, matches]) => ({ week, matches, games: matches.filter(matchHasPlayer) }))
                  .filter((entry) => entry.games.length > 0)

                if (visibleWeeks.length === 0) {
                  return <p className="empty-table">No games found for that player.</p>
                }

                return visibleWeeks.map(({ week, matches, games }) => {
                  // While filtering, keep matching weeks expanded so results are visible.
                  const isOpen = query.length > 0 || expandedWeeks.has(week)
                  return (
                    <div className="week-subwindow" key={week}>
                      <div className="week-subwindow-header-row">
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
                          <span className="week-count">
                            {games.length} game{games.length === 1 ? '' : 's'}
                          </span>
                          {isOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                        </button>
                        <button
                          type="button"
                          className="ghost-button week-edit-button"
                          onClick={() => openFullTournament(matches)}
                        >
                          <Pencil size={14} /> Edit Tournament
                        </button>
                      </div>
                      {isOpen ? (
                        <div className="table-wrap">
                          <table className="recent-games-table">
                            <thead>
                              <tr>
                                <th scope="col">Winners</th>
                                <th scope="col">Losers</th>
                                <th scope="col">Score</th>
                                <th scope="col" style={{ textAlign: 'right' }}>Actions</th>
                              </tr>
                            </thead>
                            <tbody>
                              {games.map((match) => (
                                <tr
                                  key={match.id}
                                  className={editingMatchId === match.id ? 'editing' : ''}
                                >
                                  <td>
                                    {renderPlayerName(match.teamA[0])}
                                    {' & '}
                                    {renderPlayerName(match.teamA[1])}
                                  </td>
                                  <td>
                                    {renderPlayerName(match.teamB[0])}
                                    {' & '}
                                    {renderPlayerName(match.teamB[1])}
                                  </td>
                                  <td>
                                    <span className="score-badge">
                                      {match.scoreA}-{match.scoreB}
                                    </span>
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
