import type { TournamentState } from './tournament'
import { supabase } from './supabase'

const TOURNAMENT_STORAGE_KEY = 'pickleranker-tournament-v1'
const TOURNAMENT_DRAFT_ID = 'default'
// Finished tournaments are archived under a date-keyed id in the same table so
// they can be reopened and edited later. Kept separate from the 'default'
// active-draft slot.
const FINISHED_PREFIX = 'finished:'

function loadLocalTournament(): TournamentState | null {
  if (typeof localStorage === 'undefined') return null
  const stored = localStorage.getItem(TOURNAMENT_STORAGE_KEY)
  if (!stored) return null
  try {
    return JSON.parse(stored) as TournamentState
  } catch {
    return null
  }
}

function saveLocalTournament(tournament: TournamentState | null) {
  if (typeof localStorage === 'undefined') return
  if (tournament) {
    localStorage.setItem(TOURNAMENT_STORAGE_KEY, JSON.stringify(tournament))
  } else {
    localStorage.removeItem(TOURNAMENT_STORAGE_KEY)
  }
}

export async function loadRemoteTournament(): Promise<TournamentState | null> {
  if (!supabase) return loadLocalTournament()
  const { data, error } = await supabase
    .from('tournament_drafts')
    .select('data')
    .eq('id', TOURNAMENT_DRAFT_ID)
    .maybeSingle()
  if (error) return loadLocalTournament()
  if (!data?.data) return loadLocalTournament()
  try {
    return data.data as TournamentState
  } catch {
    return null
  }
}

export async function saveRemoteTournament(tournament: TournamentState | null): Promise<void> {
  if (!supabase) {
    saveLocalTournament(tournament)
    return
  }
  if (!tournament) {
    await supabase.from('tournament_drafts').delete().eq('id', TOURNAMENT_DRAFT_ID)
    saveLocalTournament(null)
    return
  }
  const { error } = await supabase.from('tournament_drafts').upsert({
    id: TOURNAMENT_DRAFT_ID,
    data: tournament,
    updated_at: new Date().toISOString(),
  })
  if (error) {
    saveLocalTournament(tournament)
    return
  }
  saveLocalTournament(tournament)
}

// Save a finished tournament's full bracket, keyed by its played-on date, so it
// can be reopened on the tournament screen and re-finished later. Re-archiving
// the same date overwrites the previous version.
export async function archiveFinishedTournament(tournament: TournamentState): Promise<void> {
  const key = FINISHED_PREFIX + tournament.playedOn
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem(key, JSON.stringify(tournament))
  }
  if (!supabase) return
  await supabase.from('tournament_drafts').upsert({
    id: key,
    data: tournament,
    updated_at: new Date().toISOString(),
  })
}

// Load a previously archived tournament for a date, or null if none was saved
// (e.g. it was finished before archiving existed — rebuild from matches then).
export async function loadFinishedTournament(playedOn: string): Promise<TournamentState | null> {
  const key = FINISHED_PREFIX + playedOn
  if (supabase) {
    const { data, error } = await supabase
      .from('tournament_drafts')
      .select('data')
      .eq('id', key)
      .maybeSingle()
    if (!error && data?.data) return data.data as TournamentState
  }
  if (typeof localStorage !== 'undefined') {
    const stored = localStorage.getItem(key)
    if (stored) {
      try {
        return JSON.parse(stored) as TournamentState
      } catch {
        return null
      }
    }
  }
  return null
}
