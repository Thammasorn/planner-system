// src/lib/plan-calendar/bars.ts — task bars of the project month calendar (SPEC FR-811/812, BR-103, M7.1-D19). Pure;
// dates are ISO strings (src/domain/dates.ts), the month grid is M5's (6 Monday-first weeks). v3.6 (BR-103a): a side
// without an explicit date comes from the task's planned load (`planSpan`, server-computed — src/domain/plan-span.ts).
import { addDays, compareISO, diffDays, maxISO, minISO } from '@/domain/dates'
import type { ISODate } from '@/domain/types'
import { monthGrid, type YearMonth } from '@/lib/calendar/month-grid'
import { flattenTree } from '@/lib/tree/ops'

/** The TaskDTO fields the calendar reads (TaskDTO satisfies it). */
export interface CalendarTask {
  id: string
  parentId: string | null
  position: string
  startDate: ISODate | null
  dueDate: ISODate | null
  completedOn: ISODate | null
  /** v3.6 (BR-103a): first → last day with live planned load of the task's own assignees; absent/null = no plan */
  planSpan?: { start: ISODate; end: ISODate } | null
}

/** A bar's span and which side came from the plan rather than an explicit date (BR-103a). */
export interface BarSpan {
  start: ISODate
  end: ISODate
  startFromPlan: boolean
  endFromPlan: boolean
}

/** More lanes than this per week row → "+N" on the affected days. */
export const CALENDAR_MAX_LANES = 3

export interface BarSegment {
  taskId: string
  /** 0 = Monday … 6 = Sunday of the week row, inclusive */
  startCol: number
  endCol: number
  lane: number
  /** ◂ / ▸: the bar is cut at this row's edge */
  continuesLeft: boolean
  continuesRight: boolean
}

export interface WeekBars {
  /** Monday of the row */
  week: ISODate
  /** lanes 0 … CALENDAR_MAX_LANES − 1, in placement order */
  segments: BarSegment[]
  /** day → ids of the tasks that did not fit a lane that day (only days that have some) */
  overflow: Map<ISODate, string[]>
}

/**
 * BR-103 + BR-103a. Both dates → that range (a reversed pair is swapped). Neither → the plan span (both sides "from
 * plan"), or null without a plan. One date → the missing side is filled from the plan when the plan reaches past the
 * explicit date (only start → end = plan end; only due → start = plan start), otherwise a one-day bar on that date.
 * An explicit date always wins over the plan.
 */
export function barSpan(t: Pick<CalendarTask, 'startDate' | 'dueDate' | 'planSpan'>): BarSpan | null {
  const plan = t.planSpan ?? null
  if (t.startDate !== null && t.dueDate !== null) {
    return {
      start: minISO(t.startDate, t.dueDate),
      end: maxISO(t.startDate, t.dueDate),
      startFromPlan: false,
      endFromPlan: false,
    }
  }
  if (t.startDate !== null) {
    const fill = plan !== null && compareISO(plan.end, t.startDate) > 0
    return { start: t.startDate, end: fill ? plan.end : t.startDate, startFromPlan: false, endFromPlan: fill }
  }
  if (t.dueDate !== null) {
    const fill = plan !== null && compareISO(plan.start, t.dueDate) < 0
    return { start: fill ? plan.start : t.dueDate, end: t.dueDate, startFromPlan: fill, endFromPlan: false }
  }
  return plan ? { start: plan.start, end: plan.end, startFromPlan: true, endFromPlan: true } : null
}

/** The bar's [start, end] (BR-103/103a); null = "ไม่มีวันที่". */
export function taskSpan(
  t: Pick<CalendarTask, 'startDate' | 'dueDate' | 'planSpan'>,
): { start: ISODate; end: ISODate } | null {
  const s = barSpan(t)
  return s ? { start: s.start, end: s.end } : null
}

