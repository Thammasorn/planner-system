// src/lib/invalidate.ts — grouped TanStack invalidations so features don't forget views (PLAN.md §3.5, X18).
import type { QueryClient } from '@tanstack/react-query'
import type { PageSpace } from './contracts/pages'
import type { ProjectTasksResponse } from './contracts/tasks'
import { qk, qkPrefix } from './query-keys'

async function invalidateAll(qc: QueryClient, keys: readonly (readonly unknown[])[]): Promise<void> {
  await Promise.all(keys.map((queryKey) => qc.invalidateQueries({ queryKey })))
}

/** Every view that shows load numbers: grid, workload, home, tasks.my, /tasks (FR-405 certainty changes,
 *  allocations, task completion/assignment — X18). */
export function invalidateLoad(qc: QueryClient): Promise<void> {
  return invalidateAll(qc, [
    qkPrefix.grid,
    qkPrefix.workload,
    qkPrefix.home,
    qkPrefix.myTasks,
    qkPrefix.teamTasks,
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
