// src/domain/milestone.ts — milestones (SPEC §4.7, §5.9 BR-70/BR-71; plan/m08 §5.S1, M8-D6, X66).
// Pure: plan dates are ISODate strings and every comparison goes through ./dates.
import { addDays, compareISO, diffDays, isoWeekday, weekStart } from './dates'
import type { ISODate, LateReason, MilestoneStatus } from './types'

/** BR-70: `date − today ≤ 7` (and not past) → DUE_SOON. */
export const DUE_SOON_DAYS = 7

/** X66: BR-71 looks at plans up to 3 years after the milestone; the SQL bound `m.date + 1096` uses the same value. */
export const LATE_LOOKAHEAD_DAYS = 1096

/** BR-70: completed → DONE; date < today → OVERDUE; date − today ≤ 7 → DUE_SOON; else UPCOMING. */
export function milestoneStatus(
  m: { date: ISODate; completedOn: ISODate | null },
  today: ISODate,
): MilestoneStatus {
  if (m.completedOn !== null) return 'DONE'
  const days = diffDays(today, m.date)
  if (days < 0) return 'OVERDUE'
  return days <= DUE_SOON_DAYS ? 'DUE_SOON' : 'UPCOMING'
}

/**
 * Facts about one bound task (M8-D6): whether it is completed (BR-50), its due date, the latest
 * WEEK allocation `week_start` and the latest DAY allocation `period_start` of the task and its
 * live, not-completed descendants (null when none).
 */
export interface LateFacts {
  completed: boolean
  dueDate: ISODate | null
  lastWeekStart: ISODate | null
  lastDayDate: ISODate | null
}

const after = (d: ISODate | null, milestoneDate: ISODate): boolean =>
  d !== null && compareISO(d, milestoneDate) > 0

/**
 * BR-71: why a not-completed bound task is late, in the order WEEK_PLAN, DAY_PLAN, DUE_DATE.
 * A WEEK row in the milestone's own week is never late (its week_start ≤ date); a DAY row later
 * in that week is (X66).
 */
export function lateReasons(milestoneDate: ISODate, f: LateFacts): LateReason[] {
  if (f.completed) return []
  const reasons: LateReason[] = []
  if (after(f.lastWeekStart, milestoneDate)) reasons.push('WEEK_PLAN')
  if (after(f.lastDayDate, milestoneDate)) reasons.push('DAY_PLAN')
  if (after(f.dueDate, milestoneDate)) reasons.push('DUE_DATE')
  return reasons
}

export function isLateForMilestone(milestoneDate: ISODate, f: LateFacts): boolean {
  return lateReasons(milestoneDate, f).length > 0
}

/** Milestone `late` = at least one late bound task (M8-D6), whatever the milestone's own status. */
export function milestoneLateness(
  milestoneDate: ISODate,
  tasks: readonly LateFacts[],
): { late: boolean; lateTaskCount: number } {
  let lateTaskCount = 0
  for (const t of tasks) if (isLateForMilestone(milestoneDate, t)) lateTaskCount++
  return { late: lateTaskCount > 0, lateTaskCount }
}

/** FR-703 "เสร็จ done/total งาน" over the non-deleted bound tasks (any depth, X66). */
export function milestoneProgress(tasks: readonly { completed: boolean }[]): { done: number; total: number } {
  let done = 0
  for (const t of tasks) if (t.completed) done++
  return { done, total: tasks.length }
}

/** FR-707 / X66: the day with `date`'s weekday in the week starting `targetWeekStart` (a Monday). */
export function dateInWeekKeepingWeekday(date: ISODate, targetWeekStart: ISODate): ISODate {
  if (weekStart(targetWeekStart) !== targetWeekStart) {
    throw new RangeError(`targetWeekStart must be a Monday, got ${JSON.stringify(targetWeekStart)}`)
  }
  return addDays(targetWeekStart, isoWeekday(date) - 1)
}

/** Order by date, then id in byte (code unit) order — not locale-aware, so stable across runtimes. */
export function compareMilestones(a: { date: ISODate; id: string }, b: { date: ISODate; id: string }): number {
  const byDate = compareISO(a.date, b.date)
  if (byDate !== 0) return byDate
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0
}
