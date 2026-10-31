// src/lib/invalidate.ts — grouped TanStack invalidations so features don't forget views (PLAN.md §3.5, X18).
import type { QueryClient } from '@tanstack/react-query'
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
 *  M8 appends qk.projectMilestones(projectId), M10 home + embed tasks (X82, C29); callers never list task keys. */
export function invalidateTasks(qc: QueryClient, projectId: string): Promise<void> {
  return invalidateAll(qc, [qk.projectTasks(projectId), qk.myTasks(), qk.sidebar(), qk.teamTasksAll()])
}

/** After a status-set change (v3.1 FR-622–624): the status settings and every task view of the project. */
export async function invalidateStatuses(qc: QueryClient, projectId: string): Promise<void> {
  await Promise.all([
    qc.invalidateQueries({ queryKey: qk.projectStatuses(projectId) }),
    invalidateTasks(qc, projectId),
  ])
}
