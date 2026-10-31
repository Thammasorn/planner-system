'use client'
import { useMutation, useQueryClient, type InfiniteData } from '@tanstack/react-query'
import { toast } from 'sonner'
import { useUndo } from '@/components/undo/useUndo'
import type { UndoEntry } from '@/components/undo/useUndo'
import { th } from '@/i18n/th'
import { unwrap } from '@/lib/action-result'
import type { SetTaskStatusResult, TaskCard, TaskStatusDTO, TeamTasksResponse } from '@/lib/contracts/tasks'
import { invalidateLoad, invalidateTasks } from '@/lib/invalidate'
import { qk } from '@/lib/query-keys'
import { completeTask, revertTaskStatus, setTaskStatus, uncompleteTask } from '@/server/actions/tasks'
import { errorMessage } from '../useTaskMutations'

type Vars =
  | { card: TaskCard; kind: 'status'; status: TaskStatusDTO }
  | { card: TaskCard; kind: 'toggle' }
  // FR-608 "ติ๊กทั้งหมด": the parent's open descendants follow it into `statusId` — its own undo entry.
  | { card: TaskCard; kind: 'children'; statusId: string; descendantIds: readonly string[] }

/**
 * /tasks status changes (FR-665/666, X71): optimistic patch of every /tasks page, the usual undo entry
 * (revertTaskStatus, M3-D28) and invalidateTasks + invalidateLoad on settle (X18). The FR-608 "ติ๊กทั้งหมด" toast
 * action runs through the same mutation, so the cascade pushes its own undo entry (Cmd/Ctrl+Z + เลิกทำ toast).
 */
export function useSetTaskStatus() {
  const qc = useQueryClient()
  const undo = useUndo()
  const settle = async (projectId: string) => {
    await invalidateTasks(qc, projectId)
    await invalidateLoad(qc)
  }
  const patchCards = (id: string, fn: (c: TaskCard) => TaskCard) =>
    qc.setQueriesData<InfiniteData<TeamTasksResponse>>({ queryKey: qk.teamTasksAll() }, (d) =>
      d && 'pages' in d
        ? {
            ...d,
            pages: d.pages.map((p) => ({ ...p, cards: p.cards.map((c) => (c.id === id ? fn(c) : c)) })),
          }
        : d,
    )

  const m = useMutation({
    mutationKey: ['tasks', 'team'],
    mutationFn: (v: Vars): Promise<SetTaskStatusResult> => {
      if (v.kind === 'status') return unwrap(setTaskStatus({ taskIds: [v.card.id], statusId: v.status.id }))
      if (v.kind === 'children')
        return unwrap(setTaskStatus({ taskIds: [v.card.id], statusId: v.statusId, withChildren: true }))
      return v.card.completed
        ? unwrap(uncompleteTask({ taskIds: [v.card.id] }))
        : unwrap(completeTask({ taskIds: [v.card.id] }))
    },
    onMutate: async (v) => {
      await qc.cancelQueries({ queryKey: qk.teamTasksAll() })
      if (v.kind === 'status') {
        const { id, name, color, category } = v.status
        patchCards(v.card.id, (c) => ({
          ...c,
          status: { id, name, color, category },
          completed: category === 'DONE',
        }))
      } else if (v.kind === 'children') {
        for (const id of v.descendantIds) patchCards(id, (c) => ({ ...c, completed: true }))
      } else patchCards(v.card.id, (c) => ({ ...c, completed: !c.completed }))
    },
    onError: (err, v) => {
      toast.error(errorMessage(err))
      void settle(v.card.projectId)
    },
    onSuccess: (r, v) => {
      const items = r.changed.map((c) => ({ taskId: c.taskId, ...c.previous }))
      if (items.length === 0) return
      const projectId = v.card.projectId
      const statusId = r.statusId
      const changedIds = items.map((i) => i.taskId)
      const entry: UndoEntry = {
        label: v.kind === 'status' ? th.tasks.undoLabel.status : th.tasks.undoLabel.complete,
        undo: async () => {
          await unwrap(revertTaskStatus({ items }))
          await settle(projectId)
        },
        redo: async () => {
          if (statusId !== null) await unwrap(setTaskStatus({ taskIds: changedIds, statusId }))
          await settle(projectId)
        },
      }
      if (v.kind !== 'children' && r.openDescendantIds.length > 0 && statusId !== null) {
        const descendantIds = r.openDescendantIds
        undo.push(entry)
        toast(th.tasks.toast.askChildren, {
          duration: 8000,
          action: {
            label: th.tasks.toast.completeAll,
            onClick: () => m.mutate({ card: v.card, kind: 'children', statusId, descendantIds }),
          },
          cancel: { label: th.undo.undo, onClick: () => void undo.undoEntry(entry) },
        })
        return
      }
      const message =
        v.kind === 'status'
          ? th.tasks.status.toast.changed(v.status.name)
          : v.kind === 'children'
            ? th.tasks.toast.completedMany(items.length)
            : v.card.completed
              ? th.tasks.toast.uncompleted
              : th.tasks.toast.completed
      undo.push(entry, { toast: message })
    },
    onSettled: (_r, _e, v) => void settle(v.card.projectId),
  })

  return {
    setStatus: (card: TaskCard, status: TaskStatusDTO) => m.mutate({ card, kind: 'status', status }),
    toggleDone: (card: TaskCard) => m.mutate({ card, kind: 'toggle' }),
  }
}
