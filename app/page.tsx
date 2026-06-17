'use client'

import dynamic from 'next/dynamic'
import { ErrorBoundary } from '../src/components/ErrorBoundary'

// The app relies on hash routing, localStorage, and other browser-only APIs,
// so it renders entirely on the client (no SSR) — a faithful port of the SPA.
const App = dynamic(() => import('../src/App'), {
  ssr: false,
  loading: () => <div className="app-loading">Loading leaderboard…</div>,
})

export default function Page() {
  return (
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  )
}
