// src/server/services/capacity.ts — capacity loader (BR-10…13, BR-41; PLAN §3.10, r6a M5-14; plan/m05 S0.13/S2.5).
// Reads schedules, holidays, `deactivated_on` and live leave for a set of users and a Monday-aligned range, then
// delegates every number to src/domain/capacity.ts (integer cd). Reused by M6 (footer, f/h) and M9. Never reads the
// clock (X56). Reactivation clears deactivated_on, so capacity is back to normal for every date (M5-D17).
import { capacityByDay, capacityByWeek, toTimeOffSpan } from '@/domain/capacity'
import { compareISO, isoWeekday } from '@/domain/dates'
import type { ISODate, Schedule, TimeOffSpan } from '@/domain/types'
import type { UserCapacity } from '@/lib/contracts/capacity'
import type { DbOrTx } from '../db/types'
import * as repo from '../repo'

/** [from, to): both Mondays. */
export interface DateRange {
  from: ISODate
  to: ISODate
}

/** A live leave span that keeps its entry id (updateTimeOff swaps one entry's span for the impact). */
export interface TimeOffSpanWithId extends TimeOffSpan {
  id: string
}

export interface CapacityInputs {
  holidays: ReadonlySet<ISODate>
  /** Only users that exist; unknown ids are absent. */
  users: Map<string, { schedule: Schedule; deactivatedOn: ISODate | null; timeOff: TimeOffSpanWithId[] }>
}

/** Everything the pure capacity functions need for `userIds` over `range` (live leave overlapping it only). */
export async function loadCapacityInputs(
  tx: DbOrTx,
  userIds: readonly string[],
  range: DateRange,
): Promise<CapacityInputs> {
  const holidays = new Set((await repo.holidays.listInRange(tx, range.from, range.to)).map((h) => h.date))
  const users: CapacityInputs['users'] = new Map()
  const ids = [...new Set(userIds)]
  if (ids.length === 0) return { holidays, users }

  // numeric(3,2) → cd happens in the repo (BR-02, X02); the service only sees integer cd.
  const deactivated = await repo.users.listDeactivatedOn(tx, ids)
  const schedules = await repo.users.listSchedules(tx, ids)
  for (const [id, deactivatedOn] of deactivated) {
    users.set(id, { schedule: schedules.get(id) ?? {}, deactivatedOn, timeOff: [] })
  }

  for (const r of await repo.timeOff.listSpans(tx, ids, range.from, range.to)) {
    users.get(r.userId)?.timeOff.push({ id: r.id, ...toTimeOffSpan(r) })
  }
  return { holidays, users }
}

/** Per user: per-day and per-week `{ capacityCd, standardCd }` over `range` (RangeError unless Monday-aligned). */
export async function loadCapacity(
  tx: DbOrTx,
  userIds: readonly string[],
  range: DateRange,
): Promise<Map<string, UserCapacity>> {
  if (isoWeekday(range.from) !== 1 || isoWeekday(range.to) !== 1 || compareISO(range.from, range.to) >= 0) {
    throw new RangeError(`capacity range must be [Monday, later Monday): ${range.from}..${range.to}`)
  }
  const inputs = await loadCapacityInputs(tx, userIds, range)
  const out = new Map<string, UserCapacity>()
  for (const [id, u] of inputs.users) {
    const profile = {
      schedule: u.schedule,
      holidays: inputs.holidays,
      timeOff: u.timeOff,
      deactivatedOn: u.deactivatedOn,
    }
    out.set(id, {
      days: capacityByDay(profile, range.from, range.to),
      weeks: capacityByWeek(profile, range.from, range.to),
    })
  }
  return out
}
