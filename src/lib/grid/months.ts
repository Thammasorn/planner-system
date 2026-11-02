// src/lib/grid/months.ts — the month-year header row and month boundary lines (SPEC FR-818, M7.1-D10). Pure.
// A week column belongs to the month of its Monday, a day column to the month of its date. The "รวม" column of an
// expanded week follows the day column right before it, so spans stay contiguous and the only boundary inside an
// expanded week is between its last day of one month and the first day of the next (AC-811).
import type { PeriodKey } from '@/domain/types'
import { th } from '@/i18n/th'
import { formatThaiDate } from '@/lib/format'
import type { GridColumn } from './columns'

/** 'YYYY-MM' */
export type MonthKey = string

/** Spans at least this wide (px) show the long label "ตุลาคม 2569"; narrower ones "ต.ค. 69". */
export const MONTH_LABEL_LONG_MIN_W = 144

export interface MonthSpan {
  key: MonthKey
  startIdx: number
  endIdx: number
  /** column-offset space (px from the first column) */
  left: number
  width: number
}

/** Month of a column; pass the column before it so a "รวม" column inherits its week's last shown day. */
export function monthOfColumn(col: GridColumn, prev?: GridColumn): MonthKey {
  if (col.role === 'weekTotal' && prev && prev.role === 'day' && prev.weekStart === col.weekStart)
    return prev.date.slice(0, 7)
  return (col.role === 'day' ? col.date : col.weekStart).slice(0, 7)
}

function monthAt(cols: readonly GridColumn[], i: number): MonthKey {
  return monthOfColumn(cols[i]!, cols[i - 1])
}

/**
 * Contiguous month spans of `cols`. With `range` (inclusive column indexes, e.g. the rendered window) only the spans
 * that intersect it are returned, each still with its full extent so the sticky label can sit at its left edge.
 */
export function monthSpans(
  cols: readonly GridColumn[],
  range?: { first: number; last: number },
): MonthSpan[] {
  if (cols.length === 0) return []
  const first = Math.max(0, range?.first ?? 0)
  const last = Math.min(cols.length - 1, range?.last ?? cols.length - 1)
  if (last < first) return []
  let start = first
  const firstMonth = monthAt(cols, first)
  while (start > 0 && monthAt(cols, start - 1) === firstMonth) start--
  const out: MonthSpan[] = []
  let i = start
  while (i < cols.length && (i <= last || out.length === 0)) {
    const key = monthAt(cols, i)
    let j = i
    while (j + 1 < cols.length && monthAt(cols, j + 1) === key) j++
    const a = cols[i]!
    const b = cols[j]!
    out.push({ key, startIdx: i, endIdx: j, left: a.offset, width: b.offset + b.width - a.offset })
    i = j + 1
  }
  return out
}

/** The visible period area in column-offset space (between the frozen columns and the sticky "รวม"). */
export interface MonthView {
  from: number
  to: number
}

/**
 * Width (px) of `span` that is actually on screen inside `view`; no view (unmeasured) → the span's full width. The
 * label is chosen and capped by this, so a month mostly scrolled under "รวม" or the frozen columns shows the short
 * label / an ellipsis instead of a clipped glyph (§8.12).
 */
export function visibleSpanWidth(span: MonthSpan, view?: MonthView | null): number {
  if (!view) return span.width
  const a = Math.max(span.left, view.from)
  const b = Math.min(span.left + span.width, view.to)
  return Math.max(0, Math.floor(b - a))
}

/** Keys of the first column of every month except the very first column (cells get `data-month-start`). */
export function monthStartKeys(cols: readonly GridColumn[]): Set<PeriodKey> {
  const out = new Set<PeriodKey>()
  for (let i = 1; i < cols.length; i++) if (monthAt(cols, i) !== monthAt(cols, i - 1)) out.add(cols[i]!.key)
  return out
}

/** Short Thai month name ("ต.ค.") from the medium Thai date format ("1 ต.ค. 2569"). */
function shortMonthName(key: MonthKey): string {
  return formatThaiDate(`${key}-01`, 'medium').split(' ')[1] ?? ''
}

/** `text` = what fits `width`; `full` = the long label (tooltip / accessible name). */
export function monthLabel(key: MonthKey, width: number): { text: string; full: string } {
  const m = Number(key.slice(5, 7))
  const beYear = Number(key.slice(0, 4)) + 543
  const full = th.grid.months.long(th.calendar.months[m - 1]!, beYear)
  if (width >= MONTH_LABEL_LONG_MIN_W) return { text: full, full }
  return { text: th.grid.months.short(shortMonthName(key), String(beYear).slice(-2)), full }
}
