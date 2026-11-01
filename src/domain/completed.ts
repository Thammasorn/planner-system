// src/domain/completed.ts — completed tasks and load (SPEC §5.7 BR-50…BR-52, FR-406, X19, X76). Pure.
// BR-50 keys off the leaf's own `completed_on` (BR-80 sets it when the status category becomes DONE).
// BR-51: completing never deletes plans — these helpers only decide what counts.
import { compareISO, isISODate, weekStart } from './dates'
import type { Cd, ISODate } from './types'

/** BR-50: completed_week = weekStart(completed_on); null while the task is open. */
export function completedWeekOf(completedOn: ISODate | null): ISODate | null {
  return completedOn === null ? null : weekStart(completedOn)
}

/** BR-50: a period counts iff the task is open or its week ≤ completedWeek. */
export function countsTowardLoad(weekStartIso: ISODate, completedWeek: ISODate | null): boolean {
  if (completedWeek === null) {
    if (!isISODate(weekStartIso)) throw new RangeError(`Invalid ISODate: ${JSON.stringify(weekStartIso)}`)
    return true
  }
  return compareISO(weekStartIso, completedWeek) <= 0
}

/** BR-52: X = Σ cd with weekStart > completedWeek, N = distinct such weeks; null when X = 0. */
export function releasedLoad(
  rows: readonly { weekStart: ISODate; cd: Cd }[],
  completedWeek: ISODate,
): { cd: Cd; weeks: number } | null {
  let cd = 0
  const weeks = new Set<ISODate>()
  for (const r of rows) {
    if (r.cd <= 0 || countsTowardLoad(r.weekStart, completedWeek)) continue
    cd += r.cd
    weeks.add(r.weekStart)
  }
  return cd === 0 ? null : { cd, weeks: weeks.size }
}

/** FR-406: Σ counted cd with weekStart ≥ fromWeek (BR-50 per row). */
export function futureLoad(
  rows: readonly { weekStart: ISODate; cd: Cd; completedWeek: ISODate | null }[],
  fromWeek: ISODate,
): Cd {
  let cd = 0
  for (const r of rows) {
    if (compareISO(r.weekStart, fromWeek) >= 0 && countsTowardLoad(r.weekStart, r.completedWeek)) cd += r.cd
  }
  return cd
}
