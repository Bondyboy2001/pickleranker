import { useEffect, useState } from 'react'
import { formatRelativeTime } from '../lib/format'

export function SyncStatus({
  lastSyncedAt,
  isLoading,
  hasVisibleData,
}: {
  lastSyncedAt: string | null
  isLoading: boolean
  hasVisibleData: boolean
}) {
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    if (!lastSyncedAt || isLoading) return
    const timer = window.setInterval(() => setNow(Date.now()), 10_000)
    return () => window.clearInterval(timer)
  }, [isLoading, lastSyncedAt])

  if (!lastSyncedAt && !isLoading) return null

  return (
    <p className="sync-status" role="status">
      {isLoading ? (
        <span aria-live="polite">
          <span className="sync-dot syncing" aria-hidden="true" />
          {hasVisibleData ? 'Showing saved standings · updating…' : 'Syncing data…'}
        </span>
      ) : lastSyncedAt ? (
        <span aria-live="off">
          <span className="sync-dot live" aria-hidden="true" />
          Data synced {formatRelativeTime(lastSyncedAt, now)}
        </span>
      ) : null}
    </p>
  )
}
