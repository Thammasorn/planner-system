// src/lib/people/schedule.ts — the work-schedule line of a person page header (FR-1008, M9-D14). Pure; integer cd in,
// Thai text out (labels from th, numbers via cdToNumeric — no float maths).
import type { Cd, Weekday } from '@/domain/types'
import { cdToNumeric } from '@/domain/units'
import { th } from '@/i18n/th'

const WEEKDAYS: readonly Weekday[] = [1, 2, 3, 4, 5, 6, 7]
const WORKWEEK: readonly Weekday[] = [1, 2, 3, 4, 5]

/** Mon–Fri with one equal value and nothing else → "จ–ศ · 1.00 วัน/วัน"; otherwise "จ 1.00 · พ 1.00 · …";
 *  no working day → th.people.schedule.none. */
export function formatSchedule(schedule: Partial<Record<Weekday, Cd>>): string {
  const days = WEEKDAYS.filter((d) => (schedule[d] ?? 0) > 0)
  const s = th.people.schedule
  if (days.length === 0) return s.none
  const short = th.employees.schedule.weekdayShort
  const first = schedule[1] ?? 0
  const isWorkweek = days.length === WORKWEEK.length && WORKWEEK.every((d) => schedule[d] === first)
  if (isWorkweek) return s.perDay(`${short[1]}–${short[5]}`, cdToNumeric(first))
  return s.mixed(days.map((d) => s.part(short[d], cdToNumeric(schedule[d] ?? 0))).join(' · '))
}
