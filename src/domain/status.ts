// src/domain/status.ts — per-project task statuses (SPEC v3.1 BR-80–84, FR-621–623, M3-D25/26). Pure.
// S0 wrote the constants block (zod schemas, factories and ensureProjectStatuses import it); S1 added the
// functions test-first (status.test.ts). Names are mapped at the service edge from
// th.tasks.status.defaults[key] — no i18n here.
import type { ISODate, TaskStatusCategory } from './types'

/** Live statuses per project (FR-622, M3-D26). */
export const MAX_STATUSES = 12

/** Fixed colour palette (M3-D25); the first entry is the SPEC DDL default. */
export const STATUS_COLORS = [
  '#94A3B8', // slate
  '#2F5597', // blue
  '#0F766E', // teal
  '#15803D', // green
  '#B45309', // amber
  '#C2410C', // orange
  '#B91C1C', // red
  '#7C3AED', // purple
] as const
export type StatusColor = (typeof STATUS_COLORS)[number]

/** FR-621: the 5 default statuses of every project, in board order. */
export const DEFAULT_STATUSES = [
  { key: 'todo', category: 'TODO', color: '#94A3B8' },
  { key: 'doing', category: 'IN_PROGRESS', color: '#2F5597' },
  { key: 'waitData', category: 'WAITING', color: '#B45309' },
  { key: 'blocked', category: 'WAITING', color: '#B91C1C' },
  { key: 'done', category: 'DONE', color: '#15803D' },
] as const satisfies readonly { key: string; category: TaskStatusCategory; color: StatusColor }[]
export type DefaultStatusKey = (typeof DEFAULT_STATUSES)[number]['key']

// ── Functions (S1.5) ──

export interface StatusLike {
  id: string
  name: string
  category: TaskStatusCategory
  /** Fractional key; compared in byte order with < / > (X48), never localeCompare. */
  position: string
}

const cmp = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0)

/** A sorted copy: position byte order, then id. */
export function sortStatuses<T extends StatusLike>(s: readonly T[]): T[] {
  return [...s].sort((a, b) => cmp(a.position, b.position) || cmp(a.id, b.id))
}

/** First status of a category in board order, or null when the set has none (FR-666). */
export function firstOfCategory<T extends StatusLike>(s: readonly T[], c: TaskStatusCategory): T | null {
  let best: T | null = null
  for (const x of s) {
    if (x.category !== c) continue
    if (best === null || (cmp(x.position, best.position) || cmp(x.id, best.id)) < 0) best = x
  }
  return best
}

/** BR-81: the project's default status = the TODO with the smallest position. RangeError when there is none. */
export function defaultStatus<T extends StatusLike>(s: readonly T[]): T {
  const found = firstOfCategory(s, 'TODO')
  if (found === null) throw new RangeError('status set has no TODO status (BR-84)')
  return found
}

/** BR-82: the checkbox target = the DONE with the smallest position. RangeError when there is none. */
export function firstDoneStatus<T extends StatusLike>(s: readonly T[]): T {
  const found = firstOfCategory(s, 'DONE')
  if (found === null) throw new RangeError('status set has no DONE status (BR-84)')
  return found
}

/**
 * BR-80: into DONE → today; out of DONE → null; DONE → DONE keeps the date; non-DONE → non-DONE unchanged.
 * `changed` is true when `completedOn` differs from the input.
 */
export function completionTransition(a: {
  from: TaskStatusCategory
  to: TaskStatusCategory
  completedOn: ISODate | null
  today: ISODate
}): { completedOn: ISODate | null; changed: boolean } {
  const wasDone = a.from === 'DONE'
  const isDone = a.to === 'DONE'
  if (!wasDone && isDone) return { completedOn: a.today, changed: true }
  if (wasDone && !isDone) return { completedOn: null, changed: true }
  return { completedOn: a.completedOn, changed: false }
}

export type StatusSetProblem = 'TOO_MANY' | 'DUPLICATE_NAME' | 'NO_TODO' | 'NO_DONE'

/** BR-84 / FR-622 on a would-be live status set; one problem in M3-D26 order, or null when valid. */
export function validateStatusSet(
  s: readonly Pick<StatusLike, 'name' | 'category'>[],
): StatusSetProblem | null {
  if (s.length > MAX_STATUSES) return 'TOO_MANY'
  const names = new Set(s.map((x) => x.name.trim().toLowerCase()))
  if (names.size !== s.length) return 'DUPLICATE_NAME'
  if (!s.some((x) => x.category === 'TODO')) return 'NO_TODO'
  if (!s.some((x) => x.category === 'DONE')) return 'NO_DONE'
  return null
}
