'use client'
// src/components/grid/gridStore.ts — selection / editing state outside React (M6-D26). Cells subscribe to their own
// slice through useSyncExternalStore with a numeric bitmask snapshot, so a keystroke re-renders only the cells whose
// flags changed (never 3 000 cells).
import { useSyncExternalStore } from 'react'
import { inRect, rectOf, type CellPos, type Rect } from '@/lib/grid/selection'
import type { RowKey } from '@/lib/grid/rows'

export interface GridSelState {
  anchor: CellPos | null
  focus: CellPos | null
  mode: 'nav' | 'edit'
  /** initial text of the cell editor ('' = current value) */
  draft: string
  /** row-header selection (Delete on a task row deletes the task, M6-D19) */
  rowSelection: RowKey | null
  /** fill-handle preview rect (excludes the source) */
  fill: Rect | null
  /** the user interacted with the grid: focused cells may take DOM focus */
  active: boolean
  /** cleared by the second Esc so Tab leaves the grid (M6-D32) */
  hasSelection: boolean
  /** roving tab stop while nothing is focused yet (first row, this week) */
  home: CellPos
}

export const CELL_SELECTED = 1
export const CELL_FOCUSED = 2
export const CELL_EDITING = 4
export const CELL_FILL = 8
export const CELL_HANDLE = 16
/** the one tabbable cell (roving tabindex, A11Y-2a) */
export const CELL_ROVING = 32

export interface GridStore {
  get: () => GridSelState
  set: (patch: Partial<GridSelState> | ((s: GridSelState) => Partial<GridSelState>)) => void
  subscribe: (fn: () => void) => () => void
  rect: () => Rect | null
}

export function createGridStore(): GridStore {
  let state: GridSelState = {
    anchor: null,
    focus: null,
    mode: 'nav',
    draft: '',
    rowSelection: null,
    fill: null,
    active: false,
    hasSelection: false,
    home: { r: 0, c: 0 },
  }
  let rect: Rect | null = null
  const subs = new Set<() => void>()
  return {
    get: () => state,
    rect: () => rect,
    set: (patch) => {
      const p = typeof patch === 'function' ? patch(state) : patch
      state = { ...state, ...p }
      rect = state.anchor && state.focus && state.hasSelection ? rectOf(state.anchor, state.focus) : null
      for (const fn of subs) fn()
    },
    subscribe: (fn) => {
      subs.add(fn)
      return () => subs.delete(fn)
    },
  }
}

export function cellFlags(store: GridStore, r: number, c: number): number {
  const s = store.get()
  const rect = store.rect()
  let f = 0
  if (inRect(rect, r, c)) f |= CELL_SELECTED
  if (s.focus && s.focus.r === r && s.focus.c === c && s.hasSelection) {
    f |= CELL_FOCUSED
    if (s.mode === 'edit') f |= CELL_EDITING
  }
  if (inRect(s.fill, r, c)) f |= CELL_FILL
  if (rect && s.mode === 'nav' && rect.r1 === r && rect.c1 === c) f |= CELL_HANDLE
  const roving = s.focus ?? s.home
  if (roving.r === r && roving.c === c) f |= CELL_ROVING
  return f
}

/** A cell's flags (selected / focused / editing / fill / handle) as one number. */
export function useCellFlags(store: GridStore, r: number, c: number): number {
  return useSyncExternalStore(
    store.subscribe,
    () => cellFlags(store, r, c),
    () => 0,
  )
}

/** A selector over the store (must return a primitive or a stable reference). */
export function useGridSel<T>(store: GridStore, select: (s: GridSelState) => T): T {
  return useSyncExternalStore(
    store.subscribe,
    () => select(store.get()),
    () => select(store.get()),
  )
}
