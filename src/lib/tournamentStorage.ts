import type { TournamentState } from './tournament'
import { supabase } from './supabase'

const TOURNAMENT_STORAGE_KEY = 'pickleranker-tournament-v1'
const TOURNAMENT_DRAFT_ID = 'default'

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
