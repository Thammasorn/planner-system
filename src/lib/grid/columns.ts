// src/lib/grid/columns.ts — the client column model (FR-801, PLAN §3.10, M6-D15, M6-D35). Pure and isomorphic.
// The GridColumn shape and the buildColumns signature are M7's (plan/m07 S3.1): M6 is the base (week columns only),
// M7 adds the day / "รวม" columns of expanded weeks without changing a signature (G26).
import { addWeeks, daysOfWeek, diffDays, weekStart } from '@/domain/dates'
import type { ISODate, PeriodKey } from '@/domain/types'
import type { GridDensity } from '@/lib/schemas/preferences'
import { ASSIGNEE_W, TASK_W_DEFAULT } from './frozen'

/** Week column width at the default density (v3.8: 64 → 52 px, FR-822). */
export const WEEK_W = 52
/** M7.1-D8: the frozen area is two columns; their widths come from src/lib/grid/frozen.ts#frozenWidths(). */
export const TOTAL_W = 72
/** CSS widths of the frozen cells: VirtualGrid sets --grid-task-w / --grid-assignee-w from frozenWidths() (M7.1-D8). */
export const TASK_COL_W = `var(--grid-task-w, ${TASK_W_DEFAULT}px)`
export const ASSIGNEE_COL_W = `var(--grid-assignee-w, ${ASSIGNEE_W}px)`
/** task + assignee (0 when hidden): row headers, footer labels and header corners span both. */
export const FROZEN_COL_W = `calc(${TASK_COL_W} + ${ASSIGNEE_COL_W})`
/** Below this task-column width the row header switches to its compact layout (M7.1-D8). */
export const TASK_COMPACT_W = 200
export const ROW_H = 32
/** The period (week / day) header row. */
export const HEADER_H = 40
/** M7.1 (FR-818, M7.1-D10): the month-year row above it. */
export const MONTH_H = 24
/** M8 (FR-705, M8-D26): the ◆ Milestones row on top of the header (◆ → month → week / day, SPEC §8.3). */
export const MS_ROW_H = 28
/** Everything above the first body row; the row virtualizer's paddingStart / scrollPaddingStart. */
export const HEADER_TOTAL_H = MS_ROW_H + MONTH_H + HEADER_H
export const CHUNK_WEEKS = 8
export const TIMELINE_WEEKS = 156

/** ARIA bookkeeping (C27, X85): header rows above the body (M8: ◆ row 1, month row 2, period row 3) and footer rows
 *  below it. Every aria-rowindex / aria-rowcount is computed from these — never a literal. */
export const HEADER_ROWS = 3
/** M8: the ◆ row is the first header row. */
export const MS_ROW_INDEX = 1
export const FOOTER_ROWS = 3
/** Frozen ARIA columns before the first period column: งาน (1) and ผู้รับผิดชอบ (2). With the assignee column hidden
 *  the task cells span both (aria-colspan 2), so period column indexes never shift (M7.1-D8). */
export const FROZEN_COLS = 2
/** The sticky footer's top border (grid.module.css .footer) and the scroller's own border (top + bottom), px. */
export const FOOTER_BORDER_H = 2
export const SCROLLER_BORDER_H = 2

/**
 * Natural height (px) of the grid scroller: header group + body rows + sticky footer + borders + a horizontal
 * scrollbar when the platform draws one. The scroller is sized to this and only shrinks below it to fit the screen
 * (SPEC §8.12 / D19: no empty slab under a short plan; the กราฟภาระ pane sits right under the grid).
 */
export function gridContentHeight(bodyH: number, scrollbarH = 0): number {
  return (
    Math.max(bodyH, HEADER_TOTAL_H) +
    FOOTER_ROWS * ROW_H +
    FOOTER_BORDER_H +
    SCROLLER_BORDER_H +
    Math.max(0, scrollbarH)
  )
}

/** aria-colindex of period column `c` (0-based). */
export function periodColIndex(c: number): number {
  return c + FROZEN_COLS + 1
}

/** aria-colindex of the sticky "รวม" column; also the grid's aria-colcount. */
export function totalColIndex(colCount: number): number {
  return colCount + FROZEN_COLS + 1
}

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

export const DAY_W = 44
export const WEEK_TOTAL_W = 52
export const WIDTH = { week: WEEK_W, day: DAY_W, weekTotal: WEEK_TOTAL_W } as const
/** v3.8 (FR-822) แคบ: more weeks on a narrow screen; values in --font-xs, the week header shows the day only. */
export const WIDTH_COMPACT = { week: 36, day: 36, weekTotal: 36 } as const

