'use client'
// src/components/milestones/useMilestoneMutations.ts — milestone mutations for every view (plan/m08 S4.1,
// M8-D1/D10/D14/D19/D22). Optimistic patches of qk.projectMilestones (link: qk.projectTasks), one undo entry each,
// toasts with "เลิกทำ", invalidateMilestones(qc, projectId) on settle. The grid (S3) patches its own cache first and
// only calls this hook. Every method resolves (never rejects): failures roll back and show the Thai error toast.
import { useMutation, useQueryClient, type QueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { errorMessage, resolveId } from '@/components/tasks/task-ids'
import { useUndo, type UndoEntry } from '@/components/undo/useUndo'
import { compareMilestones, milestoneStatus } from '@/domain/milestone'
import type { ISODate } from '@/domain/types'
import { useToday } from '@/hooks/useToday'
import { th } from '@/i18n/th'
import { ActionFailure, unwrap } from '@/lib/action-result'
import type {
  MilestoneDTO,
  MilestoneRef,
  ProjectMilestonesResponse,
  UpdateMilestoneResult,
} from '@/lib/contracts/milestones'
import type { ProjectTasksResponse } from '@/lib/contracts/tasks'
import { formatThaiDate } from '@/lib/format'
import { invalidateMilestones } from '@/lib/invalidate'
import { qk } from '@/lib/query-keys'
import type { MilestonePatch } from '@/lib/schemas/milestones'
import { patchMilestone } from '@/lib/tasks/optimistic'
import {
  createMilestone,
  deleteMilestone,
  linkTasksToMilestone,
  restoreMilestoneBatch,
  revertTaskMilestones,
  updateMilestone,
} from '@/server/actions/milestones'

export type { MilestonePatch }

type MilestoneKey = Pick<MilestoneDTO, 'id' | 'projectId' | 'name'>

export interface MilestoneMutations {
  create(v: {
    projectId: string
    name: string
    date: ISODate
    description?: string | null
  }): Promise<MilestoneDTO | null>
  /**
   * Rename / move / complete / reopen. The undo entry and toast follow what the server reports as changed: a date
   * change → `moved` (undo restores every changed field), a completion change → `completed` / `reopened` (undo sends
   * the exact previous `completedOn`, M8-D19); name/description only → no entry, no toast (as M3). `o.toast` is the
   * caller's hint and never adds a toast for a field that did not change.
   */
  update(
    m: MilestoneKey,
    patch: MilestonePatch,
    o?: { toast?: 'moved' | 'completed' | 'reopened' },
  ): Promise<void>
  remove(m: MilestoneKey): Promise<void>
  /** Bind (or unbind with null) tasks of one project; one undo entry; toast only with `o.toast` (bulk bar). */
  link(
    projectId: string,
    taskIds: readonly string[],
    milestone: MilestoneRef | null,
    o?: { toast?: boolean },
  ): Promise<void>
}

/** One queue for every milestone write (the hook is project-agnostic; the project rides on each call). */
const mutationKey = ['milestones']
const scope = { id: 'milestones' }

/** Undo/redo of a restore: the reason reads "กู้คืนไม่ได้ เพราะ<reason>" (UndoProvider shows the message). */
async function asRestore<T>(p: Promise<T>): Promise<T> {
  try {
    return await p
  } catch (err) {
    if (err instanceof ActionFailure) {
      throw new ActionFailure({
        ok: false,
        code: err.code,
        message: th.milestones.toast.restoreFailed(err.message),
      })
    }
    throw err
  }
}

function setMilestones(qc: QueryClient, projectId: string, fn: (ms: MilestoneDTO[]) => MilestoneDTO[]): void {
  qc.setQueryData<ProjectMilestonesResponse>(qk.projectMilestones(projectId), (d) =>
    d ? { ...d, milestones: fn(d.milestones) } : d,
  )
}

const upsert = (ms: readonly MilestoneDTO[], m: MilestoneDTO): MilestoneDTO[] =>
  [...ms.filter((x) => x.id !== m.id), m].sort(compareMilestones)

/** Optimistic view of a patch (status recomputed with the client's today, M8-D7). */
export function applyPatch(m: MilestoneDTO, patch: MilestonePatch, today: ISODate): MilestoneDTO {
  const next: MilestoneDTO = { ...m }
  if (patch.name !== undefined) next.name = patch.name.trim()
  if (patch.date !== undefined) next.date = patch.date
  if (patch.description !== undefined)
    next.description =
      patch.description === null || patch.description.trim() === '' ? null : patch.description
  if (patch.completed !== undefined) next.completedOn = patch.completed ? (m.completedOn ?? today) : null
  if (patch.completedOn !== undefined) next.completedOn = patch.completedOn
  next.status = milestoneStatus(next, today)
  return next
}

/** The patch that puts back (`from = previous`) or re-applies (`from = result.milestone`) every changed field. */
function patchFrom(
  changed: UpdateMilestoneResult['changed'],
  from: { name: string; date: ISODate; description: string | null; completedOn: ISODate | null },
): MilestonePatch {
  const p: MilestonePatch = {}
  if (changed.includes('name')) p.name = from.name
  if (changed.includes('date')) p.date = from.date
  if (changed.includes('description')) p.description = from.description
  if (changed.includes('completed')) p.completedOn = from.completedOn
  return p
}

type Snap<T> = { projectId: string; snapshot: T | undefined }

export function useMilestoneMutations(): MilestoneMutations {
  const qc = useQueryClient()
  const undo = useUndo()
  const today = useToday()
  const settle = (projectId: string) => invalidateMilestones(qc, projectId)
  const fail = (err: Error) => toast.error(errorMessage(err))

  // ── create (FR-702) ──
  type CreateVars = Parameters<MilestoneMutations['create']>[0]
  const createM = useMutation({
    mutationKey,
    scope,
    mutationFn: (v: CreateVars) =>
      unwrap(
        createMilestone({
          projectId: v.projectId,
          name: v.name,
          date: v.date,
          ...(v.description !== undefined ? { description: v.description } : {}),
        }),
      ),
    onError: fail,
    onSuccess: (r, v) => {
      const m = r.milestone
      setMilestones(qc, v.projectId, (ms) => upsert(ms, m))
      let batch: string | null = null
      const entry: UndoEntry = {
        label: th.milestones.undoLabel.create,
        undo: async () => {
          batch = (await unwrap(deleteMilestone({ milestoneId: m.id }))).batch
          await settle(v.projectId)
        },
        redo: async () => {
          if (batch === null) return
          await asRestore(unwrap(restoreMilestoneBatch({ batch })))
          await settle(v.projectId)
        },
      }
      undo.push(entry, { toast: th.milestones.toast.created(m.name) })
    },
    onSettled: (_r, _e, v) => void settle(v.projectId),
  })

  // ── update: rename / move / complete / reopen (FR-701/707, M8-D19) ──
  type UpdateVars = { m: MilestoneKey; patch: MilestonePatch }
  const updateM = useMutation({
    mutationKey,
    scope,
    mutationFn: (v: UpdateVars) => unwrap(updateMilestone({ milestoneId: v.m.id, patch: v.patch })),
    onMutate: async (v: UpdateVars): Promise<Snap<ProjectMilestonesResponse>> => {
      const key = qk.projectMilestones(v.m.projectId)
      await qc.cancelQueries({ queryKey: key })
      const snapshot = qc.getQueryData<ProjectMilestonesResponse>(key)
      setMilestones(qc, v.m.projectId, (ms) =>
        ms.map((x) => (x.id === v.m.id ? applyPatch(x, v.patch, today) : x)).sort(compareMilestones),
      )
      return { projectId: v.m.projectId, snapshot }
    },
    onError: (err, v, ctx) => {
      if (ctx?.snapshot) qc.setQueryData(qk.projectMilestones(v.m.projectId), ctx.snapshot)
      fail(err)
    },
    onSuccess: (r, v) => {
      const pid = v.m.projectId
      setMilestones(qc, pid, (ms) => upsert(ms, r.milestone))
      const moved = r.changed.includes('date')
      const completion = r.changed.includes('completed')
      if (!moved && !completion) return // text edit: no undo entry (M3)
      const back = patchFrom(r.changed, r.previous)
      const again = patchFrom(r.changed, r.milestone)
      const id = r.milestone.id
      const entry: UndoEntry = {
        label: moved ? th.milestones.undoLabel.move : th.milestones.undoLabel.complete,
        undo: async () => {
          await unwrap(updateMilestone({ milestoneId: id, patch: back }))
          await settle(pid)
        },
        redo: async () => {
          await unwrap(updateMilestone({ milestoneId: id, patch: again }))
          await settle(pid)
        },
      }
      const message = moved
        ? th.milestones.toast.moved(r.milestone.name, formatThaiDate(r.milestone.date))
        : r.milestone.completedOn !== null
          ? th.milestones.toast.completed(r.milestone.name)
          : th.milestones.toast.reopened(r.milestone.name)
      undo.push(entry, { toast: message })
    },
    onSettled: (_r, _e, v) => void settle(v.m.projectId),
  })

  // ── remove (FR-708): soft delete, no confirm; undo re-binds exactly ──
  const removeM = useMutation({
    mutationKey,
    scope,
    mutationFn: (m: MilestoneKey) => unwrap(deleteMilestone({ milestoneId: m.id })),
    onMutate: async (m: MilestoneKey): Promise<Snap<ProjectMilestonesResponse>> => {
      const key = qk.projectMilestones(m.projectId)
      await qc.cancelQueries({ queryKey: key })
      const snapshot = qc.getQueryData<ProjectMilestonesResponse>(key)
      setMilestones(qc, m.projectId, (ms) => ms.filter((x) => x.id !== m.id))
      return { projectId: m.projectId, snapshot }
    },
    onError: (err, m, ctx) => {
      if (ctx?.snapshot) qc.setQueryData(qk.projectMilestones(m.projectId), ctx.snapshot)
      fail(err)
    },
    onSuccess: (r, m) => {
      let batch = r.batch
      const entry: UndoEntry = {
        label: th.milestones.undoLabel.delete,
        undo: async () => {
          await asRestore(unwrap(restoreMilestoneBatch({ batch })))
          await settle(m.projectId)
        },
        redo: async () => {
          batch = (await unwrap(deleteMilestone({ milestoneId: m.id }))).batch
          await settle(m.projectId)
        },
      }
      const name = r.name || m.name
      undo.push(entry, {
        toast:
          r.unlinkedTaskCount > 0
            ? th.milestones.toast.deletedUnlinked(name, r.unlinkedTaskCount)
            : th.milestones.toast.deleted(name),
      })
    },
    onSettled: (_r, _e, m) => void settle(m.projectId),
  })

  // ── link (FR-601/614, M8-D14): a task edit; one undo entry ──
  type LinkVars = { projectId: string; taskIds: string[]; milestone: MilestoneRef | null; toast: boolean }
  const linkM = useMutation({
    mutationKey,
    scope,
    mutationFn: (v: LinkVars) =>
      unwrap(
        linkTasksToMilestone({ taskIds: v.taskIds.map(resolveId), milestoneId: v.milestone?.id ?? null }),
      ),
    onMutate: async (v: LinkVars): Promise<Snap<ProjectTasksResponse>> => {
      const key = qk.projectTasks(v.projectId)
      await qc.cancelQueries({ queryKey: key })
      const snapshot = qc.getQueryData<ProjectTasksResponse>(key)
      if (snapshot)
        qc.setQueryData<ProjectTasksResponse>(key, {
          ...snapshot,
          tasks: patchMilestone(snapshot.tasks, v.taskIds, v.milestone?.id ?? null),
        })
      return { projectId: v.projectId, snapshot }
    },
    onError: (err, v, ctx) => {
      if (ctx?.snapshot) qc.setQueryData(qk.projectTasks(v.projectId), ctx.snapshot)
      fail(err)
    },
    onSuccess: (r, v) => {
      if (r.changed.length === 0) return
      const items = r.changed.map((c) => ({ taskId: c.taskId, milestoneId: c.previousMilestoneId }))
      const ids = r.changed.map((c) => c.taskId)
      const milestoneId = v.milestone?.id ?? null
      const entry: UndoEntry = {
        label: th.milestones.undoLabel.link,
        undo: async () => {
          await unwrap(revertTaskMilestones({ items }))
          await settle(v.projectId)
        },
        redo: async () => {
          await unwrap(linkTasksToMilestone({ taskIds: ids, milestoneId }))
          await settle(v.projectId)
        },
      }
      if (!v.toast) {
        undo.push(entry)
        return
      }
      undo.push(entry, {
        toast: v.milestone
          ? th.milestones.toast.linked(r.changed.length, v.milestone.name)
          : th.milestones.toast.unlinked(r.changed.length),
      })
    },
    onSettled: (_r, _e, v) => void settle(v.projectId),
  })

  return {
    create: (v) =>
      createM.mutateAsync(v).then(
        (r) => r.milestone,
        () => null,
      ),
    update: (m, patch) => updateM.mutateAsync({ m, patch }).then(noop, noop),
    remove: (m) => removeM.mutateAsync(m).then(noop, noop),
    link: (projectId, taskIds, milestone, o) =>
      linkM
        .mutateAsync({ projectId, taskIds: [...taskIds], milestone, toast: o?.toast ?? false })
        .then(noop, noop),
  }
}

const noop = (): void => undefined
