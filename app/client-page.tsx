'use client'

import { useState } from 'react'
import dynamic from 'next/dynamic'
import { ErrorBoundary } from '../src/components/ErrorBoundary'
import { MaintenancePage } from '../src/components/MaintenancePage'

// The app uses browser state, localStorage, and direct Supabase calls, so each
// exported route mounts the same client app and lets the client router select
// the active view from the current path.
const App = dynamic(() => import('../src/App'), {
  ssr: false,
  loading: () => <div className="app-loading">Loading leaderboard...</div>,
})

const MAINTENANCE_MODE = process.env.NEXT_PUBLIC_MAINTENANCE_MODE === 'true'
const PREVIEW_KEY = 'pickleranker-preview'

function usePreviewBypass() {
  const [bypass] = useState(() => {
    if (typeof window === 'undefined') return false
    const params = new URLSearchParams(window.location.search)
    if (params.get('preview') === '1') {
      try {
        localStorage.setItem(PREVIEW_KEY, '1')
      } catch {
        // Private mode — preview lasts for this tab only via the URL.
        return true
      }
      return true
    }
    if (params.get('preview') === '0') {
      try {
        localStorage.removeItem(PREVIEW_KEY)
      } catch {
        // Nothing stored — just render maintenance below.
      }
      return false
    }
    try {
      return localStorage.getItem(PREVIEW_KEY) === '1'
    } catch {
      return params.get('preview') === '1'
    }
  })
  return bypass
}

export function ClientPage() {
  const preview = usePreviewBypass()
  if (MAINTENANCE_MODE && !preview) {
    return <MaintenancePage />
  }
  return (
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  )
}
