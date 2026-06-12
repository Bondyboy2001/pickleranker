import { formatRelativeTime } from '../lib/format'

export function SyncStatus({
  lastSyncedAt,
  isLoading,
}: {
  lastSyncedAt: string | null
  isLoading: boolean
}) {
  if (!lastSyncedAt && !isLoading) return null

  return (
    <p className="sync-status" role="status" aria-live="polite">
      {isLoading ? (
        <>
          <span className="sync-dot syncing" aria-hidden="true" />
          Syncing…
        </>
      ) : lastSyncedAt ? (
        <>
          <span className="sync-dot live" aria-hidden="true" />
          Synced {formatRelativeTime(lastSyncedAt)}
        </>
      ) : null}
    </p>
  )
}
