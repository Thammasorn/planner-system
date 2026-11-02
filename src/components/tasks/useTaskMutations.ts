'use client'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { generateKeyBetween } from 'fractional-indexing'
import { toast } from 'sonner'
import { useUndo } from '@/components/undo/useUndo'
import type { UndoEntry } from '@/components/undo/useUndo'
import { defaultStatus, firstDoneStatus } from '@/domain/status'
import type { ISODate } from '@/domain/types'
import { useToday } from '@/hooks/useToday'
import { th } from '@/i18n/th'
import { ActionFailure, unwrap } from '@/lib/action-result'
import type { PeopleOptionsResponse } from '@/lib/contracts/people'
import type {
  ProjectTasksResponse,
  SetTaskStatusResult,
  TaskDepth,
  TaskDTO,
  TreePlacement,
} from '@/lib/contracts/tasks'
import { displayName } from '@/lib/display-name'
import { invalidateLoad, invalidateMilestones, invalidateTasks } from '@/lib/invalidate'
import { statusToastMessage } from './statusToast'
import { errorMessage, idMap, resolveId } from './task-ids'
import { qk } from '@/lib/query-keys'
import type { TaskPatch } from '@/lib/schemas/tasks'
import {
  patchAssign,
  patchBlockers,
  patchCreate,
  patchMove,
  patchRemoveTree,
  patchStatus,
  patchTransfer,
  patchUnassign,
  patchUpdate,
} from '@/lib/tasks/optimistic'
import { reverseTransfer } from '@/lib/tasks/transfer'
import { buildTaskRows, openDescendants } from '@/lib/tasks/tree'
import { tempId } from '@/lib/temp-id'
import {
  compareKeys,
  indentTarget,
  moveDownTarget,
  moveUpTarget,
  outdentTarget,
  TASK_MAX_DEPTH_INDEX,
} from '@/lib/tree/ops'
import {
  assign as assignAction,
  restoreAssignmentBatch,
  unassign as unassignAction,
} from '@/server/actions/assignments'
import { addTaskBlocker, removeTaskBlocker } from '@/server/actions/task-blockers'
import {
  completeTask,
  createTask,
  deleteTaskTree,
  indentTask,
  moveTask,
  outdentTask,
  restoreTaskBatch,
  revertTaskStatus,
  setTaskStatus,
  uncompleteTask,
  updateTask,
} from '@/server/actions/tasks'

export { errorMessage, resolveId }
const resolveNullable = (id: string | null): string | null => (id === null ? null : resolveId(id))

/** Undo/redo of a restore: a CONFLICT reason reads "กู้คืนไม่ได้ เพราะ<reason>" (UndoProvider shows the message). */
async function asRestore<T>(p: Promise<T>): Promise<T> {
  try {
    return await p
  } catch (err) {
    if (err instanceof ActionFailure) {
      throw new ActionFailure({
        ok: false,
        code: err.code,
        message: th.tasks.toast.restoreFailed(err.message),
      })
    }
    throw err
  }
}

/** Optimistic sibling key for display only (M3-D11); the server's key replaces it on settle. */
export function provisionalKey(
  tasks: readonly TaskDTO[],
  parentId: string | null,
  afterId: string | null | undefined,
  movingId?: string,
): string {
  const sibs = tasks
    .filter((t) => t.parentId === parentId && t.id !== movingId)
    .sort((a, b) => compareKeys(a.position, b.position) || compareKeys(a.id, b.id))
  let lo: string | null = null
  let hi: string | null = null
  if (afterId === undefined) lo = sibs[sibs.length - 1]?.position ?? null
  else if (afterId === null) hi = sibs[0]?.position ?? null
  else {
    const i = sibs.findIndex((s) => s.id === afterId)
    lo = sibs[i]?.position ?? null
    hi = i >= 0 ? (sibs[i + 1]?.position ?? null) : null
  }
  try {
    return generateKeyBetween(lo, hi)
  } catch {
    return lo ?? hi ?? 'a0'
  }
}

type Snapshot = { snapshot: ProjectTasksResponse | undefined }
type StatusKind = 'complete' | 'uncomplete' | 'status'
type MoveVars = { kind: 'indent' | 'outdent' | 'move'; taskId: string; target: TreePlacement }

