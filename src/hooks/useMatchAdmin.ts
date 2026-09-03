'use client'

import { useCallback, useState } from 'react'
import type { FormEvent } from 'react'
import {
  MAX_PLAYER_NAME_LENGTH,
  ensureSeedData,
  exportDataSnapshot,
  formatResultsLabel,
  makeId,
  matchToDb,
  parseImportedData,
  playerToDb,
  saveLocalData,
  sortMatches,
  validatePlayerInput,
  validateScores,
} from '../lib/data'
import { reportClientEvent } from '../lib/monitoring'
import { isNetworkError, queueOutbox } from '../lib/outbox'
import { supabase } from '../lib/supabase'
import type { AppData, Match, MatchFormState, Player } from '../lib/types'

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

// The optional round/court/source columns may be missing on older databases. Detect that
// specific case precisely — Postgres "undefined_column" is 42703 and PostgREST
// surfaces a stale schema cache as PGRST204 — so an unrelated error that merely
// mentions a "round" or a player named "Court" can never trigger the blind
// whole-day delete / metadata-strip fallbacks.
function isMissingColumnError(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false
  if (error.code === '42703' || error.code === 'PGRST204') return true
  return /column\b[^.]*\b(round|court|updated_at|source)\b[^.]*does not exist/i.test(error.message ?? '')
}

function stripOptionalMatchMetadata(row: ReturnType<typeof matchToDb>) {
  const stripped = { ...row }
  delete stripped.round
  delete stripped.court
  delete stripped.updated_at
  delete stripped.source
  return stripped
}

