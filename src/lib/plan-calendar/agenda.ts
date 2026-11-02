// src/lib/plan-calendar/agenda.ts — phone agenda of the project calendar (< 600 px, SPEC FR-812, M7.1-D19). Pure.
// Like M5's AgendaList: the month's days that have something, in date order.
import { compareISO } from '@/domain/dates'
import type { ISODate } from '@/domain/types'
import { inMonth, monthGrid, type YearMonth } from '@/lib/calendar/month-grid'
import { taskOrder, taskSpan, type CalendarTask } from './bars'

export interface AgendaDay<T extends CalendarTask = CalendarTask> {
  date: ISODate
  /** tasks whose bar starts this day (BR-103 start) */
  starting: T[]
  /** tasks that started earlier and are still running this day */
  active: T[]
}

/** Days of `ym` with a task starting or active, both lists in task order (BR-105). */
export function agendaDays<T extends CalendarTask>(
  tasks: readonly T[],
  ym: YearMonth,
  o: { showCompleted?: boolean } = {},
): AgendaDay<T>[] {
  const ord = taskOrder(tasks)
  const spans = tasks
    .filter((t) => (o.showCompleted ?? true) || t.completedOn === null)
    .flatMap((t) => {
      const s = taskSpan(t)
      return s ? [{ t, ...s }] : []
    })
    .sort((a, b) => ord.get(a.t.id)! - ord.get(b.t.id)!)
  const out: AgendaDay<T>[] = []
  for (const date of monthGrid(ym).weeks.flat()) {
    if (!inMonth(date, ym)) continue
    const starting: T[] = []
    const active: T[] = []
    for (const s of spans) {
      if (s.start === date) starting.push(s.t)
      else if (compareISO(s.start, date) < 0 && compareISO(date, s.end) <= 0) active.push(s.t)
    }
    if (starting.length > 0 || active.length > 0) out.push({ date, starting, active })
  }
  return out
}
