type MonitorContext = Record<string, string | number | boolean | null | undefined>

const BUFFER_KEY = 'pickleranker-monitor-buffer'
const MAX_BUFFER = 50

function bufferEvent(payload: object) {
  try {
    const raw = localStorage.getItem(BUFFER_KEY)
    const arr = raw ? (JSON.parse(raw) as object[]) : []
    arr.push(payload)
    localStorage.setItem(BUFFER_KEY, JSON.stringify(arr.slice(-MAX_BUFFER)))
  } catch {
    // Best effort.
  }
}

export function reportClientEvent(
  event: string,
  error?: unknown,
  context: MonitorContext = {},
) {
  const message = error instanceof Error ? error.message : String(error ?? '')
  const payload = {
    event,
    message,
    context,
    at: new Date().toISOString(),
  }

  if (process.env.NODE_ENV !== 'production') {
    console.warn('[monitor]', payload)
  } else {
    console.error('[monitor]', payload.event, payload.message)
  }
  bufferEvent(payload)

  try {
    window.dispatchEvent(new CustomEvent('pickleranker:monitor', { detail: payload }))
  } catch {
    // Non-browser or closed — buffer already kept.
  }
}
