import { describe, expect, it } from 'vitest'
import { formatRelativeTime } from './format'

describe('formatRelativeTime', () => {
  const syncedAt = '2026-07-29T18:00:00.000Z'
  const syncedAtMs = new Date(syncedAt).getTime()

  it('advances consistently as the supplied clock moves forward', () => {
    expect(formatRelativeTime(syncedAt, syncedAtMs + 5_000)).toBe('just now')
    expect(formatRelativeTime(syncedAt, syncedAtMs + 15_000)).toBe('15s ago')
    expect(formatRelativeTime(syncedAt, syncedAtMs + 65_000)).toBe('1 min ago')
    expect(formatRelativeTime(syncedAt, syncedAtMs + 2 * 60 * 60 * 1000)).toBe('2h ago')
  })
})
