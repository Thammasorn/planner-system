'use client'
// src/components/tasks/team/useTeamTaskEdits.ts — /tasks ตาราง edits other than status (M11.4, FR-668): dates, milestone,
// delete, and the optimistic assignee patch around M3's AssigneePicker. Every write is an existing server action
// (updateTask, linkTasksToMilestone via useMilestoneMutations, deleteTaskTree/restoreTaskBatch); the /tasks pages are
// patched optimistically, rolled back by refetch on error, and settle with invalidateTasks (+ invalidateLoad).
import { useMutation, useQueryClient, type InfiniteData } from '@tanstack/react-query'
import { toast } from 'sonner'
import { useMilestoneMutations } from '@/components/milestones/useMilestoneMutations'
import { useUndo, type UndoEntry } from '@/components/undo/useUndo'
import type { ISODate } from '@/domain/types'
import { th } from '@/i18n/th'
import { ActionFailure, unwrap } from '@/lib/action-result'
import type { TeamMilestoneRef, TeamTaskCard, TeamTasksResponse } from '@/lib/contracts/tasks'
import { invalidateLoad, invalidateTasks } from '@/lib/invalidate'
import { qk } from '@/lib/query-keys'
import { deleteTaskTree, restoreTaskBatch, updateTask } from '@/server/actions/tasks'
import { errorMessage } from '../useTaskMutations'

type Pages = InfiniteData<TeamTasksResponse>
export type DatePatch = { startDate?: ISODate | null; dueDate?: ISODate | null }

/** Patch every cached /tasks page (all filter combinations) — only infinite pages are touched (spans share the key). */
export function patchTeamCards(
  qc: ReturnType<typeof useQueryClient>,
  fn: (cards: TeamTaskCard[]) => TeamTaskCard[],
): void {
  qc.setQueriesData<Pages>({ queryKey: qk.teamTasksAll() }, (d) =>
    d && 'pages' in d ? { ...d, pages: d.pages.map((p) => ({ ...p, cards: fn(p.cards) })) } : d,
  )
}

export function useTeamTaskEdits() {
  const qc = useQueryClient()
  const undo = useUndo()
  const milestones = useMilestoneMutations()
  const settle = (projectId: string, load: boolean) =>
    Promise.all([invalidateTasks(qc, projectId), ...(load ? [invalidateLoad(qc)] : [])])
  const patchOne = (id: string, fn: (c: TeamTaskCard) => TeamTaskCard) =>
    patchTeamCards(qc, (cards) => cards.map((c) => (c.id === id ? fn(c) : c)))
  const fail = (err: unknown, projectId: string) => {
    toast.error(errorMessage(err))
    void settle(projectId, false)
  }

  const datesM = useMutation({
    mutationKey: ['tasks', 'team', 'dates'],
    mutationFn: (v: { card: TeamTaskCard; patch: DatePatch }) =>
      unwrap(updateTask({ taskId: v.card.id, patch: v.patch })),
    onMutate: async (v) => {
      await qc.cancelQueries({ queryKey: qk.teamTasksAll() })
      patchOne(v.card.id, (c) => ({ ...c, ...v.patch }))
    },
    onError: (err, v) => fail(err, v.card.projectId),
    onSuccess: (_r, v) => {
      const before: DatePatch = {}
      if (v.patch.startDate !== undefined) before.startDate = v.card.startDate
      if (v.patch.dueDate !== undefined) before.dueDate = v.card.dueDate
      const entry: UndoEntry = {
        label: th.teamTasks.table.undoDates,
        undo: async () => {
          await unwrap(updateTask({ taskId: v.card.id, patch: before }))
          await settle(v.card.projectId, false)
        },
        redo: async () => {
          await unwrap(updateTask({ taskId: v.card.id, patch: v.patch }))
          await settle(v.card.projectId, false)
        },
      }
      undo.push(entry)
    },
    onSettled: (_r, _e, v) => void settle(v.card.projectId, false),
  })

  const removeM = useMutation({
    mutationKey: ['tasks', 'team', 'delete'],
    mutationFn: (card: TeamTaskCard) => unwrap(deleteTaskTree({ taskIds: [card.id] })),
    onMutate: async (card) => {
      await qc.cancelQueries({ queryKey: qk.teamTasksAll() })
      patchTeamCards(qc, (cards) => cards.filter((c) => c.id !== card.id))
    },
    onError: (err, card) => fail(err, card.projectId),
    onSuccess: (r, card) => {
      let batch = r.batch
      const roots = r.rootIds
      const children = r.deletedIds.length - roots.length
      const entry: UndoEntry = {
        label: th.tasks.undoLabel.delete,
        undo: async () => {
          try {
            await unwrap(restoreTaskBatch({ batch }))
          } catch (err) {
            if (err instanceof ActionFailure)
              throw new ActionFailure({ ok: false, code: err.code, message: th.tasks.toast.restoreFailed(err.message) })
            throw err
          }
          await settle(card.projectId, true)
        },
        redo: async () => {
          batch = (await unwrap(deleteTaskTree({ taskIds: roots }))).batch
          await settle(card.projectId, true)
        },
      }
      undo.push(entry, {
        toast: children > 0 ? th.tasks.toast.deletedWithChildren(card.name, children) : th.tasks.toast.deleted(card.name),
      })
    },
    onSettled: (_r, _e, card) => void settle(card.projectId, true),
  })

  return {
    setDates: (card: TeamTaskCard, patch: DatePatch) => datesM.mutate({ card, patch }),
    setMilestone: (card: TeamTaskCard, milestone: TeamMilestoneRef | null) => {
      if ((milestone?.id ?? null) === card.milestoneId) return
      patchOne(card.id, (c) => ({ ...c, milestoneId: milestone?.id ?? null }))
      void milestones.link(card.projectId, [card.id], milestone, { toast: true })
    },
    remove: (card: TeamTaskCard) => removeM.mutate(card),
    /** M3's AssigneePicker / chips write through useTaskMutations; mirror the change on the /tasks pages at once. */
    patchAssignees: (cardId: string, fn: (ids: string[]) => string[]) =>
      patchOne(cardId, (c) => ({ ...c, assigneeIds: fn(c.assigneeIds) })),
  }
}

export type TeamTaskEdits = ReturnType<typeof useTeamTaskEdits>
