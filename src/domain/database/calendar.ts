// src/domain/database/calendar.ts — BR-97 month grid: weekStart(1st) … Sunday of the last day's week (4–6 weeks).
import { addDays, compareISO, isISODate, weekStart } from '../dates'
import type { DbCtx, DbRowModel, ISODate, ViewSort } from '../types'
import { readCell, type DbColumnLike } from './cells'
import { sortRows } from './sort'

export interface CalendarDay<R extends DbRowModel = DbRowModel> {
  date: ISODate
  inMonth: boolean
  rows: R[]
}

export interface CalendarMonth<R extends DbRowModel = DbRowModel> {
  weeks: CalendarDay<R>[][]
  /** Rows without a (valid) date — the "ไม่มีวันที่" list, in BR-94 order. */
  noDate: R[]
}

function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

/**
 * BR-97: Monday-first weeks covering `month` (1–12); every row lands on its date (out-of-month days in range
 * too, rows outside the range are not shown), in BR-94 order. A missing or non-DATE column → every row in noDate.
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
      const day = { date, inMonth: date.startsWith(prefix), rows: [] }
      days.set(date, day)
      return day
    })
    weeks.push(week)
  }

  const col = cols.find((c) => c.id === dateColumnId && c.type === 'DATE')
  const noDate: R[] = []
  for (const r of sortRows(rows, sorts, cols, ctx)) {
    const v = col ? (readCell(col, r.cells[col.id]) as ISODate | null) : null
    if (v === null) noDate.push(r)
    else days.get(v)?.rows.push(r)
  }
  return { weeks, noDate }
}
