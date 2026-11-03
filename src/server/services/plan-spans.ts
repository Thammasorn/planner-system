// src/server/services/plan-spans.ts — plan-derived task spans for the project calendar (SPEC v3.6 FR-812, BR-103a).
// authz.requireProject(…, 'view') first (invisible → 404; archived readable). Two bounded allocations reads (§6.5):
// (1) per live assignment the first / last week with counted load (BR-50) in the visible month-grid range ± 3 years
// (the X66 horizon), (2) the stored rows of just those edge weeks; the pure planDaySpan turns them into days using each
// assignee's schedule (WEEK → first/last working day; DAY → its date). Own assignees only — a parent never takes its
// children's plan (FR-812).
import { addDays, weekStart } from '@/domain/dates'
import { LATE_LOOKAHEAD_DAYS } from '@/domain/milestone'
import { planDaySpan, type PlanRow } from '@/domain/plan-span'
import type { ISODate, Schedule } from '@/domain/types'
import type { PlanSpansResponse, TaskPlanSpan } from '@/lib/contracts/plan-spans'
import * as authz from '../authz'
import type { DbOrTx } from '../db/types'
import * as repo from '../repo'
import type { SessionUser } from '../session'

/** How far around the visible month the plan is searched for span edges (= BR-71's 3-year look-ahead, X66). */
export const PLAN_SPAN_LOOKAROUND_DAYS = LATE_LOOKAHEAD_DAYS

export async function getProjectPlanSpans(
  tx: DbOrTx,
  user: SessionUser,
  projectId: string,
  q: { from: ISODate; to: ISODate },
): Promise<PlanSpansResponse> {
  await authz.requireProject(tx, user, projectId, 'view')
  const bounds = await repo.allocations.plannedWeekBoundsForProject(tx, projectId, lookaroundRange(q))
  const edgeWeeks = [...new Set(bounds.flatMap((b) => [b.first, b.last]))]
  const rows = await repo.allocations.listForWeeks(
    tx,
    bounds.map((b) => b.assignmentId),
    edgeWeeks,
  )
  const schedules = await repo.users.listSchedules(tx, [...new Set(bounds.map((b) => b.userId))])

  const rowsByAssignment = new Map<string, PlanRow[]>()
  for (const r of rows) {
    const list = rowsByAssignment.get(r.taskAssignmentId)
    if (list) list.push(r)
    else rowsByAssignment.set(r.taskAssignmentId, [r])
  }
  const byTask = new Map<string, { schedule: Schedule; rows: PlanRow[] }[]>()
  for (const b of bounds) {
    // only this assignment's own edge weeks (listForWeeks crosses every id with every edge week)
    const own = (rowsByAssignment.get(b.assignmentId) ?? []).filter(
      (r) => r.weekStart === b.first || r.weekStart === b.last,
    )
    const entry = { schedule: schedules.get(b.userId) ?? {}, rows: own }
    const list = byTask.get(b.taskId)
    if (list) list.push(entry)
    else byTask.set(b.taskId, [entry])
  }
  const spans: TaskPlanSpan[] = []
  for (const [taskId, assignees] of byTask) {
    const s = planDaySpan(assignees)
    if (s) spans.push({ taskId, start: s.start, end: s.end })
  }
  spans.sort((a, b) => (a.taskId < b.taskId ? -1 : a.taskId > b.taskId ? 1 : 0))
  return { projectId, from: q.from, to: q.to, spans }
}

/** The week range [from, to) searched for a month-grid range: ± PLAN_SPAN_LOOKAROUND_DAYS, on Mondays. */
export function lookaroundRange(q: { from: ISODate; to: ISODate }): { from: ISODate; to: ISODate } {
  return {
    from: weekStart(addDays(q.from, -PLAN_SPAN_LOOKAROUND_DAYS)),
    to: weekStart(addDays(q.to, PLAN_SPAN_LOOKAROUND_DAYS)),
  }
}
