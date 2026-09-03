// Week labels are stored as "Results 21-06-2026"; every display of one drops the
// prefix, so strip it in one place rather than repeating the regex at each site.
export function weekLabel(week: string) {
  return week.replace(/^Results\s+/, '')
}

const MONTHS_SHORT = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
] as const

const WEEK_LABEL_DATE = /(\d{1,2})-(\d{2})-(\d{4})/

function shortMonth(monthIndex: number): string {
  return MONTHS_SHORT[monthIndex - 1] ?? ''
}

// "21-06-2026" (or "Results 21-06-2026") -> "21 Jun 2026". Shared by the rating
// chart and any other week-label display so the months array + regex live once.
export function formatWeekLabel(label: string) {
  const match = label.match(WEEK_LABEL_DATE)
  if (!match) return label
  return `${parseInt(match[1], 10)} ${shortMonth(parseInt(match[2], 10))} ${match[3]}`
}

// Compact variant for crowded chart axes: "21 Jun".
export function formatShortWeekLabel(label: string) {
  const match = label.match(WEEK_LABEL_DATE)
  if (!match) return label.slice(0, 6)
  return `${parseInt(match[1], 10)} ${shortMonth(parseInt(match[2], 10))}`
}

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

export function formatRelativeTime(iso: string, now = Date.now()) {
  const then = new Date(iso).getTime()
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
