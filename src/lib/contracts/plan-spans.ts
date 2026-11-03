// src/lib/contracts/plan-spans.ts — GET /api/projects/[id]/plan-spans?from&to (SPEC v3.6 FR-812, BR-103a): the project
// calendar's plan-derived task spans. Only this project's live tasks (the same set as GET /api/projects/[id]/tasks, so
// masking is unchanged); a task without counted planned load of its own live assignees is absent.
import type { ISODate } from '@/domain/types'

export interface TaskPlanSpan {
  taskId: string
  /** first day with load (WEEK rows → the assignee's first working day of that week) */
  start: ISODate
  /** last day with load (WEEK rows → the assignee's last working day of that week) */
  end: ISODate
}

export interface PlanSpansResponse {
  projectId: string
  /** the requested month-grid range (Mondays, `to` exclusive) */
  from: ISODate
  to: ISODate
  /** in task-id order */
  spans: TaskPlanSpan[]
}

/** GET /api/tasks/plan-spans?from&to[&projectId] (M11.4, FR-669): the team calendar's plan-derived spans — live tasks of
 *  every visible, non-archived project (the /api/tasks set before its filters); ids + dates only, no names. */
export interface TeamPlanSpansResponse {
  from: ISODate
  to: ISODate
  /** in task-id order */
  spans: TaskPlanSpan[]
}
