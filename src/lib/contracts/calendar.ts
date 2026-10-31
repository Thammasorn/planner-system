// src/lib/contracts/calendar.ts — GET /api/calendar (FR-907, §3.3, M5-D7/D8; plan/m05 S0.5). Type-only, isomorphic.
// ◆ milestones arrive in M8 (X24) — no placeholder field here.
import type { HalfDay, ISODate } from '@/domain/types'

export interface CalendarPerson {
  id: string
  displayName: string
  name: string
  positionName: string | null
  color: string | null
  active: boolean
}

/** Viewer is a manager or the owner: everything about the entry. */
export interface CalendarTimeOffFull {
  kind: 'full'
  id: string
  userId: string
  startDate: ISODate
  endDate: ISODate
  half: HalfDay | null
  leaveTypeId: string
  leaveTypeName: string
  leaveTypeColor: string
  leaveTypeArchived: boolean
  note: string | null
}

/** Anyone else (MASK-5): who/when/half + label = th.masking.leave. NO id, type, colour or note. */
export interface CalendarTimeOffMasked {
  kind: 'masked'
  userId: string
  startDate: ISODate
  endDate: ISODate
  half: HalfDay | null
  label: string
}

export type CalendarTimeOff = CalendarTimeOffFull | CalendarTimeOffMasked

export interface CalendarHoliday {
  date: ISODate
  name: string
}

/** `from`/`to` are Mondays, `to` exclusive (≤ 42 days). `people` holds only users that appear in `timeOff`;
 *  `timeOff` is sorted by startDate, then display name. */
export interface CalendarResponse {
  from: ISODate
  to: ISODate
  holidays: CalendarHoliday[]
  people: Record<string, CalendarPerson>
  timeOff: CalendarTimeOff[]
  viewer: { userId: string; canEditOthers: boolean }
}
