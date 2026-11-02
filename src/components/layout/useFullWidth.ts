'use client'
// src/components/layout/useFullWidth.ts — the shared "เต็มความกว้าง" switch of a document / task body (FR-1602,
// SPEC §8.12, M6.1-D15): optimistic toggle through `setPageFullWidth`; on success an undo entry WITHOUT a toast
// (Cmd+Z toggles back — not a deletion); on failure revert + error toast. The page property is shared by every viewer,
// so the cached page / task body / row body (M11-D8) views are patched too. Hidden (canToggle false) without edit rights.
import { useQueryClient } from '@tanstack/react-query'
import { useCallback, useContext, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { UndoContext } from '@/components/undo/useUndo'
import { th } from '@/i18n/th'
import { unwrap } from '@/lib/action-result'
import type { PageView } from '@/lib/contracts/pages'
import type { RowBodyView } from '@/lib/contracts/row-pages'
import type { TaskBodyView } from '@/lib/contracts/task-pages'
import { qk } from '@/lib/query-keys'
import { setPageFullWidth } from '@/server/actions/pages'

export interface UseFullWidthOptions {
  target: { pageId: string } | { taskId: string } | { rowId: string }
  initial: boolean
  canEdit: boolean
  /** Page title, task name or row title (kept for the undo stack's description). */
  label: string
}

const messageOf = (err: unknown): string =>
  err instanceof Error && err.message !== '' ? err.message : th.errors.INTERNAL

export function useFullWidth(o: UseFullWidthOptions): {
  fullWidth: boolean
  toggle: () => void
  canToggle: boolean
} {
  const qc = useQueryClient()
  const undo = useContext(UndoContext)
  const [fullWidth, setFullWidth] = useState(o.initial)
  // follow a fresh server value (another viewer's toggle reaching us through a reload / refetch)
  const [prevInitial, setPrevInitial] = useState(o.initial)
  if (o.initial !== prevInitial) {
    setPrevInitial(o.initial)
    setFullWidth(o.initial)
  }
  const { canEdit } = o
  const pageId = 'pageId' in o.target ? o.target.pageId : null
  const taskId = 'taskId' in o.target ? o.target.taskId : null
  const rowId = 'rowId' in o.target ? o.target.rowId : null
  const target = useMemo<UseFullWidthOptions['target']>(
    () => (pageId !== null ? { pageId } : rowId !== null ? { rowId } : { taskId: taskId ?? '' }),
    [pageId, taskId, rowId],
  )

  const patchCache = useCallback(
    (to: UseFullWidthOptions['target'], value: boolean) => {
      if ('taskId' in to)
        qc.setQueryData<TaskBodyView>(qk.taskBody(to.taskId), (v) =>
          v?.page ? { ...v, page: { ...v.page, fullWidth: value } } : v,
        )
      else if ('rowId' in to)
        qc.setQueryData<RowBodyView>(qk.rowBody(to.rowId), (v) =>
          v?.page ? { ...v, page: { ...v.page, fullWidth: value } } : v,
        )
      else
        qc.setQueryData<PageView>(qk.page(to.pageId), (v) =>
          v ? { ...v, page: { ...v.page, fullWidth: value } } : v,
        )
    },
    [qc],
  )

  /** Shows `value` now, saves it, reverts on failure (the error is rethrown for the undo stack). */
  const apply = useCallback(
    async (to: UseFullWidthOptions['target'], value: boolean): Promise<void> => {
      setFullWidth(value)
      try {
        await unwrap(setPageFullWidth({ ...to, fullWidth: value }))
        patchCache(to, value)
      } catch (err) {
        setFullWidth(!value)
        throw err
      }
    },
    [patchCache],
  )

  const toggle = useCallback(() => {
    if (!canEdit) return
    const next = !fullWidth
    apply(target, next).then(
      () =>
        undo?.push({
          label: th.layout.fullWidth,
          undo: () => apply(target, !next),
          redo: () => apply(target, next),
        }),
      (err: unknown) => {
        toast.error(messageOf(err))
      },
    )
  }, [canEdit, fullWidth, target, apply, undo])

  return { fullWidth, toggle, canToggle: canEdit }
}
