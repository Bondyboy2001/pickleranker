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
import { PlayerAutocomplete } from './PlayerAutocomplete'
import { TournamentPanel } from './TournamentPanel'
import { formatResultsLabel, makeId } from '../lib/data'
import type { AppData, Match, MatchFormState, PlayerStanding } from '../lib/types'
import type { Session } from '@supabase/supabase-js'

const ADMIN_USERNAME = 'ben'

function formatMatchEditedAt(match: Match) {
  if (!match.updatedAt) return null
  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(match.updatedAt))
}

function parseBulkCsv(
  raw: string,
  players: AppData['players'],
): { matches: Omit<Match, 'id' | 'week'>[] } | { error: string } {
  const lines = raw
    .trim()
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
  if (lines.length === 0) return { error: 'Paste at least one row.' }

  const nameToId = new Map(players.map((player) => [player.name.trim().toLowerCase(), player.id]))
  const rows: Omit<Match, 'id' | 'week'>[] = []

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]
    if (index === 0 && line.toLowerCase().includes('date') && line.toLowerCase().includes('score')) {
      continue
    }
    const parts = line.split(',').map((part) => part.trim())
    if (parts.length < 7) {
      return { error: `Line ${index + 1}: need date, 4 player names, and 2 scores.` }
    }
    const [playedOn, n1, n2, n3, n4, scoreAStr, scoreBStr] = parts
    const ids = [n1, n2, n3, n4].map((name) => nameToId.get(name.toLowerCase()))
    if (ids.some((id) => !id)) {
      return { error: `Line ${index + 1}: unknown player name.` }
    }
    const scoreA = Number(scoreAStr)
    const scoreB = Number(scoreBStr)
    if (!playedOn || Number.isNaN(scoreA) || Number.isNaN(scoreB) || scoreA === scoreB) {
      return { error: `Line ${index + 1}: invalid date or scores.` }
    }
    if (new Set(ids).size !== 4) {
      return { error: `Line ${index + 1}: each player can only appear once.` }
    }

    let winningTeamA: [string, string] = [ids[0]!, ids[1]!]
    let losingTeamB: [string, string] = [ids[2]!, ids[3]!]
    let winningScore = scoreA
    let losingScore = scoreB
    if (scoreB > scoreA) {
      winningTeamA = [ids[2]!, ids[3]!]
      losingTeamB = [ids[0]!, ids[1]!]
      winningScore = scoreB
      losingScore = scoreA
    }

    rows.push({
      playedOn,
      teamA: winningTeamA,
      teamB: losingTeamB,
      scoreA: winningScore,
      scoreB: losingScore,
    })
  }

  if (rows.length === 0) return { error: 'No game rows found.' }
  return { matches: rows }
}

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
  onBulkImport,
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
  onBulkImport: (matches: Match[]) => Promise<void>
  lastSavedMatchForm: MatchFormState | null
}) {
  const [adminTab, setAdminTab] = useState<'games' | 'tournament' | 'recent' | 'import'>('games')
  const [expandedWeeks, setExpandedWeeks] = useState<Set<string>>(new Set())
  const [bulkCsv, setBulkCsv] = useState('')
  const [bulkError, setBulkError] = useState('')
  const importInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (adminTab !== 'games' || !editingMatchId) return
    document.querySelector('.match-entry-panel')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [adminTab, editingMatchId])

  function editRecentMatch(match: Match) {
    startEditMatch(match)
    setAdminTab('games')
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

  async function submitBulkImport(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setBulkError('')
    const parsed = parseBulkCsv(bulkCsv, data.players)
    if ('error' in parsed) {
      setBulkError(parsed.error)
      return
    }
    const matches: Match[] = parsed.matches.map((row) => ({
      id: makeId('m'),
      week: formatResultsLabel(row.playedOn),
      ...row,
    }))
    await onBulkImport(matches)
    setBulkCsv('')
    setAdminTab('recent')
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
            className={adminTab === 'import' ? 'active' : ''}
            onClick={() => setAdminTab('import')}
          >
            Bulk import
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

      {canEdit && adminTab === 'import' ? (
        <section className="panel bulk-import-panel">
          <div className="panel-heading">
            <div>
              <h2>Bulk import session</h2>
              <p>
                One game per line:{' '}
                <code>date, player1, player2, player3, player4, scoreA, scoreB</code>
              </p>
            </div>
          </div>
          <form onSubmit={(event) => void submitBulkImport(event)}>
            <textarea
              className="bulk-import-textarea"
              value={bulkCsv}
              onChange={(event) => setBulkCsv(event.target.value)}
              placeholder={`2026-06-12, Alice, Bob, Carol, Dave, 11, 8\n2026-06-12, Eve, Frank, Grace, Henry, 9, 11`}
              rows={8}
            />
            {bulkError ? <p className="form-error">{bulkError}</p> : null}
            <button type="submit" className="primary-button" disabled={savingAction === 'bulk'}>
              Import games
            </button>
          </form>
        </section>
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
                    id="match-score-a"
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
                        <span className="week-count">
                          {matches.length} game{matches.length === 1 ? '' : 's'}
                        </span>
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
                                <th>Edited</th>
                                <th style={{ textAlign: 'right' }}>Actions</th>
                              </tr>
                            </thead>
                            <tbody>
                              {matches.map((match) => {
                                const editedAt = formatMatchEditedAt(match)
                                return (
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
                                      <span className="score-badge">
                                        {match.scoreA}-{match.scoreB}
                                      </span>
                                    </td>
                                    <td className="match-edited-at">
                                      {editedAt ?? '—'}
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
                                )
                              })}
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
