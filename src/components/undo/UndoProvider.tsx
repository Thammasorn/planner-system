'use client'
import { useCallback, useEffect, useEffectEvent, useMemo, useRef, useState, type ReactNode } from 'react'
import { toast } from 'sonner'
import { th } from '@/i18n/th'
import { ActionFailure } from '@/lib/action-result'
import { isEditableTarget, isRedoKey, isUndoKey } from '@/lib/keys'
import { toastUndo } from './toastUndo'
import { UndoContext, type UndoApi, type UndoEntry } from './useUndo'

export type { UndoApi, UndoEntry } from './useUndo'

/** SPEC §7.5: 50 steps per tab. */
export const UNDO_LIMIT = 50

function messageOf(err: unknown, fallback: string): string {
  return err instanceof ActionFailure ? err.message : fallback
}

/**
 * Per-tab undo/redo stack (X04, PLAN §3.8). One operation runs at a time: Cmd/Ctrl+Z while an undo is in flight is
 * ignored. A failing undo/redo shows a Thai error toast and drops the entry, so the stacks stay consistent.
 * Global Cmd/Ctrl+Z and Cmd/Ctrl+Shift+Z skip editable targets (inputs, contenteditable, .bn-editor) and events
 * already handled by someone else (e.defaultPrevented), matching `e.code` first for the Thai layout (X49).
 */
export function UndoProvider({ children }: { children: ReactNode }) {
  const undoStack = useRef<UndoEntry[]>([])
  const redoStack = useRef<UndoEntry[]>([])
  const toastIds = useRef(new Map<UndoEntry, string | number>())
  const busy = useRef(false)
  const [counts, setCounts] = useState({ undo: 0, redo: 0 })

  const sync = useCallback(() => {
    setCounts({ undo: undoStack.current.length, redo: redoStack.current.length })
  }, [])

  const forgetToast = useCallback((entry: UndoEntry, dismiss: boolean) => {
    const id = toastIds.current.get(entry)
    if (id === undefined) return
    toastIds.current.delete(entry)
    if (dismiss) toast.dismiss(id)
  }, [])

  const runUndo = useCallback(
    async (entry: UndoEntry) => {
      busy.current = true
      try {
        await entry.undo()
        redoStack.current.push(entry)
        if (redoStack.current.length > UNDO_LIMIT) redoStack.current.shift()
      } catch (err) {
        toast.error(messageOf(err, th.undo.failed))
      } finally {
        busy.current = false
        sync()
      }
    },
    [sync],
  )

  const undoEntry = useCallback(
    async (entry: UndoEntry) => {
      if (busy.current) return
      const i = undoStack.current.lastIndexOf(entry)
      if (i < 0) return
      undoStack.current.splice(i, 1)
      forgetToast(entry, false) // sonner closes the toast whose button was clicked
      await runUndo(entry)
    },
    [forgetToast, runUndo],
  )

  const push = useCallback(
    (entry: UndoEntry, opts?: { toast?: string }) => {
      undoStack.current.push(entry)
      while (undoStack.current.length > UNDO_LIMIT) {
        const dropped = undoStack.current.shift()
        if (dropped) forgetToast(dropped, false)
      }
      redoStack.current = []
      if (opts?.toast) toastIds.current.set(entry, toastUndo(opts.toast, () => undoEntry(entry)))
      sync()
    },
    [forgetToast, sync, undoEntry],
  )

  const undo = useCallback(async () => {
    if (busy.current) return
    const entry = undoStack.current.pop()
    if (!entry) return
    forgetToast(entry, true)
    await runUndo(entry)
  }, [forgetToast, runUndo])

  const redo = useCallback(async () => {
    if (busy.current) return
    const entry = redoStack.current.pop()
    if (!entry) return
    busy.current = true
    try {
      await entry.redo()
      undoStack.current.push(entry)
      if (undoStack.current.length > UNDO_LIMIT) undoStack.current.shift()
    } catch (err) {
      toast.error(messageOf(err, th.undo.redoFailed))
    } finally {
      busy.current = false
      sync()
    }
  }, [sync])

  const onKeyDown = useEffectEvent((e: KeyboardEvent) => {
    if (e.defaultPrevented || isEditableTarget(e.target)) return
    if (isUndoKey(e)) {
      e.preventDefault()
      void undo()
    } else if (isRedoKey(e)) {
      e.preventDefault()
      void redo()
    }
  })

  useEffect(() => {
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  const api = useMemo<UndoApi>(
    () => ({ push, undo, redo, undoEntry, canUndo: counts.undo > 0, canRedo: counts.redo > 0 }),
    [push, undo, redo, undoEntry, counts],
  )

  return <UndoContext value={api}>{children}</UndoContext>
}
