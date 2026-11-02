// src/lib/invalidate.ts — grouped TanStack invalidations so features don't forget views (PLAN.md §3.5, X18).
import type { QueryClient } from '@tanstack/react-query'
import type { PageSpace } from './contracts/pages'
import type { ProjectTasksResponse } from './contracts/tasks'
import { qk, qkPrefix } from './query-keys'

async function invalidateAll(qc: QueryClient, keys: readonly (readonly unknown[])[]): Promise<void> {
  await Promise.all(keys.map((queryKey) => qc.invalidateQueries({ queryKey })))
}

/** Every view that shows load numbers: grid, workload (table, cell, badge, people, project/client load), home,
 *  tasks.my, /tasks (FR-405 certainty changes, allocations, task completion/assignment — X18) and, from M9, the
 *  sidebar (its "งานของฉัน N" counts this week's planned tasks, M9-D17). */
export function invalidateLoad(qc: QueryClient): Promise<void> {
  return invalidateAll(qc, [
    qkPrefix.grid,
    qkPrefix.workload,
    qkPrefix.home,
    qkPrefix.myTasks,
    qkPrefix.teamTasks,
    qk.sidebar(),
  ])
}

/** After any project / member / client mutation: the sidebar and every client-options picker (M2-D08). */
export function invalidateProjects(qc: QueryClient): Promise<void> {
  return invalidateAll(qc, [qk.sidebar(), qkPrefix.clientOptions])
}

/** After any task / assignment / blocker mutation of a project (M3). The single extension point for task views:
 *  M6 adds the project's grid (its rows are the task tree: create, rename, move, blockers), M8 appends
 *  qk.projectMilestones(projectId), M10 home + embed tasks (X82, C29); callers never list task keys. */
export function invalidateTasks(qc: QueryClient, projectId: string): Promise<void> {
  return invalidateAll(qc, [
    qk.projectTasks(projectId),
    qk.myTasks(),
    qk.sidebar(),
    qk.teamTasksAll(),
    qk.gridAll({ kind: 'project', id: projectId }),
    qk.projectMilestones(projectId), // M8-D22: progress / lateness
  ])
}

/** After a status-set change (v3.1 FR-622–624): the status settings and every task view of the project. */
export async function invalidateStatuses(qc: QueryClient, projectId: string): Promise<void> {
  await Promise.all([
    qc.invalidateQueries({ queryKey: qk.projectStatuses(projectId) }),
    invalidateTasks(qc, projectId),
  ])
}

/** After any page create / rename / icon / move / duplicate / delete / restore / protect (M4): the tree of one space
 *  (or every tree), every titles lookup and the whole search prefix (X82: M10's search index too). */
export function invalidatePages(
  qc: QueryClient,
  scope?: { space: PageSpace; projectId: string | null },
): Promise<void> {
  return invalidateAll(qc, [
    scope ? qk.pagesTreeScope(scope.space, scope.projectId) : qkPrefix.pagesTree,
    qkPrefix.pageTitles,
    qkPrefix.search,
  ])
}

/** After a change of one page's own data (content save, template, cover): that page and every titles lookup. */
export function invalidatePage(qc: QueryClient, pageId: string): Promise<void> {
  return invalidateAll(qc, [qk.page(pageId), qkPrefix.pageTitles])
}

/** After any leave or holiday write (M5): every calendar range. M6/M9 views that show capacity are refreshed by the
 *  caller with invalidateLoad as well once they exist. */
export function invalidateCalendar(qc: QueryClient): Promise<void> {
  return invalidateAll(qc, [qkPrefix.calendar])
}

/** After any leave-type write (M5): the dialog's options and every calendar range (names / colours of entries). */
export function invalidateLeaveTypes(qc: QueryClient): Promise<void> {
  return invalidateAll(qc, [qkPrefix.leaveTypes, qkPrefix.calendar])
}

// ── M6.1 (plan/m06.1 S0.8) ──────────────────────────────────────────────────────────────────────────────────────────

/** After a task-body write that the open editor did not make itself (ensure from elsewhere, full width): its view. */
export function invalidateTaskBody(qc: QueryClient, taskId: string): Promise<void> {
  return invalidateAll(qc, [qk.taskBody(taskId)])
}

/**
 * M6.1-D11: the open body patches `hasBody` (📄, FR-691) of its task in the project's task list from its own blank
 * check — no refetch per autosave. No-op when the list is not cached or the value is unchanged (same reference).
 */
export function patchTaskHasBody(qc: QueryClient, projectId: string, taskId: string, hasBody: boolean): void {
  qc.setQueryData<ProjectTasksResponse>(qk.projectTasks(projectId), (d) => {
    if (!d) return d
    const t = d.tasks.find((x) => x.id === taskId)
    if (!t || t.hasBody === hasBody) return d
    return { ...d, tasks: d.tasks.map((x) => (x.id === taskId ? { ...x, hasBody } : x)) }
  })
}

/** Every list view that shows 📄 / task names of a project: its task list, /my and every /tasks page. */
export function invalidateTaskViews(qc: QueryClient, projectId: string): Promise<void> {
  return invalidateAll(qc, [qk.projectTasks(projectId), qkPrefix.myTasks, qkPrefix.teamTasks])
}

// ── M7.1 (plan/m07.1 S0.5, X82) ─────────────────────────────────────────────────────────────────────────────────────

/** After any plan-marker create / update / delete / restore: that project's markers only (grid, calendar, chart). */
export function invalidatePlanMarkers(qc: QueryClient, projectId: string): Promise<void> {
  return invalidateAll(qc, [qk.planMarkers(projectId)])
}

// ── M8 (plan/m08 S0.6, M8-D22, X82) ─────────────────────────────────────────────────────────────────────────────────

/** After any milestone change (create / update / move / complete / delete / restore) and any task-binding, due-date or
 *  completion change that affects lateness or progress: the project's milestones, its grid, every person grid (M9 shows
 *  ◆ too), the project's task list, every /tasks page and every calendar range. */
export async function invalidateMilestones(qc: QueryClient, projectId: string): Promise<void> {
  await Promise.all([
    qc.invalidateQueries({ queryKey: qk.projectMilestones(projectId) }),
    qc.invalidateQueries({ queryKey: qk.gridAll({ kind: 'project', id: projectId }) }),
    qc.invalidateQueries({ queryKey: ['grid', 'person'] }), // prefix of qk.gridAll({ kind: 'person', id })
    qc.invalidateQueries({ queryKey: qk.projectTasks(projectId) }),
    qc.invalidateQueries({ queryKey: qk.teamTasksAll() }),
    qc.invalidateQueries({ queryKey: qkPrefix.calendar }),
  ])
}
