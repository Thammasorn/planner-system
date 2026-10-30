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
