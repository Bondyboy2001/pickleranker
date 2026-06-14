'use client'

import dynamic from 'next/dynamic'

// The app relies on hash routing, localStorage, and other browser-only APIs,
// so it renders entirely on the client (no SSR) — a faithful port of the SPA.
const App = dynamic(() => import('../src/App'), { ssr: false })

export default function Page() {
  return <App />
}
