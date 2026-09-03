import type { DbMatch, DbPlayer } from './types'

export type OutboxOp =
  | { kind: 'player'; row: DbPlayer; at: string }
  | { kind: 'match'; row: DbMatch; previousId: string | null; at: string }
  | { kind: 'delete-match'; id: string; at: string }
  | { kind: 'tournament'; rows: DbMatch[]; dates: string[]; at: string }

const OUTBOX_KEY = 'pickleranker-outbox-v1'

export function loadOutbox(): OutboxOp[] {
  if (typeof localStorage === 'undefined') return []
  try {
    const raw = localStorage.getItem(OUTBOX_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? (parsed as OutboxOp[]) : []
  } catch {
    return []
  }
}

export function queueOutbox(op: OutboxOp) {
  if (typeof localStorage === 'undefined') return
  try {
    const ops = loadOutbox()
    ops.push(op)
    localStorage.setItem(OUTBOX_KEY, JSON.stringify(ops.slice(-100)))
  } catch {
    // Best effort.
  }
}

function outboxOpId(op: OutboxOp): string {
  if (op.kind === 'player') return `player|${op.row.id}|${op.at}`
  if (op.kind === 'match') return `match|${op.row.id}|${op.previousId ?? 'new'}|${op.at}`
  if (op.kind === 'delete-match') return `delete-match|${op.id}|${op.at}`
  return `tournament|${op.dates.join(',')}|${op.rows.length}|${op.at}`
}

export function clearOutbox(ops: OutboxOp[]) {
  if (typeof localStorage === 'undefined') return
  try {
    const ids = new Set(ops.map(outboxOpId))
    const remaining = loadOutbox().filter((op) => !ids.has(outboxOpId(op)))
    localStorage.setItem(OUTBOX_KEY, JSON.stringify(remaining))
  } catch {
    // Best effort.
  }
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message
  if (typeof error === 'object' && error !== null) {
    const maybe = error as { message?: unknown; code?: unknown }
    const parts = [maybe.message, maybe.code].filter((part) => typeof part === 'string')
    if (parts.length > 0) return (parts as string[]).join(' ')
  }
  return String(error ?? '')
}

export function isNetworkError(error: unknown) {
  const message = errorMessage(error)
  return /failed to fetch|network|offline|fetch failed|timeout/i.test(message)
}