/** BR-105 order: DFS by position (the task list's order); tasks outside the tree (orphans) after it, in input order. */
export function taskOrder(tasks: readonly CalendarTask[]): Map<string, number> {
  const out = new Map<string, number>()
  for (const t of flattenTree(tasks)) out.set(t.id, out.size)
  for (const t of tasks) if (!out.has(t.id)) out.set(t.id, out.size)
  return out
}

function orderMap(tasks: readonly CalendarTask[], order: readonly string[] | undefined): Map<string, number> {
  if (!order) return taskOrder(tasks)
  const out = new Map<string, number>()
  for (const id of order) if (!out.has(id)) out.set(id, out.size)
  for (const t of tasks) if (!out.has(t.id)) out.set(t.id, out.size)
  return out
}

function shown(t: CalendarTask, showCompleted: boolean): boolean {
  return showCompleted || t.completedOn === null
}

/** "ไม่มีวันที่ (N)": tasks with neither date nor planned load, in tree order (parents too — FR-812, BR-103a). */
export function noDateTasks<T extends CalendarTask>(
  tasks: readonly T[],
  o: { showCompleted?: boolean; order?: readonly string[] } = {},
): T[] {
  const ord = orderMap(tasks, o.order)
  return tasks
    .filter((t) => shown(t, o.showCompleted ?? true) && taskSpan(t) === null)
    .sort((a, b) => ord.get(a.id)! - ord.get(b.id)!)
}

/**
 * BR-103 bars for the 6 week rows of `ym`: each task's span clipped to each row; lanes per row greedy by (start,
 * longer first, task order), a task first trying the lane it had in the row above; lanes ≥ 3 go to `overflow`.
 */
export function monthBars(
  tasks: readonly CalendarTask[],
  ym: YearMonth,
  o: { showCompleted: boolean; order?: readonly string[] },
): WeekBars[] {
  const ord = orderMap(tasks, o.order)
  const spans = tasks
    .filter((t) => shown(t, o.showCompleted))
    .flatMap((t) => {
      const s = taskSpan(t)
      return s ? [{ id: t.id, ...s, len: diffDays(s.start, s.end), rank: ord.get(t.id)! }] : []
    })
    .sort((a, b) => compareISO(a.start, b.start) || b.len - a.len || a.rank - b.rank)

  let prevLane = new Map<string, number>()
  return monthGrid(ym).weeks.map((days) => {
    const week = days[0]!
    const sunday = days[6]!
    /** lane → occupied [startCol, endCol] ranges */
    const lanes: [number, number][][] = []
    const free = (lane: number, a: number, b: number) =>
      (lanes[lane] ?? []).every(([x, y]) => b < x || y < a)
    const placed: BarSegment[] = []
    const overflow = new Map<ISODate, string[]>()
    const laneOf = new Map<string, number>()
    for (const s of spans) {
      if (compareISO(s.end, week) < 0 || compareISO(s.start, sunday) > 0) continue
      const startCol = compareISO(s.start, week) < 0 ? 0 : diffDays(week, s.start)
      const endCol = compareISO(s.end, sunday) > 0 ? 6 : diffDays(week, s.end)
      const preferred = prevLane.get(s.id)
      let lane = 0
      if (preferred !== undefined && free(preferred, startCol, endCol)) lane = preferred
      else while (!free(lane, startCol, endCol)) lane++
      ;(lanes[lane] ??= []).push([startCol, endCol])
      laneOf.set(s.id, lane)
      if (lane < CALENDAR_MAX_LANES) {
        placed.push({
          taskId: s.id,
          startCol,
          endCol,
          lane,
          continuesLeft: compareISO(s.start, week) < 0,
          continuesRight: compareISO(s.end, sunday) > 0,
        })
      } else {
        for (let c = startCol; c <= endCol; c++) {
          const d = addDays(week, c)
          const list = overflow.get(d)
          if (list) list.push(s.id)
          else overflow.set(d, [s.id])
        }
      }
    }
    prevLane = laneOf
    const sortedOverflow = new Map([...overflow.entries()].sort(([a], [b]) => compareISO(a, b)))
    return { week, segments: placed, overflow: sortedOverflow }
  })
}
