import Link from 'next/link'

export default function NotFound() {
  return (
    <main className="app-shell" style={{ padding: 32, textAlign: 'center' }}>
      <h1>Page not found</h1>
      <p>
        That link doesn&apos;t match a leaderboard view. <Link href="/">Back to Overall</Link> ·{' '}
        <Link href="/weekly">Weekly</Link> · <Link href="/players">Players</Link> ·{' '}
        <Link href="/how-4dr">How 4DR works</Link>
      </p>
    </main>
  )
}
