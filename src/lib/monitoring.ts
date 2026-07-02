type MonitorContext = Record<string, string | number | boolean | null | undefined>

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
  }

  window.dispatchEvent(new CustomEvent('pickleranker:monitor', { detail: payload }))
}