export interface TaskMutations {
  create: (v: { parentId: string | null; afterId?: string | null; name: string; statusId?: string }) => string
  update: (taskId: string, patch: TaskPatch) => void
  /** Same as update, for InlineEditText (rejects so the field reverts). */
  updateAsync: (taskId: string, patch: TaskPatch) => Promise<void>
  indent: (taskId: string) => void
  outdent: (taskId: string) => void
  moveUp: (taskId: string) => void
  moveDown: (taskId: string) => void
  move: (v: { taskId: string; parentId: string | null; afterId: string | null }) => void
  complete: (taskIds: string[], o?: { withChildren?: boolean }) => void
  uncomplete: (taskIds: string[]) => void
  setStatus: (taskIds: string[], statusId: string, o?: { withChildren?: boolean }) => void
  addBlocker: (taskId: string, blockerTaskId: string) => void
  removeBlocker: (edgeId: string, label: string) => void
  remove: (taskIds: string[]) => void
  assign: (taskIds: string[], userId: string) => void
  unassign: (assignmentIds: string[], label: string) => void
}

/**
 * Every task write of a project (PLAN §3.5, S3.1): scoped useMutation (one queue per project, r4 §6), optimistic
 * cache patch, rollback only when it is the only pending mutation, Thai error toast, invalidation on settle (X18:
 * load-affecting ops also invalidate load views), and the S3.1 undo/toast matrix through the M1 undo stack.
 */
