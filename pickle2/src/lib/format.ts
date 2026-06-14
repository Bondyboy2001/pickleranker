export function formatWinRate(wins: number, games: number) {
  if (games === 0) return '0.0%'
  return `${((wins / games) * 100).toFixed(1)}%`
}

export function movementClass(value: number) {
  if (value > 0) return 'movement positive'
  if (value < 0) return 'movement negative'
  return 'movement'
}

export function formatPercent(value: number) {
  return `${(value * 100).toFixed(2)}%`
}

export function formatSignedPoints(value: number) {
  return `${value >= 0 ? '+' : ''}${value.toFixed(3)}`
}

export function formatGameRating(value: number) {
  return (Math.round((value + Number.EPSILON) * 1000) / 1000).toFixed(3)
}

export function formatRelativeTime(iso: string) {
  const then = new Date(iso).getTime()
  const now = Date.now()
  const seconds = Math.floor((now - then) / 1000)
  if (seconds < 10) return 'just now'
  if (seconds < 60) return `${seconds}s ago`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes} min ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}
