'use client'
import { createContext, useContext } from 'react'

/** One reversible user operation (SPEC §7.5, PLAN §3.8). `undo`/`redo` reject with ActionFailure on failure. */
export interface UndoEntry {
  label: string
  undo: () => Promise<void>
  redo: () => Promise<void>
}

export interface UndoApi {
  /** Adds an entry on top (max 50, oldest dropped) and clears the redo stack; `opts.toast` shows an 8 s undo toast. */
  push: (entry: UndoEntry, opts?: { toast?: string }) => void
  undo: () => Promise<void>
  redo: () => Promise<void>
  /** Undoes this specific entry wherever it sits in the stack (the toast's button); no-op once it is gone. */
  undoEntry: (entry: UndoEntry) => Promise<void>
  canUndo: boolean
  canRedo: boolean
}

export const UndoContext = createContext<UndoApi | null>(null)

/** The per-tab undo stack. Throws outside `UndoProvider` (mounted by AppProviders on every page). */
export function useUndo(): UndoApi {
  const api = useContext(UndoContext)
  if (!api) throw new Error('useUndo must be used inside <UndoProvider>')
  return api
}
