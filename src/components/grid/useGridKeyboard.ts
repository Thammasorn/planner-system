'use client'
// src/components/grid/useGridKeyboard.ts — ★ one keydown handler on the grid root (SPEC §4.8, §8.6, X49, M6-D27/D32).
// e.code first (src/lib/grid/keymap.ts); every handled action calls preventDefault (Cmd+←/→ would go Back, Cmd+S would
// save the page). Undo / redo go to the shared M1 stack. Mod+↑/↓ stay unmapped for M7.
import type { KeyboardEvent, RefObject } from 'react'
import { gridKeyAction } from '@/lib/grid/keymap'
import { movePos } from '@/lib/grid/selection'
import type { GridAccess, GridEditing } from './useGridEditing'

export interface GridKeyHandlers {
  undo: () => void
  redo: () => void
  flush: () => void
  newTask: () => void
  /** Delete on a row-header selection (task / merged rows); false = nothing to delete */
  deleteRow: () => void
  /** Shift+Space: select the focused row */
  selectRow: () => void
  /** Enter on a selected row header: open the task panel (same as ↗) */
  openRow: () => void
  rowDeletable: () => boolean
}

export function useGridKeyboard(
  acc: RefObject<GridAccess | null>,
  editing: GridEditing,
  h: RefObject<GridKeyHandlers | null>,
) {
  // a plain function (not useCallback): it reads the refs at call time
  return (e: KeyboardEvent<HTMLDivElement>) => {
    const a = acc.current
    const handlers = h.current
    if (!a || !handlers) return
    const target = e.target as HTMLElement
    const inEditor = target.closest('[data-cell-editor]') !== null
    const inCell = target.closest('[data-cell]') !== null
    const inRowHeader = target.closest('[data-row-header]') !== null && target.closest('button') === null
    const onRoot = target === e.currentTarget
    if (!inEditor && !inCell && !inRowHeader && !onRoot) return
    const s = a.store.get()
    if (inRowHeader) {
      const plain = !e.metaKey && !e.ctrlKey && !e.altKey
      // Tab / Shift+Tab stay native on the row header: they reach its ▸/▾, ↗, × and + คน buttons (§8.9, S3.15)
      if (e.code === 'Tab' && plain) return
      if (
        (e.code === 'Enter' || e.code === 'NumpadEnter') &&
        plain &&
        !e.shiftKey &&
        s.rowSelection !== null
      ) {
        e.preventDefault()
        handlers.openRow()
        return
      }
    }
    const mode = inEditor && s.mode === 'edit' ? 'edit' : 'nav'
    const action = gridKeyAction(e.nativeEvent, mode, {
      rowSelected: inRowHeader && s.rowSelection !== null && handlers.rowDeletable(),
      hasSelection: s.hasSelection || inRowHeader,
    })
    if (!action) return
    // the row header only takes row-level keys
    if (
      inRowHeader &&
      !['deleteRow', 'cancel', 'undo', 'redo', 'flush', 'newTask', 'move', 'clear'].includes(action.kind)
    )
      return
    // nothing left to cancel (no edit, no row / cell selection): this Esc is not the grid's — it bubbles unhandled
    // to the window hotkeys, so the TaskPanel beside the grid closes (§8.6, M6-D18)
    if (action.kind === 'cancel' && mode === 'nav' && s.rowSelection === null && !s.hasSelection) return
    e.preventDefault()
    a.store.set({ active: true })
    switch (action.kind) {
      case 'move': {
        if (inRowHeader) {
          const p = { r: s.focus?.r ?? s.home.r, c: s.focus?.c ?? s.home.c }
          editing.moveTo(p)
          break
        }
        const from = s.focus ?? s.home
        const next = movePos(from, action.dr, action.dc, a.rowCount, a.colCount)
        a.store.set({
          focus: next,
          anchor: action.extend ? (s.anchor ?? from) : next,
          hasSelection: true,
          rowSelection: null,
        })
        a.scrollTo(next.r, next.c)
        break
      }
      case 'startEdit':
        if (!s.hasSelection) a.store.set({ anchor: s.home, focus: s.home, hasSelection: true })
        editing.startEdit(action.char)
        break
      case 'commit':
        if (!editing.commit((target as HTMLInputElement).value, action.dir))
          target.setAttribute('aria-invalid', 'true')
        break
      case 'cancel':
        if (mode === 'edit') editing.cancel()
        else if (s.rowSelection !== null) a.store.set({ rowSelection: null })
        else a.store.set({ hasSelection: false, fill: null }) // second Esc: the next Tab leaves the grid
        break
      case 'full':
        editing.capacity('f')
        break
      case 'half':
        editing.capacity('h')
        break
      case 'clear':
        if (!inRowHeader) editing.clear()
        break
      case 'shift':
        editing.shift(action.dir)
        break
      case 'undo':
        handlers.undo()
        break
      case 'redo':
        handlers.redo()
        break
      case 'flush':
        handlers.flush()
        break
      case 'newTask':
        handlers.newTask()
        break
      case 'deleteRow':
        handlers.deleteRow()
        break
      case 'selectRow':
        handlers.selectRow()
        break
    }
  }
}
