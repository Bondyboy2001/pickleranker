import { X } from 'lucide-react'

export function NoticeBanner({
  message,
  onDismiss,
}: {
  message: string
  onDismiss: () => void
}) {
  if (!message) return null

  return (
    <div className="notice-banner" role="status">
      <span>{message}</span>
      <button type="button" className="notice-dismiss" onClick={onDismiss} aria-label="Dismiss">
        <X size={16} />
      </button>
    </div>
  )
}