/** Column widths of a density (the one source for the grid, its load chart and the /workload table). */
export function densityWidths(density: GridDensity = 'NORMAL'): {
  week: number
  day: number
  weekTotal: number
} {
  return density === 'COMPACT' ? WIDTH_COMPACT : WIDTH
}

/** The week header text: "28/9" (NORMAL) or "28" (COMPACT — the month row above gives the month; the full date stays
 *  in the header's aria-label / title). */
export function weekHeaderText(weekStart: ISODate, density: GridDensity = 'NORMAL'): string {
  const d = Number(weekStart.slice(8, 10))
  return density === 'COMPACT' ? String(d) : `${d}/${Number(weekStart.slice(5, 7))}`
}

/** A cell value at a density: COMPACT drops a zero fraction ("5.0" → "5", "1.00" → "1"; "2.5" stays). */
export function densityValue(text: string, density: GridDensity = 'NORMAL'): string {
  return density === 'COMPACT' ? text.replace(/^(-?\d+)\.0+$/, '$1') : text
}

/**
 * Collapsed week → one { kind: 'W', role: 'week', key: `W:${w}`, width: WEEK_W }. M7 (M7-D10): an expanded week → its
 * day columns (dates from dayDatesByWeek.get(week), i.e. the loaded chunk's D: periods; Mon–Fri placeholders while
 * absent), each { kind: 'D', role: 'day', key: `D:${d}`, weekStart: week, date: d, width: DAY_W }, then one
 * { kind: 'W', role: 'weekTotal', key: `W:${week}`, date: week, width: WEEK_TOTAL_W }. Offsets cumulative from 0.
 */
export function buildColumns(
  weeks: readonly ISODate[],
  expanded: ReadonlySet<ISODate>,
  dayDatesByWeek: ReadonlyMap<ISODate, readonly ISODate[]>,
  density: GridDensity = 'NORMAL',
): GridColumn[] {
  const W = densityWidths(density)
  let offset = 0
  const out: GridColumn[] = []
  const push = (c: Omit<GridColumn, 'offset'>) => {
    out.push({ ...c, offset })
    offset += c.width
  }
  for (const w of weeks) {
    if (!expanded.has(w)) {
      push({ key: `W:${w}`, kind: 'W', role: 'week', weekStart: w, date: w, width: W.week })
      continue
    }
    const dates = dayDatesByWeek.get(w) ?? daysOfWeek(w).slice(0, 5)
    for (const d of dates)
      push({ key: `D:${d}`, kind: 'D', role: 'day', weekStart: w, date: d, width: W.day })
    push({ key: `W:${w}`, kind: 'W', role: 'weekTotal', weekStart: w, date: w, width: W.weekTotal })
  }
  return out
}

/** The sticky "รวม" column's width as a CSS length (VirtualGrid sets --grid-total-w, see stickyTotalWidth). */
export const TOTAL_COL_W = `var(--grid-total-w, ${TOTAL_W}px)`

/**
 * SPEC §8.12 / D19: the sticky "รวม" column absorbs the space left of it that no whole column fills, so it always abuts
 * the last fully visible week / day column instead of sitting beside a clipped sliver of the next one, at any container
 * width and in day zoom (mixed 44 / 52 / 64 px columns). `scrollLeft` / `viewportW` are the scroller's
 * scrollLeft and clientWidth, `nameW` the frozen area (task + assignee, M7.1-D8). Never below TOTAL_W; TOTAL_W until measured.
 */
export function stickyTotalWidth(
  cols: readonly GridColumn[],
  scrollLeft: number,
  viewportW: number,
  nameW: number,
): number {
  if (viewportW <= 0 || cols.length === 0) return TOTAL_W
  // column-offset space: a column is whole when its right edge is at or left of `limit`
  const limit = scrollLeft + viewportW - nameW - TOTAL_W
  let lo = 0
  let hi = cols.length - 1
  let last = -1
  while (lo <= hi) {
    const mid = (lo + hi) >> 1
    const c = cols[mid]!
    if (c.offset + c.width <= limit) {
      last = mid
      lo = mid + 1
    } else hi = mid - 1
  }
  if (last < 0) return TOTAL_W
  const edge = cols[last]!.offset + cols[last]!.width - scrollLeft // right edge, relative to the end of the name column
  if (edge <= 0) return TOTAL_W // no whole column right of the name column (very narrow grid)
  return Math.max(TOTAL_W, Math.ceil(viewportW - nameW - edge)) // ceil: overlap a sub-pixel, never a gap
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
