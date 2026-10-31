// src/domain/types.ts — type-only contract (M1-D24): no runtime statements, so the domain coverage gate is
// unaffected. S0 creates it so DTOs compile before S1; the domain stream owns it afterwards.

/** Calendar date of a plan, 'YYYY-MM-DD' (BR-04). Never a JS Date. */
export type ISODate = string
/** Load / capacity in centi-days: integer, 100 = one person-day (BR-01). */
export type Cd = number
/** ISO weekday: 1 = Monday … 7 = Sunday (BR-05). */
export type Weekday = 1 | 2 | 3 | 4 | 5 | 6 | 7
/** Work schedule: weekday → fraction in cd; a missing weekday = not working (FR-207). */
export type Schedule = Partial<Record<Weekday, Cd>>
/** Allowed per-day fractions of a work schedule (X60). */
export type FractionCd = 25 | 50 | 75 | 100
/** Project certainty (SPEC §5.5 BR-35..BR-37): TENTATIVE load counts as `atRisk`, not `committed`. */
export type Certainty = 'CONFIRMED' | 'TENTATIVE'
/** Role inside a project (SPEC §3.1, `project_members.role`). */
export type ProjectRole = 'LEAD' | 'MEMBER'
/** Category of a per-project task status (SPEC v3.1 §4.6.1, BR-80): only `DONE` counts as completed. */
export type TaskStatusCategory = 'TODO' | 'IN_PROGRESS' | 'WAITING' | 'DONE'
/** Half-day leave (SPEC §6.2 `half_day`): AM = ครึ่งวันเช้า, PM = ครึ่งวันบ่าย; null elsewhere = full day. */
export type HalfDay = 'AM' | 'PM'
/** One live leave entry reduced to what capacity needs (BR-10). fractionCd: 100 = full day, 50 = half day. */
export interface TimeOffSpan {
  startDate: ISODate
  endDate: ISODate
  fractionCd: 50 | 100
}
