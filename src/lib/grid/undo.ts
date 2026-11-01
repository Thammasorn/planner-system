// src/lib/grid/undo.ts — week snapshots for exact undo/redo of grid gestures (SPEC §7.5, AC-805, M6-D13, r6b §4.3).
// ★ M7 reuses this file unchanged. Pure.
import { daysOfWeek, weekStart } from '@/domain/dates'
import type { Cd, ISODate } from '@/domain/types'
import type { AssigneeCell, Change, WeekState } from '@/lib/contracts/grid'
import { nextCell } from './cache-ops'
import type { CellWrite } from './queue'

/** Complete week snapshot (r6b §4.3): DAY weeks always carry all 7 days (incl. BR-25 boundary weeks); WEEK weeks carry
 *  weekCd. */
export interface WeekSnapshot {
  taskAssignmentId: string
  week: ISODate
  resolution: 'WEEK' | 'DAY' | null
  weekCd: Cd
  days: Record<ISODate, Cd>
}

function allDays(week: ISODate, days: Readonly<Record<ISODate, Cd>> | undefined): Record<ISODate, Cd> {
  const out: Record<ISODate, Cd> = {}
  for (const d of daysOfWeek(week)) out[d] = days?.[d] ?? 0
  return out
}

export function snapshotOf(
  cell: AssigneeCell | undefined,
  taskAssignmentId: string,
  week: ISODate,
): WeekSnapshot {
  if (!cell || cell.cd === 0) return { taskAssignmentId, week, resolution: null, weekCd: 0, days: {} }
  if (cell.resolution === 'WEEK')
    return { taskAssignmentId, week, resolution: 'WEEK', weekCd: cell.cd, days: {} }
  return { taskAssignmentId, week, resolution: 'DAY', weekCd: cell.cd, days: allDays(week, cell.days) }
}

export function snapshotFromState(state: WeekState, taskAssignmentId: string, week: ISODate): WeekSnapshot {
  if (state.resolution === null || state.cd === 0)
    return { taskAssignmentId, week, resolution: null, weekCd: 0, days: {} }
  if (state.resolution === 'WEEK')
    return { taskAssignmentId, week, resolution: 'WEEK', weekCd: state.cd, days: {} }
  return { taskAssignmentId, week, resolution: 'DAY', weekCd: state.cd, days: allDays(week, state.days) }
}

/** DAY → seven DAY changes (null for empty days); WEEK → one WEEK change; null → WEEK null. Sent with
 *  onDayWeekConflict 'COLLAPSE'. */
export function snapshotToChanges(s: WeekSnapshot): Change[] {
  if (s.resolution === 'DAY') {
    return daysOfWeek(s.week).map((d) => {
      const cd = s.days[d] ?? 0
      return { granularity: 'DAY' as const, period: d, cd: cd === 0 ? null : cd }
    })
  }
  return [
    { granularity: 'WEEK', period: s.week, cd: s.resolution === 'WEEK' && s.weekCd !== 0 ? s.weekCd : null },
  ]
}

export function snapshotWrites(s: WeekSnapshot): CellWrite[] {
  return snapshotToChanges(s).map((c) => ({ taskAssignmentId: s.taskAssignmentId, ...c }))
}

export interface GridUndoEntry {
  label: string
  before: WeekSnapshot[]
  after: WeekSnapshot[]
  /** conflict epoch per assignment when the entry was recorded (stale when it moved, M6-D13) */
  epochs: Map<string, number>
}

/** Before/after snapshots of one gesture: one per touched (assignment, week), from the current cells + the writes. */
export function gestureSnapshots(
  writes: readonly CellWrite[],
  cellAt: (taskAssignmentId: string, week: ISODate) => AssigneeCell | undefined,
): { before: WeekSnapshot[]; after: WeekSnapshot[] } {
  const groups = new Map<string, { taId: string; week: ISODate; writes: CellWrite[] }>()
  for (const w of writes) {
    const week = w.granularity === 'WEEK' ? w.period : weekStart(w.period)
    const k = `${w.taskAssignmentId}|${week}`
    const g = groups.get(k)
    if (g) g.writes.push(w)
    else groups.set(k, { taId: w.taskAssignmentId, week, writes: [w] })
  }
  const before: WeekSnapshot[] = []
  const after: WeekSnapshot[] = []
  for (const g of groups.values()) {
    const cell = cellAt(g.taId, g.week)
    before.push(snapshotOf(cell, g.taId, g.week))
    after.push(snapshotOf(nextCell(cell, g.writes), g.taId, g.week))
  }
  return { before, after }
}

/** Whether any assignment of the entry hit a VERSION_CONFLICT since it was recorded. */
export function isStale(entry: Pick<GridUndoEntry, 'epochs'>, epochOf: (id: string) => number): boolean {
  for (const [id, e] of entry.epochs) if (epochOf(id) !== e) return true
  return false
}
