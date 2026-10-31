// src/lib/tasks/optimistic.ts — pure cache patches over ProjectTasksResponse['tasks'] for onMutate (PLAN §3.5). The
// server's response replaces them on settle. Untouched tasks keep their object identity.
import { completionTransition } from '@/domain/status'
import type { ISODate, TaskStatusCategory } from '@/domain/types'
import type {
  AssignmentTransfer,
  BlockerEdgeDTO,
  TaskDepth,
  TaskDTO,
  TaskStatusDTO,
} from '@/lib/contracts/tasks'
import type { Placement } from '@/lib/tree/ops'

/** Insert a task (a temp row on create); a task with the same id is replaced. */
export function patchCreate(tasks: readonly TaskDTO[], t: TaskDTO): TaskDTO[] {
  return tasks.some((x) => x.id === t.id) ? tasks.map((x) => (x.id === t.id ? t : x)) : [...tasks, t]
}

export function patchUpdate(tasks: readonly TaskDTO[], id: string, patch: Partial<TaskDTO>): TaskDTO[] {
  return tasks.map((t) => (t.id === id ? { ...t, ...patch } : t))
}

/** Ids of `rootIds` and all their descendants (via parentId). */
function subtreeIds(tasks: readonly TaskDTO[], rootIds: readonly string[]): Set<string> {
  const out = new Set(rootIds.filter((id) => tasks.some((t) => t.id === id)))
  for (let grew = true; grew;) {
    grew = false
    for (const t of tasks) {
      if (t.parentId !== null && out.has(t.parentId) && !out.has(t.id)) {
        out.add(t.id)
        grew = true
      }
    }
  }
  return out
}

/**
 * Re-parent `id` under `to.parentId` with a provisional key (the order lives in `position`; `to.afterId` is the
 * intent the server gets) and shift the depth of the whole subtree. Unknown id → unchanged.
 */
export function patchMove(
  tasks: readonly TaskDTO[],
  id: string,
  to: Placement,
  provisionalPosition: string,
): TaskDTO[] {
  const root = tasks.find((t) => t.id === id)
  if (!root) return [...tasks]
  const parent = to.parentId === null ? undefined : tasks.find((t) => t.id === to.parentId)
  const delta = (parent ? parent.depth + 1 : 0) - root.depth
  const moving = subtreeIds(tasks, [id])
  return tasks.map((t) => {
    if (t.id === id)
      return {
        ...t,
        parentId: to.parentId,
        position: provisionalPosition,
        depth: (t.depth + delta) as TaskDepth,
      }
    return moving.has(t.id) ? { ...t, depth: (t.depth + delta) as TaskDepth } : t
  })
}

/** Remove the roots and every descendant (FR-609). */
export function patchRemoveTree(tasks: readonly TaskDTO[], rootIds: readonly string[]): TaskDTO[] {
  const gone = subtreeIds(tasks, rootIds)
  return tasks.filter((t) => !gone.has(t.id))
}

/** Optimistic setStatus: statusId + completedOn via completionTransition (BR-80). */
export function patchStatus(
  tasks: readonly TaskDTO[],
  ids: readonly string[],
  to: TaskStatusDTO,
  categoryOf: (statusId: string) => TaskStatusCategory,
  today: ISODate,
): TaskDTO[] {
  const target = new Set(ids)
  return tasks.map((t) => {
    if (!target.has(t.id)) return t
    const { completedOn } = completionTransition({
      from: categoryOf(t.statusId),
      to: to.category,
      completedOn: t.completedOn,
      today,
    })
    return { ...t, statusId: to.id, completedOn }
  })
}

/** Undo of a status change (M3-D28): the exact previous values, no BR-80 recomputation. */
export function patchRevertStatus(
  tasks: readonly TaskDTO[],
  items: readonly { taskId: string; statusId: string; completedOn: ISODate | null }[],
): TaskDTO[] {
  const byTask = new Map(items.map((i) => [i.taskId, i]))
  return tasks.map((t) => {
    const i = byTask.get(t.id)
    return i ? { ...t, statusId: i.statusId, completedOn: i.completedOn } : t
  })
}

/**
 * Recompute BR-86 `{ open, total }` of every task from the edges (`taskId` is blocked by `blockerTaskId`). Edges whose
 * blocker is not in the list (deleted) are ignored; open = blocker not in a DONE status.
 */
export function patchBlockers(
  tasks: readonly TaskDTO[],
  edges: readonly BlockerEdgeDTO[],
  categoryOf: (statusId: string) => TaskStatusCategory,
): TaskDTO[] {
  const byId = new Map(tasks.map((t) => [t.id, t]))
  const counts = new Map<string, { open: number; total: number }>()
  for (const e of edges) {
    const blocker = byId.get(e.blockerTaskId)
    if (!blocker) continue
    const c = counts.get(e.taskId) ?? { open: 0, total: 0 }
    c.total++
    if (categoryOf(blocker.statusId) !== 'DONE') c.open++
    counts.set(e.taskId, c)
  }
  return tasks.map((t) => {
    const c = counts.get(t.id) ?? { open: 0, total: 0 }
    return c.open === t.blockers.open && c.total === t.blockers.total ? t : { ...t, blockers: c }
  })
}

/** Move the assignee objects of `assignmentIds` from one task to the other (FR-610, M3-D3). */
export function patchTransfer(tasks: readonly TaskDTO[], t: AssignmentTransfer): TaskDTO[] {
  const from = tasks.find((x) => x.id === t.fromTaskId)
  if (!from) return [...tasks]
  const ids = new Set(t.assignmentIds)
  const moving = from.assignees.filter((a) => ids.has(a.assignmentId))
  return tasks.map((x) => {
    if (x.id === t.fromTaskId) return { ...x, assignees: x.assignees.filter((a) => !ids.has(a.assignmentId)) }
    if (x.id === t.toTaskId) {
      const have = new Set(x.assignees.map((a) => a.assignmentId))
      return { ...x, assignees: [...x.assignees, ...moving.filter((a) => !have.has(a.assignmentId))] }
    }
    return x
  })
}

/** Add `userId` to the given tasks; like the server (M3-D13) parents and tasks already assigned to the user are skipped. */
export function patchAssign(
  tasks: readonly TaskDTO[],
  taskIds: readonly string[],
  a: { userId: string; assignmentIdFor: (taskId: string) => string },
): TaskDTO[] {
  const target = new Set(taskIds)
  const parents = new Set(tasks.map((t) => t.parentId))
  return tasks.map((t) => {
    if (!target.has(t.id) || parents.has(t.id) || t.assignees.some((x) => x.userId === a.userId)) return t
    return { ...t, assignees: [...t.assignees, { assignmentId: a.assignmentIdFor(t.id), userId: a.userId }] }
  })
}

export function patchUnassign(tasks: readonly TaskDTO[], assignmentIds: readonly string[]): TaskDTO[] {
  const gone = new Set(assignmentIds)
  return tasks.map((t) =>
    t.assignees.some((a) => gone.has(a.assignmentId))
      ? { ...t, assignees: t.assignees.filter((a) => !gone.has(a.assignmentId)) }
      : t,
  )
}