export function useTaskMutations(projectId: string): TaskMutations {
  const qc = useQueryClient()
  const undo = useUndo()
  const today = useToday()
  const key = qk.projectTasks(projectId)
  const mutationKey = ['tasks', projectId]
  const scope = { id: `tasks:${projectId}` }

  const data = () => qc.getQueryData<ProjectTasksResponse>(key)
  const setData = (fn: (d: ProjectTasksResponse) => ProjectTasksResponse) =>
    qc.setQueryData<ProjectTasksResponse>(key, (d) => (d ? fn(d) : d))
  const setTasks = (fn: (t: TaskDTO[]) => TaskDTO[]) => setData((d) => ({ ...d, tasks: fn(d.tasks) }))
  const settle = async (load: boolean) => {
    await Promise.all([invalidateTasks(qc, projectId), ...(load ? [invalidateLoad(qc)] : [])])
  }
  const nameOf = (snap: ProjectTasksResponse | undefined, id: string) =>
    snap?.tasks.find((t) => t.id === id)?.name ?? ''

  function common<V, R>(cfg: {
    run: (v: V) => Promise<R>
    optimistic?: (d: ProjectTasksResponse, v: V) => ProjectTasksResponse
    load?: (v: V, r: R | undefined) => boolean
    onSuccess?: (r: R, v: V, ctx: Snapshot) => void
  }) {
    return {
      mutationKey,
      scope,
      mutationFn: cfg.run,
      onMutate: async (v: V): Promise<Snapshot> => {
        await qc.cancelQueries({ queryKey: key })
        const snapshot = data()
        if (snapshot && cfg.optimistic) qc.setQueryData(key, cfg.optimistic(snapshot, v))
        return { snapshot }
      },
      onError: (err: Error, _v: V, ctx: Snapshot | undefined) => {
        if (qc.isMutating({ mutationKey }) === 1 && ctx?.snapshot) qc.setQueryData(key, ctx.snapshot)
        else void invalidateTasks(qc, projectId)
        if (
          err instanceof ActionFailure &&
          err.code === 'CONFLICT' &&
          err.message === th.tasks.errors.treeChanged
        ) {
          void qc.refetchQueries({ queryKey: key })
          toast.error(th.tasks.toast.treeChanged)
        } else toast.error(errorMessage(err))
      },
      onSuccess: (r: R, v: V, ctx: Snapshot) => cfg.onSuccess?.(r, v, ctx),
      onSettled: (r: R | undefined, _e: Error | null, v: V) => {
        const transfer = r && typeof r === 'object' && 'transfer' in r && Boolean(r.transfer)
        void settle(transfer || (cfg.load?.(v, r) ?? false))
      },
    }
  }

  // ── create (FR-602, FR-610, FR-664) ──
  type CreateVars = {
    tmp: string
    parentId: string | null
    afterId: string | null | undefined
    name: string
    statusId: string | undefined
  }
  const createM = useMutation(
    common<CreateVars, Awaited<ReturnType<typeof createTaskRun>>>({
      run: createTaskRun,
      optimistic: (d, v) => {
        const parent = v.parentId === null ? undefined : d.tasks.find((t) => t.id === v.parentId)
        const status = v.statusId
          ? (d.statuses.find((s) => s.id === v.statusId) ?? defaultStatus(d.statuses))
          : defaultStatus(d.statuses)
        const row: TaskDTO = {
          id: v.tmp,
          projectId,
          parentId: v.parentId,
          depth: (parent ? parent.depth + 1 : 0) as TaskDepth,
          position: provisionalKey(d.tasks, v.parentId, v.afterId),
          name: v.name,
          startDate: null,
          dueDate: null,
          certaintyOverride: null,
          completedOn: status.category === 'DONE' ? today : null,
          assignees: [],
          statusId: status.id,
          blockers: { open: 0, total: 0 },
          hasBody: false, // quick add never creates a body (FR-681, AC-627)
          milestoneId: null,
          lateForMilestone: false,
        }
        return { ...d, tasks: patchCreate(d.tasks, row) }
      },
      onSuccess: (r, v) => {
        idMap.set(v.tmp, r.task.id)
        const t = r.transfer
        setTasks((tasks) => {
          const next = patchCreate(
            tasks.filter((x) => x.id !== v.tmp),
            r.task,
          )
          return t ? patchTransfer(next, t) : next
        })
        const id = r.task.id
        let batch: string | null = null
        const entry: UndoEntry = {
          label: th.tasks.undoLabel.create,
          undo: async () => {
            const res = await unwrap(
              deleteTaskTree({ taskIds: [id], ...(t ? { transfer: reverseTransfer(t) } : {}) }),
            )
            batch = res.batch
            await settle(true)
          },
          redo: async () => {
            if (batch === null) return
            await asRestore(unwrap(restoreTaskBatch({ batch, ...(t ? { transfer: t } : {}) })))
            await settle(true)
          },
        }
        undo.push(
          entry,
          t ? { toast: th.tasks.toast.movedAssignees(t.assignmentIds.length, r.task.name) } : undefined,
        )
      },
    }),
  )
  function createTaskRun(v: CreateVars) {
    return unwrap(
      createTask({
        projectId,
        parentId: resolveNullable(v.parentId),
        ...(v.afterId !== undefined ? { afterId: resolveNullable(v.afterId) } : {}),
        name: v.name,
        ...(v.statusId ? { statusId: v.statusId } : {}),
      }),
    )
  }

  // ── update (FR-601): no undo entry for text edits (r6a M3-11) ──
  const updateM = useMutation(
    common<{ taskId: string; patch: TaskPatch }, unknown>({
      run: (v) => unwrap(updateTask({ taskId: resolveId(v.taskId), patch: v.patch })),
      optimistic: (d, v) => {
        const p: Partial<TaskDTO> = {}
        if (v.patch.name !== undefined) p.name = v.patch.name.trim()
        if (v.patch.startDate !== undefined) p.startDate = v.patch.startDate
        if (v.patch.dueDate !== undefined) p.dueDate = v.patch.dueDate
        if (v.patch.certaintyOverride !== undefined) p.certaintyOverride = v.patch.certaintyOverride
        return { ...d, tasks: patchUpdate(d.tasks, v.taskId, p) }
      },
      load: (v) => v.patch.certaintyOverride !== undefined,
      // M8-D12/D22: a due date is a BR-71 fact — a task bound to a live milestone refreshes every ◆ view
      onSuccess: (_r, v, ctx) => {
        const t = ctx.snapshot?.tasks.find((x) => x.id === v.taskId)
        if (v.patch.dueDate !== undefined && t?.milestoneId) void invalidateMilestones(qc, projectId)
      },
    }),
  )

  // ── tree moves (FR-603/604, M3-D3) ──
  const moveM = useMutation(
    common<MoveVars, Awaited<ReturnType<typeof moveRun>>>({
      run: moveRun,
      optimistic: (d, v) => ({
        ...d,
        tasks: patchMove(
          d.tasks,
          v.taskId,
          v.target,
          provisionalKey(d.tasks, v.target.parentId, v.target.afterId, v.taskId),
        ),
      }),
      onSuccess: (r, v) => {
        if (!r.changed) return
        const id = r.task.id
        const t = r.transfer
        const previous = r.previous
        const target = {
          parentId: resolveNullable(v.target.parentId),
          afterId: resolveNullable(v.target.afterId),
        }
        const entry: UndoEntry = {
          label: th.tasks.undoLabel.move,
          undo: async () => {
            await unwrap(
              moveTask({ taskId: id, ...previous, ...(t ? { transfer: reverseTransfer(t) } : {}) }),
            )
            await settle(Boolean(t))
          },
          redo: async () => {
            await unwrap(moveTask({ taskId: id, ...target, ...(t ? { transfer: t } : {}) }))
            await settle(Boolean(t))
          },
        }
        undo.push(
          entry,
          t ? { toast: th.tasks.toast.movedAssignees(t.assignmentIds.length, r.task.name) } : undefined,
        )
      },
    }),
  )
  function moveRun(v: MoveVars) {
    const taskId = resolveId(v.taskId)
    if (v.kind === 'indent') return unwrap(indentTask({ taskId }))
    if (v.kind === 'outdent') return unwrap(outdentTask({ taskId }))
    return unwrap(
      moveTask({
        taskId,
        parentId: resolveNullable(v.target.parentId),
        afterId: resolveNullable(v.target.afterId),
      }),
    )
  }
  const rows = () => buildTaskRows(data()?.tasks ?? [])
  const moveBy = (kind: MoveVars['kind'], taskId: string, target: TreePlacement | null) => {
    if (target === null) return // over-limit Tab / first-row Shift+Tab: a silent no-op (AC-602)
    moveM.mutate({ kind, taskId, target })
  }

  // ── status changes (X71, FR-607/608, M3-D5/D28) ──
  function pushStatusEntry(r: SetTaskStatusResult, kind: StatusKind, snap: ProjectTasksResponse | undefined) {
    const items = r.changed.map((c) => ({
      taskId: c.taskId,
      statusId: c.previous.statusId,
      completedOn: c.previous.completedOn,
    }))
    if (items.length === 0) return
    const ids = items.map((i) => i.taskId)
    const statusId = r.statusId
    const label =
      kind === 'complete'
        ? th.tasks.undoLabel.complete
        : kind === 'uncomplete'
          ? th.tasks.undoLabel.uncomplete
          : th.tasks.undoLabel.status
    const entry: UndoEntry = {
      label,
      undo: async () => {
        await unwrap(revertTaskStatus({ items }))
        await settle(true)
      },
      redo: async () => {
        if (kind === 'complete') await unwrap(completeTask({ taskIds: ids }))
        else if (kind === 'uncomplete') await unwrap(uncompleteTask({ taskIds: ids }))
        else if (statusId !== null) await unwrap(setTaskStatus({ taskIds: ids, statusId }))
        await settle(true)
      },
    }
    if (r.openDescendantIds.length > 0 && statusId !== null) {
      // FR-608: "ติ๊กงานย่อยทั้งหมดด้วยไหม" [ติ๊กทั้งหมด] [เลิกทำ]
      const parentId = items[0]?.taskId ?? ''
      undo.push(entry)
      toast(th.tasks.toast.askChildren, {
        duration: 8000,
        action: {
          label: th.tasks.toast.completeAll,
          onClick: () => statusM.mutate({ taskIds: [parentId], statusId, withChildren: true }),
        },
        cancel: { label: th.undo.undo, onClick: () => void undo.undoEntry(entry) },
      })
      return
    }
    const statusName = snap?.statuses.find((s) => s.id === statusId)?.name ?? ''
    const message =
      kind === 'complete'
        ? items.length === 1
          ? th.tasks.toast.completed
          : th.tasks.toast.completedMany(items.length)
        : kind === 'uncomplete'
          ? th.tasks.toast.uncompleted
          : items.length === 1
            ? th.tasks.status.toast.changed(statusName)
            : th.tasks.status.toast.changedMany(items.length, statusName)
    undo.push(entry, { toast: statusToastMessage(r, message) })
  }

  const withDescendants = (d: ProjectTasksResponse, ids: readonly string[], on: boolean | undefined) => {
    if (!on) return [...ids]
    const all = buildTaskRows(d.tasks)
    return [...new Set([...ids, ...ids.flatMap((id) => openDescendants(all, id))])]
  }
  const optimisticStatus = (
    d: ProjectTasksResponse,
    ids: readonly string[],
    statusId: string,
    day: ISODate,
  ) => {
    const to = d.statuses.find((s) => s.id === statusId)
    if (!to) return d
    const cat = (id: string) => d.statuses.find((s) => s.id === id)?.category ?? 'TODO'
    const tasks = patchStatus(d.tasks, ids, to, cat, day)
    return { ...d, tasks: patchBlockers(tasks, d.blockerEdges, cat) }
  }

  const completeM = useMutation(
    common<{ taskIds: string[]; withChildren: boolean }, SetTaskStatusResult>({
      run: (v) => unwrap(completeTask({ taskIds: v.taskIds.map(resolveId), withChildren: v.withChildren })),
      optimistic: (d, v) => {
        const done = firstDoneStatus(d.statuses)
        const open = withDescendants(d, v.taskIds, v.withChildren).filter(
          (id) => d.tasks.find((t) => t.id === id)?.completedOn === null,
        )
        return optimisticStatus(d, open, done.id, today)
      },
      load: () => true,
      onSuccess: (r, _v, ctx) => pushStatusEntry(r, 'complete', ctx.snapshot),
    }),
  )
  const uncompleteM = useMutation(
    common<{ taskIds: string[] }, SetTaskStatusResult>({
      run: (v) => unwrap(uncompleteTask({ taskIds: v.taskIds.map(resolveId) })),
      optimistic: (d, v) => {
        const closed = v.taskIds.filter((id) => d.tasks.find((t) => t.id === id)?.completedOn !== null)
        return optimisticStatus(d, closed, defaultStatus(d.statuses).id, today)
      },
      load: () => true,
      onSuccess: (r, _v, ctx) => pushStatusEntry(r, 'uncomplete', ctx.snapshot),
    }),
  )
  const statusM = useMutation(
    common<{ taskIds: string[]; statusId: string; withChildren: boolean }, SetTaskStatusResult>({
      run: (v) =>
        unwrap(
          setTaskStatus({
            taskIds: v.taskIds.map(resolveId),
            statusId: v.statusId,
            withChildren: v.withChildren,
          }),
        ),
      optimistic: (d, v) =>
        optimisticStatus(d, withDescendants(d, v.taskIds, v.withChildren), v.statusId, today),
      load: () => true,
      onSuccess: (r, _v, ctx) => pushStatusEntry(r, 'status', ctx.snapshot),
    }),
  )

  // ── blockers (FR-640–645, M3-D31) ──
  const addBlockerM = useMutation(
    common<{ tmp: string; taskId: string; blockerTaskId: string }, Awaited<ReturnType<typeof addBlockerRun>>>(
      {
        run: addBlockerRun,
        optimistic: (d, v) => {
          const edges = [...d.blockerEdges, { id: v.tmp, taskId: v.taskId, blockerTaskId: v.blockerTaskId }]
          const cat = (id: string) => d.statuses.find((s) => s.id === id)?.category ?? 'TODO'
          return { ...d, blockerEdges: edges, tasks: patchBlockers(d.tasks, edges, cat) }
        },
        onSuccess: (r, v, ctx) => {
          if (!r.created) return
          const pair = { taskId: r.edge.taskId, blockerTaskId: r.edge.blockerTaskId }
          let edgeId = r.edge.id
          const entry: UndoEntry = {
            label: th.tasks.undoLabel.blockerAdd,
            undo: async () => {
              await unwrap(removeTaskBlocker({ blockerId: edgeId }))
              await settle(false)
            },
            redo: async () => {
              edgeId = (await asRestore(unwrap(addTaskBlocker(pair)))).edge.id
              await settle(false)
            },
          }
          undo.push(entry, { toast: th.tasks.blockers.toast.added(nameOf(ctx.snapshot, v.blockerTaskId)) })
        },
      },
    ),
  )
  function addBlockerRun(v: { taskId: string; blockerTaskId: string }) {
    return unwrap(addTaskBlocker({ taskId: resolveId(v.taskId), blockerTaskId: resolveId(v.blockerTaskId) }))
  }
  const removeBlockerM = useMutation(
    common<{ edgeId: string; label: string }, Awaited<ReturnType<typeof removeBlockerRun>>>({
      run: removeBlockerRun,
      optimistic: (d, v) => {
        const edges = d.blockerEdges.filter((e) => e.id !== v.edgeId)
        const cat = (id: string) => d.statuses.find((s) => s.id === id)?.category ?? 'TODO'
        return { ...d, blockerEdges: edges, tasks: patchBlockers(d.tasks, edges, cat) }
      },
      onSuccess: (r, v) => {
        const pair = { taskId: r.taskId, blockerTaskId: r.blockerTaskId }
        let edgeId = r.edgeId
        const entry: UndoEntry = {
          label: th.tasks.undoLabel.blockerRemove,
          undo: async () => {
            edgeId = (await asRestore(unwrap(addTaskBlocker(pair)))).edge.id
            await settle(false)
          },
          redo: async () => {
            await unwrap(removeTaskBlocker({ blockerId: edgeId }))
            await settle(false)
          },
        }
        undo.push(entry, { toast: th.tasks.blockers.toast.removed(v.label) })
      },
    }),
  )
  function removeBlockerRun(v: { edgeId: string }) {
    return unwrap(removeTaskBlocker({ blockerId: v.edgeId }))
  }

  // ── delete (FR-609, BR-32, AC-603) ──
  const removeM = useMutation(
    common<{ taskIds: string[] }, Awaited<ReturnType<typeof removeRun>>>({
      run: removeRun,
      optimistic: (d, v) => {
        const tasks = patchRemoveTree(d.tasks, v.taskIds)
        const live = new Set(tasks.map((t) => t.id))
        const edges = d.blockerEdges.filter((e) => live.has(e.taskId) && live.has(e.blockerTaskId))
        const cat = (id: string) => d.statuses.find((s) => s.id === id)?.category ?? 'TODO'
        return { ...d, blockerEdges: edges, tasks: patchBlockers(tasks, edges, cat) }
      },
      load: () => true,
      onSuccess: (r, _v, ctx) => {
        const roots = r.rootIds
        let batch = r.batch
        const first = roots[0] ?? ''
        const children = r.deletedIds.length - roots.length
        const message =
          roots.length > 1
            ? th.tasks.toast.deletedMany(roots.length)
            : children > 0
              ? th.tasks.toast.deletedWithChildren(nameOf(ctx.snapshot, first), children)
              : th.tasks.toast.deleted(nameOf(ctx.snapshot, first))
        const entry: UndoEntry = {
          label: th.tasks.undoLabel.delete,
          undo: async () => {
            await asRestore(unwrap(restoreTaskBatch({ batch })))
            await settle(true)
          },
          redo: async () => {
            batch = (await unwrap(deleteTaskTree({ taskIds: roots }))).batch
            await settle(true)
          },
        }
        undo.push(entry, { toast: message })
      },
    }),
  )
  function removeRun(v: { taskIds: string[] }) {
    return unwrap(deleteTaskTree({ taskIds: v.taskIds.map(resolveId) }))
  }

  // ── assignments (FR-605, BR-31, BR-60) ──
  const personName = (userId: string) => {
    const p = qc.getQueryData<PeopleOptionsResponse>(qk.peopleOptions())?.people.find((x) => x.id === userId)
    return p ? displayName(p) : ''
  }
  const assignM = useMutation(
    common<{ taskIds: string[]; userId: string }, Awaited<ReturnType<typeof assignRun>>>({
      run: assignRun,
      optimistic: (d, v) => ({
        ...d,
        tasks: patchAssign(d.tasks, v.taskIds, { userId: v.userId, assignmentIdFor: () => tempId() }),
      }),
      load: () => true,
      onSuccess: (r, v) => {
        if (r.created.length === 0) return
        const name = personName(v.userId)
        let ids = r.created.map((c) => c.assignmentId)
        let batch: string | null = null
        const message = r.addedMember
          ? th.tasks.toast.assignedAddedMember(name)
          : r.created.length > 1
            ? th.tasks.toast.assignedMany(name, r.created.length)
            : th.tasks.toast.assigned(name)
        const entry: UndoEntry = {
          label: th.tasks.undoLabel.assign,
          undo: async () => {
            batch = (await unwrap(unassignAction({ assignmentIds: ids }))).batch
            await settle(true)
          },
          redo: async () => {
            if (batch === null) return
            const res = await asRestore(unwrap(restoreAssignmentBatch({ batch })))
            ids = res.restored.map((x) => x.assignmentId)
            await settle(true)
          },
        }
        undo.push(entry, { toast: message })
      },
    }),
  )
  function assignRun(v: { taskIds: string[]; userId: string }) {
    return unwrap(assignAction({ taskIds: v.taskIds.map(resolveId), userId: v.userId }))
  }
  const unassignM = useMutation(
    common<{ assignmentIds: string[]; label: string }, Awaited<ReturnType<typeof unassignRun>>>({
      run: unassignRun,
      optimistic: (d, v) => ({ ...d, tasks: patchUnassign(d.tasks, v.assignmentIds) }),
      load: () => true,
      onSuccess: (r, v) => {
        let batch = r.batch
        let ids = v.assignmentIds
        const entry: UndoEntry = {
          label: th.tasks.undoLabel.unassign,
          undo: async () => {
            const res = await asRestore(unwrap(restoreAssignmentBatch({ batch })))
            if (res.skipped > 0) toast(th.tasks.toast.restoreSkipped)
            ids = res.restored.map((x) => x.assignmentId)
            await settle(true)
          },
          redo: async () => {
            if (ids.length === 0) return
            batch = (await unwrap(unassignAction({ assignmentIds: ids }))).batch
            await settle(true)
          },
        }
        undo.push(entry, { toast: th.tasks.toast.unassigned(v.label) })
      },
    }),
  )
  function unassignRun(v: { assignmentIds: string[] }) {
    return unwrap(unassignAction({ assignmentIds: v.assignmentIds }))
  }

  return {
    create: (v) => {
      const tmp = tempId()
      createM.mutate({ tmp, parentId: v.parentId, afterId: v.afterId, name: v.name, statusId: v.statusId })
      return tmp
    },
    update: (taskId, patch) => updateM.mutate({ taskId, patch }),
    updateAsync: async (taskId, patch) => {
      await updateM.mutateAsync({ taskId, patch })
    },
    indent: (taskId) => moveBy('indent', taskId, indentTarget(rows(), taskId, TASK_MAX_DEPTH_INDEX)),
    outdent: (taskId) => moveBy('outdent', taskId, outdentTarget(rows(), taskId)),
    moveUp: (taskId) => moveBy('move', taskId, moveUpTarget(rows(), taskId)),
    moveDown: (taskId) => moveBy('move', taskId, moveDownTarget(rows(), taskId)),
    move: (v) => moveBy('move', v.taskId, { parentId: v.parentId, afterId: v.afterId }),
    complete: (taskIds, o) => {
      if (taskIds.length > 0) completeM.mutate({ taskIds, withChildren: Boolean(o?.withChildren) })
    },
    uncomplete: (taskIds) => {
      if (taskIds.length > 0) uncompleteM.mutate({ taskIds })
    },
    setStatus: (taskIds, statusId, o) => {
      if (taskIds.length > 0) statusM.mutate({ taskIds, statusId, withChildren: Boolean(o?.withChildren) })
    },
    addBlocker: (taskId, blockerTaskId) => addBlockerM.mutate({ tmp: tempId(), taskId, blockerTaskId }),
    removeBlocker: (edgeId, label) => removeBlockerM.mutate({ edgeId, label }),
    remove: (taskIds) => {
      if (taskIds.length > 0) removeM.mutate({ taskIds })
    },
    assign: (taskIds, userId) => {
      if (taskIds.length > 0) assignM.mutate({ taskIds, userId })
    },
    unassign: (assignmentIds, label) => {
      if (assignmentIds.length > 0) unassignM.mutate({ assignmentIds, label })
    },
  }
}
