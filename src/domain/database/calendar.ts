// src/domain/database/calendar.ts — BR-97 month grid: weekStart(1st) … Sunday of the last day's week (4–6 weeks).
// v3.7: a DATE cell holding a range `{ start, end }` is a multi-day bar (`ranges`), not a card in one day.
import { addDays, compareISO, isISODate, weekStart } from '../dates'
import type { DbCtx, DbRowModel, ISODate, ViewSort } from '../types'
import { readCell, type DbColumnLike } from './cells'
import { sortRows } from './sort'

export interface CalendarDay<R extends DbRowModel = DbRowModel> {
  date: ISODate
  inMonth: boolean
  /** Rows whose cell is this single date (cards), in BR-94 order. */
  rows: R[]
  /** v3.7: rows whose range covers this day (drawn as bars), in BR-94 order. */
  rangeRows: R[]
}

/** v3.7: a row whose DATE cell is a range overlapping the shown weeks. */
export interface CalendarRange<R extends DbRowModel = DbRowModel> {
  row: R
  start: ISODate
  end: ISODate
}

export interface CalendarMonth<R extends DbRowModel = DbRowModel> {
  weeks: CalendarDay<R>[][]
  /** Rows without a (valid) date — the "ไม่มีวันที่" list, in BR-94 order. */
  noDate: R[]
  /** v3.7: range rows overlapping the shown weeks, in BR-94 order (start, then end). */
  ranges: CalendarRange<R>[]
}

function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

/**
 * BR-97: Monday-first weeks covering `month` (1–12); every row lands on its date (out-of-month days in range
 * too, rows outside the range are not shown), in BR-94 order. A range cell (v3.7) goes to `ranges` and to the
 * `rangeRows` of every shown day it covers. A missing or non-DATE column → every row in noDate.
 */
export function calendarMonth<R extends DbRowModel>(
  month: { year: number; month: number },
  rows: readonly R[],
  dateColumnId: string | undefined,
  sorts: readonly ViewSort[],
  cols: readonly DbColumnLike[],
  ctx: DbCtx,
): CalendarMonth<R> {
  const first = `${String(month.year).padStart(4, '0')}-${pad2(month.month)}-01`
  if (!Number.isInteger(month.month) || !isISODate(first))
    throw new RangeError(`Invalid month: ${JSON.stringify(month)}`)
  const next =
    month.month === 12
      ? `${String(month.year + 1).padStart(4, '0')}-01-01`
      : `${first.slice(0, 5)}${pad2(month.month + 1)}-01`
  const last = addDays(next, -1)
  const start = weekStart(first)
  const end = addDays(weekStart(last), 6)
  const prefix = first.slice(0, 7)

  const days = new Map<ISODate, CalendarDay<R>>()
  const weeks: CalendarDay<R>[][] = []
  for (let d = start; compareISO(d, end) <= 0; d = addDays(d, 7)) {
    const week = Array.from({ length: 7 }, (_, i): CalendarDay<R> => {
      const date = addDays(d, i)
      const day: CalendarDay<R> = { date, inMonth: date.startsWith(prefix), rows: [], rangeRows: [] }
      days.set(date, day)
      return day
    })
    weeks.push(week)
  }

  const col = cols.find((c) => c.id === dateColumnId && c.type === 'DATE')
  const noDate: R[] = []
  const ranges: CalendarRange<R>[] = []
  for (const r of sortRows(rows, sorts, cols, ctx)) {
    const v = col ? readCell(col, r.cells[col.id]) : null
    if (v === null) noDate.push(r)
    else if (typeof v === 'string') days.get(v)?.rows.push(r)
    else if (typeof v === 'object' && !Array.isArray(v)) {
      if (compareISO(v.end, start) < 0 || compareISO(v.start, end) > 0) continue
      ranges.push({ row: r, start: v.start, end: v.end })
      const from = compareISO(v.start, start) < 0 ? start : v.start
      const to = compareISO(v.end, end) > 0 ? end : v.end
      for (let d = from; compareISO(d, to) <= 0; d = addDays(d, 1)) days.get(d)?.rangeRows.push(r)
    }
  }
  return { weeks, noDate, ranges }
}
