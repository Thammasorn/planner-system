// src/lib/grid/day-overlay.ts — patch one (assignment, week) of a cached chunk with a WeekPlan (M7 S3.6, M7-D19): the
// W: cell (weekCellFromPlan) and, for weeks this chunk shows expanded, its D: cells (dayCellsFromPlan with the same
// DayCtx the server uses), so AC-804 shows 3.0 at once and the server result only confirms it. Pure.
import type { WeekPlan } from '@/domain/allocation'
import type { ISODate, PeriodKey } from '@/domain/types'
import type { AssigneeCell, GridAssigneeRow, GridPerson, GridResponse } from '@/lib/contracts/grid'
import { dayCellsFromPlan, dayCtxFor, weekCellFromPlan, wKey } from './day'
import { recomputeTotals } from './totals'

/** The D: period keys of `week` in this chunk (empty for a collapsed week). */
export function dayKeysOf(resp: Pick<GridResponse, 'periods'>, week: ISODate): PeriodKey[] {
  return resp.periods.filter((p) => p.kind === 'DAY' && p.weekStart === week).map((p) => p.key)
}

/**
 * Writes the plan's W: cell (when this chunk has the week) and D: cells (for its D: periods of that week) into
 * `cells` (mutated). Returns the touched period keys.
 */
export function patchWeekCells(
  cells: Partial<Record<PeriodKey, AssigneeCell>>,
  resp: Pick<GridResponse, 'periods'>,
  person: GridPerson | undefined,
  week: ISODate,
  next: WeekPlan,
): PeriodKey[] {
  const touched: PeriodKey[] = []
  const wk = wKey(week)
  if (resp.periods.some((p) => p.key === wk)) {
    const c = weekCellFromPlan(next, week, person?.capacity[wk] ?? 0, person?.standard[wk] ?? 0)
    if (c) cells[wk] = c
    else delete cells[wk]
    touched.push(wk)
  }
  const dayKeys = dayKeysOf(resp, week)
  if (dayKeys.length > 0) {
    const days = dayCellsFromPlan(next, dayCtxFor(person, week))
    for (const k of dayKeys) {
      const c = days[k]
      if (c) cells[k] = c
      else delete cells[k]
      touched.push(k)
    }
  }
  return touched
}

/** One (assignment, week) → `next` in this chunk; task totals of the touched keys recomputed. */
export function applyPlanToResponse(
  resp: GridResponse,
  taskAssignmentId: string,
  week: ISODate,
  next: WeekPlan,
): GridResponse {
  const i = resp.rows.findIndex((r) => r.kind === 'assignee' && r.taskAssignmentId === taskAssignmentId)
  if (i < 0) return resp
  const row = resp.rows[i] as GridAssigneeRow
  const cells = { ...row.cells }
  const touched = patchWeekCells(cells, resp, resp.people[row.userId], week, next)
  if (touched.length === 0) return resp
  const rows = [...resp.rows]
  rows[i] = { ...row, cells }
  recomputeTotals(rows, new Set([row.taskId]), new Set(touched))
  return { ...resp, rows }
}
