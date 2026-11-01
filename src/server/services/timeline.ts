// src/server/services/timeline.ts — the fixed planning timeline (X65, M6-D7/D15/D16/D17): weekStart(today) − 156 w …
// weekStart(today) + 157 w (exclusive). "All-time" plan figures (row "รวม", BR-52 released load, FR-406 future load)
// use this bound so every `allocations` query keeps a week_start range (SPEC §6.5, R20). Pure.
import { addWeeks, weekStart } from '@/domain/dates'
import type { ISODate } from '@/domain/types'

export const TIMELINE_WEEKS_BACK = 156
export const TIMELINE_WEEKS_AHEAD = 157

/** [weekStart(today) − 156 w, weekStart(today) + 157 w). */
export function timelineBound(today: ISODate): { from: ISODate; to: ISODate } {
  const ws = weekStart(today)
  return { from: addWeeks(ws, -TIMELINE_WEEKS_BACK), to: addWeeks(ws, TIMELINE_WEEKS_AHEAD) }
}
