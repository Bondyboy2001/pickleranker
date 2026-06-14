import { X } from 'lucide-react'
import { formatRating } from '../lib/scoring'

export function StickyPlayerBar({
  name,
  rank,
  rating,
  onViewProfile,
  onDismiss,
}: {
  name: string
  rank: number
  rating: number
  onViewProfile: () => void
  onDismiss: () => void
}) {
  return (
    <div className="sticky-player-bar" role="status">
      <button type="button" className="sticky-player-main" onClick={onViewProfile}>
        <span>#{rank}</span>
        <strong>{name}</strong>
        <span>{formatRating(rating)} 4DR</span>
      </button>
      <button type="button" className="sticky-player-dismiss" onClick={onDismiss} aria-label="Dismiss">
        <X size={18} />
      </button>
    </div>
  )
}
