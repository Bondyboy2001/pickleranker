'use client'

import dynamic from 'next/dynamic'
import { ErrorBoundary } from '../src/components/ErrorBoundary'

// The app uses browser state, localStorage, and direct Supabase calls, so each
// exported route mounts the same client app and lets the client router select
// the active view from the current path.
const App = dynamic(() => import('../src/App'), {
  ssr: false,
  loading: () => <div className="app-loading">Loading leaderboard...</div>,
})

export function ClientPage() {
  return (
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  )
}