// Score-entry admin state: match/player forms, match CRUD, backup import/export,
// and tournament-round commits. Needs the current data plus stable set/notify
// callbacks from the owner.
export function useMatchAdmin({
  data,
  canEdit,
  notify,
  onData,
  refreshRemoteData,
}: {
  data: AppData
  canEdit: boolean
  notify: (message: string) => void
  onData: (data: AppData) => void
  refreshRemoteData: (message?: string) => Promise<void>
}) {
  const [matchForm, setMatchForm] = useState(emptyMatch)
  const [lastSavedMatchForm, setLastSavedMatchForm] = useState<MatchFormState | null>(null)
  const [editingMatchId, setEditingMatchId] = useState<string | null>(null)
  const [matchError, setMatchError] = useState('')
  const [playerForm, setPlayerForm] = useState({ name: '', skillLevel: '3.0' })
  const [confirmAction, setConfirmAction] = useState<ConfirmAction | null>(null)
  const [savingAction, setSavingAction] = useState<string | null>(null)

  const applyData = useCallback(
    (nextData: AppData, message: string) => {
      const sorted: AppData = { ...nextData, matches: sortMatches(nextData.matches) }
      // Always cache locally (offline fallback), not just in dev mode.
      saveLocalData(sorted)
      onData(sorted)
      notify(message)
    },
    [notify, onData],
  )

  function requireAdmin() {
    if (canEdit) return true
    notify('Admin login required to update games.')
    return false
  }

  async function addPlayer(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!requireAdmin()) return
    const name = playerForm.name.trim().slice(0, MAX_PLAYER_NAME_LENGTH)
    const skillLevel = Number(playerForm.skillLevel)
    const validation = validatePlayerInput(name, skillLevel)
    if (validation) {
      notify(validation)
      return
    }
    if (data.players.some((p) => p.name.trim().toLowerCase() === name.toLowerCase())) {
      notify('That player already exists.')
      return
    }

    setSavingAction('player')
    try {
      const player: Player = { id: makeId('p'), name, skillLevel }

      if (supabase) {
        const { error } = await supabase.from('players').insert(playerToDb(player))
        if (error) {
          reportClientEvent('player-save-failed', error, { name })
          if (isNetworkError(error)) {
            queueOutbox({ kind: 'player', row: playerToDb(player), at: new Date().toISOString() })
            applyData(
              { ...data, players: [...data.players, player] },
              `${name} saved offline — will sync when back online.`,
            )
            setPlayerForm({ name: '', skillLevel: '3.0' })
            return
          }
          notify(error.message)
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
    notify('Backup downloaded.')
  }

  function importLocalBackup(file: File) {
    const reader = new FileReader()
    reader.onload = () => {
      // Imported names are remapped onto seed players, so wait for the seed
      // chunk before parsing.
      void ensureSeedData().then(() => {
        const result = parseImportedData(String(reader.result ?? ''))
        if ('error' in result) {
          notify(result.error)
          return
        }
        applyData(result, 'Backup imported on this device.')
      })
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
    if (matchForm.playedOn > new Date().toISOString().slice(0, 10)) {
      setMatchError('Date cannot be in the future.')
      return null
    }
    if (
      !matchForm.scoreA.trim() ||
      !matchForm.scoreB.trim() ||
      !Number.isInteger(scoreA) ||
      !Number.isInteger(scoreB)
    ) {
      setMatchError('Enter whole-number scores for both teams.')
      return null
    }
    const scoreError = validateScores(scoreA, scoreB)
    if (scoreError) {
      setMatchError(scoreError)
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
          if (isNetworkError(error)) {
            queueOutbox({ kind: 'match', row, previousId: previousMatchId, at: new Date().toISOString() })
            const nextMatches = previousMatchId
              ? data.matches.map((existing) => (existing.id === previousMatchId ? match : existing))
              : [...data.matches, match]
            applyData(
              { ...data, matches: nextMatches },
              'Saved offline — will sync when back online.',
            )
            setLastSavedMatchForm({ ...matchForm })
            setEditingMatchId(null)
            setMatchForm((current) => ({ ...emptyMatch, playedOn: current.playedOn }))
            return
          }
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
          if (isNetworkError(error)) {
            queueOutbox({ kind: 'delete-match', id: matchId, at: new Date().toISOString() })
            if (editingMatchId === matchId) cancelEditMatch()
            applyData(
              { ...data, matches: data.matches.filter((match) => match.id !== matchId) },
              'Deleted offline — will sync when back online.',
            )
            return
          }
          notify(error.message)
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

    const tagged = newMatches.map((m) => ({ ...m, source: 'tournament' as const }))
    const message = `${tagged.length} tournament games saved to the leaderboard.`
    // A tournament owns its day's results, so replace any tournament matches
    // already saved for that date. This keeps the leaderboard in sync with the
    // final bracket (e.g. after swapping a player) instead of stacking
    // stale/duplicate rows from an earlier save. Only tournament-originated
    // rows (source='tournament', falling back to round-is-set for old DBs) are
    // removed, so manually-entered games on the same day are left intact.
    const playedOnDates = [...new Set(tagged.map((match) => match.playedOn))]

    if (supabase) {
      if (playedOnDates.length > 0) {
        // Prefer source-based replace; fall back to round-based for DBs that
        // predate the source column, then whole-day for DBs without round.
        let { error: deleteError } = await supabase
          .from('matches')
          .delete()
          .in('played_on', playedOnDates)
          .eq('source', 'tournament')
        if (isMissingColumnError(deleteError)) {
          ;({ error: deleteError } = await supabase
            .from('matches')
            .delete()
            .in('played_on', playedOnDates)
            .not('round', 'is', null))
        }
        if (isMissingColumnError(deleteError)) {
          ;({ error: deleteError } = await supabase
            .from('matches')
            .delete()
            .in('played_on', playedOnDates))
        }
        if (deleteError) {
          reportClientEvent('tournament-replace-failed', deleteError)
          if (isNetworkError(deleteError)) {
            queueOutbox({
              kind: 'tournament',
              rows: tagged.map(matchToDb),
              dates: playedOnDates,
              at: new Date().toISOString(),
            })
            const kept = data.matches.filter(
              (match) =>
                !(
                  playedOnDates.includes(match.playedOn) &&
                  (match.source === 'tournament' || match.round != null)
                ),
            )
            applyData({ ...data, matches: [...kept, ...tagged] }, `${message} (offline — will sync)`)
            return true
          }
          notify(deleteError.message)
          return false
        }
      }
      const rows = tagged.map(matchToDb)
      let { error } = await supabase.from('matches').insert(rows)
      // The round/court/source columns are optional (older DBs may not have them yet).
      // If they're missing, retry without that metadata so saving still works.
      if (isMissingColumnError(error)) {
        const stripped = rows.map(stripOptionalMatchMetadata)
        ;({ error } = await supabase.from('matches').insert(stripped))
      }
      if (error) {
        reportClientEvent('tournament-save-failed', error)
        if (isNetworkError(error)) {
          queueOutbox({
            kind: 'tournament',
            rows,
            dates: playedOnDates,
            at: new Date().toISOString(),
          })
          const kept = data.matches.filter(
            (match) =>
              !(
                playedOnDates.includes(match.playedOn) &&
                (match.source === 'tournament' || match.round != null)
              ),
          )
          applyData({ ...data, matches: [...kept, ...tagged] }, `${message} (offline — will sync)`)
          return true
        }
        notify(error.message)
        return false
      }
      // Re-pull authoritative data so the leaderboard, weekly and players views
      // (and the local cache) all reflect the new results.
      await refreshRemoteData(message)
      return true
    }

    // Mirror the remote behaviour: only drop this date's tournament rows,
    // leaving manually-entered games for the same day in place.
    const kept = data.matches.filter(
      (match) =>
        !(playedOnDates.includes(match.playedOn) && (match.source === 'tournament' || match.round != null)),
    )
    applyData({ ...data, matches: [...kept, ...tagged] }, message)
    return true
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

  return {
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
  }
}
