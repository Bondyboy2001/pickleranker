'use client'

import { useCallback, useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import type { Session } from '@supabase/supabase-js'
import {
  applySeedToData,
  checkIsAdmin,
  ensureSeedData,
  isSupabaseConfigured,
  loadLocalData,
  loadRemoteData,
} from '../lib/data'
import { reportClientEvent } from '../lib/monitoring'
import { clearOutbox, loadOutbox } from '../lib/outbox'
import { supabase } from '../lib/supabase'
import type { AppData } from '../lib/types'

// Admin email is configurable; the old hardcoded ben@pickleranker.local is kept
// as a fallback so existing installs keep working.
const ADMIN_AUTH_EMAIL =
  process.env.NEXT_PUBLIC_ADMIN_EMAIL ?? 'ben@pickleranker.local'

// Server data, auth, and realtime sync. Owns the initial load (local cache
// first, then the seed chunk + remote revalidation) and the live channel, so
// App only deals with rendering.
export function useRemoteSync({
  onData,
  notify,
}: {
  onData: (data: AppData) => void
  notify: (message: string) => void
}) {
  const [session, setSession] = useState<Session | null>(null)
  const [isAdmin, setIsAdmin] = useState(false)
  const [authForm, setAuthForm] = useState({ username: '', password: '' })
  const [authError, setAuthError] = useState('')
  const [loadState, setLoadState] = useState<'idle' | 'loading' | 'error'>(
    isSupabaseConfigured ? 'loading' : 'idle',
  )
  const [loadError, setLoadError] = useState('')
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null)

  const refreshRemoteData = useCallback(
    async (message?: string) => {
      if (!supabase) return
      setLoadState('loading')
      setLoadError('')
      try {
        const remoteData = await loadRemoteData()
        onData(remoteData)
        setLoadState('idle')
        setLastSyncedAt(new Date().toISOString())
        if (message) notify(message)
      } catch (error) {
        const text = error instanceof Error ? error.message : 'Could not load data.'
        reportClientEvent('remote-data-refresh-failed', error)
        setLoadError(text)
        setLoadState('error')
        // We still have cached data on screen, so keep the message low-key.
        notify('Couldn’t reach the server — showing saved data.')
      }
    },
    [notify, onData],
  )

  useEffect(() => {
    const client = supabase
    if (!client) {
      // Dev mode: no server to pull from, but the seed chunk still loads
      // lazily — re-merge once it arrives so a cold first visit gains history.
      let cancelled = false
      void ensureSeedData().then(() => {
        if (!cancelled) onData(applySeedToData(loadLocalData()))
      })
      return () => {
        cancelled = true
      }
    }

    let cancelled = false
    // A tournament save fires several postgres changes in quick succession
    // (delete + N inserts). Coalesce them into one refetch, skip when hidden.
    let refreshTimer: ReturnType<typeof setTimeout> | null = null
    const scheduleRefresh = () => {
      if (refreshTimer) return
      if (typeof document !== 'undefined' && document.hidden) return
      refreshTimer = setTimeout(() => {
        refreshTimer = null
        if (typeof document !== 'undefined' && document.hidden) return
        void refreshRemoteData()
      }, 1000)
    }

    async function flushOutbox() {
      if (!supabase) return
      if (typeof navigator !== 'undefined' && !navigator.onLine) return
      const ops = loadOutbox()
      if (ops.length === 0) return
      const done: typeof ops = []
      for (const op of ops) {
        try {
          if (op.kind === 'player') {
            const { error } = await supabase.from('players').insert(op.row)
            if (error) break
          } else if (op.kind === 'match') {
            const { error } = op.previousId
              ? await supabase.from('matches').update(op.row).eq('id', op.previousId)
              : await supabase.from('matches').insert(op.row)
            if (error) break
          } else if (op.kind === 'delete-match') {
            const { error } = await supabase.from('matches').delete().eq('id', op.id)
            if (error) break
          } else if (op.kind === 'tournament') {
            if (op.dates.length > 0) {
              const { error: deleteError } = await supabase
                .from('matches')
                .delete()
                .in('played_on', op.dates)
                .eq('source', 'tournament')
              if (deleteError && (deleteError as { code?: string }).code !== '42703') break
            }
            const { error } = await supabase.from('matches').insert(op.rows)
            if (error) break
          }
          done.push(op)
        } catch {
          break
        }
      }
      if (done.length > 0) {
        clearOutbox(done)
        void refreshRemoteData(
          done.length === ops.length
            ? 'Offline changes synced.'
            : `${done.length} offline change${done.length === 1 ? '' : 's'} synced.`,
        )
      }
    }

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
        onData(remoteData)
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
        notify('Couldn’t reach the server — showing saved data.')
      })

    const channel = client
      .channel('pickleranker-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'matches' }, () => {
        scheduleRefresh()
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'players' }, () => {
        scheduleRefresh()
      })
      .subscribe()

    window.addEventListener('online', flushOutbox)
    void flushOutbox()

    return () => {
      cancelled = true
      if (refreshTimer) clearTimeout(refreshTimer)
      listener.subscription.unsubscribe()
      window.removeEventListener('online', flushOutbox)
      void client.removeChannel(channel)
    }
  }, [notify, onData, refreshRemoteData])

  async function signIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!supabase) return
    setAuthError('')
    // Accept either the full email or the legacy "ben" username for backwards
    // compatibility. Authorization is decided by the is_admin RPC, not by the
    // client-side name check, so any admin-listed account can sign in.
    const login = authForm.username.trim()
    const email = login.includes('@') ? login : ADMIN_AUTH_EMAIL
    if (!login) {
      setAuthError('Enter your admin email and password.')
      return
    }
    // If a bare username was entered, it must match the local part of the
    // configured admin email (e.g. "ben" for ben@...). This preserves the old
    // single-user UX without hardcoding an enumerable account name.
    if (!login.includes('@')) {
      const allowedPrefix = ADMIN_AUTH_EMAIL.split('@')[0].toLowerCase()
      if (login.toLowerCase() !== allowedPrefix) {
        // Still attempt email-style login? No — fail closed with generic error
        // to avoid user enumeration.
        setAuthError('Invalid email or password.')
        return
      }
    }
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password: authForm.password,
    })
    if (error) {
      setAuthError('Invalid email or password.')
      return
    }
    setAuthForm({ username: '', password: '' })
    const admin = await checkIsAdmin()
    setIsAdmin(admin)
    notify(admin ? 'Admin signed in.' : 'Signed in, but this account is not an admin.')
  }

  async function signOut() {
    if (!supabase) return
    setIsAdmin(false)
    setSession(null)
    notify('Signed out.')
    const { error } = await supabase.auth.signOut({ scope: 'global' })
    if (error) {
      reportClientEvent('admin_sign_out_failed', { message: error.message })
    }
  }

  return {
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
  }
}
