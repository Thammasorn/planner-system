// src/lib/grid/columns.ts — the client column model (FR-801, PLAN §3.10, M6-D15, M6-D35). Pure and isomorphic.
// The GridColumn shape and the buildColumns signature are M7's (plan/m07 S3.1): M6 is the base (week columns only),
// M7 replaces the RangeError branch with day / "รวม" columns without changing a signature (G26).
import { addWeeks, diffDays, weekStart } from '@/domain/dates'
import type { ISODate, PeriodKey } from '@/domain/types'

export const WEEK_W = 64
export const NAME_W = 260
/** Narrowest frozen task/assignee column (phones): the week area keeps the rest (SPEC §7 browser support). */
export const NAME_MIN_W = 120
/** Share of the grid's width the frozen column may take before it is capped at NAME_W. */
export const NAME_SHARE = 0.4
/** Below this frozen-column width the row header switches to its compact layout (shorter person label). */
export const NAME_COMPACT_W = 200
export const TOTAL_W = 72
/** CSS width of the sticky name cells: VirtualGrid sets --grid-name-w from nameColumnWidth(). */
export const NAME_COL_W = `var(--grid-name-w, ${NAME_W}px)`
export const ROW_H = 32
export const HEADER_H = 40
export const CHUNK_WEEKS = 8
export const TIMELINE_WEEKS = 156

/**
 * Width of the frozen task/assignee column for a grid `gridWidth` px wide: 40 % of it, clamped to
 * [NAME_MIN_W, NAME_W], so a phone still shows whole week columns next to it. 0 (not measured yet) → NAME_W.
 */
export function nameColumnWidth(gridWidth: number): number {
  if (!(gridWidth > 0)) return NAME_W
  return Math.max(NAME_MIN_W, Math.min(NAME_W, Math.round(gridWidth * NAME_SHARE)))
}

/** ARIA bookkeeping (C27): header rows above the body (M8 adds the ◆ row → 2) and footer rows below it. Every
 *  aria-rowindex / aria-rowcount is computed from these — never a literal. */
export const HEADER_ROWS = 1
export const FOOTER_ROWS = 3

/** W = week column (M7: also the "รวม" column of an expanded week); D = day column (M7). */
export type ColKind = 'W' | 'D'

export interface GridColumn {
  key: PeriodKey
  kind: ColKind
  role: 'week' | 'day' | 'weekTotal'
  weekStart: ISODate
  date: ISODate
  width: number
  offset: number
}

/** First Monday of the fixed timeline: weekStart(today) − 156 weeks. */
export function timelineStart(today: ISODate): ISODate {
  return addWeeks(weekStart(today), -TIMELINE_WEEKS)
}

/** The 313 Mondays of [timelineStart, weekStart(today) + 157 w). */
export function timelineWeeks(today: ISODate): ISODate[] {
  const start = timelineStart(today)
  const out: ISODate[] = []
  for (let i = 0; i < 2 * TIMELINE_WEEKS + 1; i++) out.push(addWeeks(start, i))
  return out
}

/**
 * M6: one { kind: 'W', role: 'week', key: `W:${w}`, weekStart: w, date: w, width: WEEK_W } per week, offsets
 * cumulative from 0. M6 always passes `new Set()` / `new Map()`; a non-empty `expanded` throws until M7.
 */
export function buildColumns(
  weeks: readonly ISODate[],
  expanded: ReadonlySet<ISODate>,
  dayDatesByWeek: ReadonlyMap<ISODate, readonly ISODate[]>,
): GridColumn[] {
  void dayDatesByWeek // M7 reads it for the day columns of expanded weeks
  if (expanded.size > 0) throw new RangeError('day columns arrive in M7')
  let offset = 0
  return weeks.map((w) => {
    const col: GridColumn = {
      key: `W:${w}`,
      kind: 'W',
      role: 'week',
      weekStart: w,
      date: w,
      width: WEEK_W,
      offset,
    }
    offset += WEEK_W
    return col
  })
}

/** ★ M8 places ◆ with it; −1 when absent. */
export function columnIndexOfPeriod(cols: readonly GridColumn[], key: PeriodKey): number {
  return cols.findIndex((c) => c.key === key)
}

/** Monday of the 8-week chunk that holds `week`, aligned to timelineStart(today). */
export function chunkStartOf(today: ISODate, week: ISODate): ISODate {
  const start = timelineStart(today)
  const weeksFromStart = Math.floor(diffDays(start, weekStart(week)) / 7)
  const chunkIdx = Math.floor(weeksFromStart / CHUNK_WEEKS)
  return addWeeks(start, chunkIdx * CHUNK_WEEKS)
}

/**
 * Visible weeks (cols[first].weekStart … cols[last].weekStart) → chunk starts, ± 1 chunk, clamped to the timeline.
 * Takes weeks, not column indexes, so M7's day columns do not change chunking.
 */
export function chunksForRange(today: ISODate, firstWeek: ISODate, lastWeek: ISODate): ISODate[] {
  const start = timelineStart(today)
  const lastChunk = chunkStartOf(today, addWeeks(start, 2 * TIMELINE_WEEKS))
  const lo = addWeeks(chunkStartOf(today, firstWeek), -CHUNK_WEEKS)
  const hi = addWeeks(chunkStartOf(today, lastWeek), CHUNK_WEEKS)
  const out: ISODate[] = []
  for (let c = lo; diffDays(c, hi) >= 0; c = addWeeks(c, CHUNK_WEEKS)) {
    if (diffDays(start, c) >= 0 && diffDays(c, lastChunk) >= 0) out.push(c)
  }
  return out
}

/** The column the grid opens at: W:(weekStart(today) − 4 w). */
export function initialScrollIndex(cols: readonly GridColumn[], today: ISODate): number {
  return columnIndexOfPeriod(cols, `W:${addWeeks(weekStart(today), -4)}`)
}
