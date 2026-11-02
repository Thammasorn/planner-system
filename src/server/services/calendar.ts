// src/server/services/calendar.ts — month calendar data (FR-907, §3.3, X43, M5-D7/D8; plan/m05 S0.13/S2.6).
// People = visibleUserIds(viewer), resolved before any leave is selected and passed to SQL; every entry passes
// through masking.maskTimeOff before it is serialised (other people's leave = "ลา" without id / type / colour /
// note). `people` holds only the users that appear in `timeOff`.
import type { ISODate } from '@/domain/types'
import type { CalendarPerson, CalendarResponse } from '@/lib/contracts/calendar'
import { compareThai } from '@/lib/collate'
import { displayName } from '@/lib/display-name'
import * as authz from '../authz'
import type { DbOrTx } from '../db/types'
import * as repo from '../repo'
import type { SessionUser } from '../session'
import type { DateRange } from './capacity'
import { listHolidaysInRange } from './holidays'
import { maskTimeOff } from './masking'
import { listVisibleMilestones } from './milestones'

/** `today` (X90) comes from the route (serverToday()); it drives milestone status on ◆ (M8-D16). */
export async function getCalendar(
  tx: DbOrTx,
  viewer: SessionUser,
  range: DateRange,
  today: ISODate,
): Promise<CalendarResponse> {
  const visible = await authz.visibleUserIds(tx, viewer) // before selecting any leave
  const rows = await repo.timeOff.listForCalendar(
    tx,
    visible === 'ALL' ? null : [...visible],
    range.from,
    range.to,
  )
  const holidays = await listHolidaysInRange(tx, range)

  const people: Record<string, CalendarPerson> = {}
  for (const p of await repo.users.listCalendarPeople(tx, [...new Set(rows.map((r) => r.userId))])) {
    people[p.id] = {
      id: p.id,
      displayName: displayName(p),
      name: p.name,
      positionName: p.positionName,
      color: p.color,
      active: p.active,
    }
  }
  const nameOf = (id: string) => people[id]?.displayName ?? ''
  const timeOff = rows
    .filter((r) => people[r.userId] !== undefined)
    .sort(
      (a, b) =>
        a.startDate.localeCompare(b.startDate) ||
        compareThai(nameOf(a.userId), nameOf(b.userId)) ||
        a.userId.localeCompare(b.userId),
    )
    .map((r) => maskTimeOff(r, authz.canSeeLeaveDetails(viewer, r.userId)))

  return {
    from: range.from,
    to: range.to,
    holidays,
    people,
    timeOff,
    milestones: await listVisibleMilestones(tx, viewer, range, today), // visible, non-archived projects (M8-D16)
    viewer: { userId: viewer.id, canEditOthers: authz.isManager(viewer) },
  }
}
