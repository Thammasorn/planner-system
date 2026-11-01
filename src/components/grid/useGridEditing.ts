'use client'
// src/components/grid/useGridEditing.ts — editing gestures over the selection (SPEC §4.8 การกรอก/การลบ, AC-801/802,
// M6-D10/D11/D32): typed value (range fill), f/h with each cell's own capacity, Delete/Backspace, Cmd+←/→ shift.
// Every gesture is one save batch + one undo entry (useGridUndo.gesture). The pure planners live in src/lib/grid/*.
import { useCallback, type RefObject } from 'react'
import { toast } from 'sonner'
import type { CellUnit } from '@/domain/types'
import { th } from '@/i18n/th'
import type { SaveAllocationsOk } from '@/lib/contracts/grid'
import { planCapacityKey, planClear, planTyped, type PlanResult, type TargetCell } from '@/lib/grid/apply'
import type { CellWrite } from '@/lib/grid/queue'
import type { Editability } from '@/lib/grid/rows'
import { cellsOf, movePos, type CellPos, type Rect } from '@/lib/grid/selection'
import { planShift } from '@/lib/grid/shift'
import type { GridStore } from './gridStore'

/** What the gesture hooks need from PlanGrid; kept in a ref so handlers stay stable across data updates. */
export interface GridAccess {
  store: GridStore
  rowCount: number
  colCount: number
  target: (r: number, c: number) => TargetCell | null
  unit: CellUnit
  gesture: (label: string, writes: readonly CellWrite[]) => Promise<SaveAllocationsOk | null>
  scrollTo: (r: number, c: number) => void
}

export const REASON: Readonly<Record<Exclude<Editability, 'ok'>, string>> = {
  readOnlyRow: th.grid.toast.readOnlyRow,
  unassigned: th.grid.toast.needAssignee,
  archived: th.grid.toast.archived,
  noEdit: th.grid.toast.archived,
  dayWeek: th.grid.toast.dayWeekReadOnly,
}

/** The selection rect, or the focused cell alone. */
export function selectionRect(store: GridStore): Rect | null {
  const rect = store.rect()
  if (rect) return rect
  const f = store.get().focus
  return f ? { r0: f.r, c0: f.c, r1: f.r, c1: f.c } : null
}

const isSingle = (r: Rect) => r.r0 === r.r1 && r.c0 === r.c1

export function useGridEditing(acc: RefObject<GridAccess | null>) {
  /** Toasts for skipped targets; a single read-only cell gets its specific reason (M6-D11). */
  const report = useCallback((rect: Rect, targets: readonly TargetCell[], r: PlanResult) => {
    const single = isSingle(rect)
    const first = targets[0]
    if (single && first && first.editability !== 'ok') {
      toast(REASON[first.editability])
      return
    }
    if (r.skippedDayWeek > 0) toast(th.grid.toast.dayWeekReadOnly)
    if (r.skippedReadOnly > 0 && !single) toast(th.grid.toast.readOnlySkipped(r.skippedReadOnly))
    if (r.skippedNoCapacity > 0) toast(th.grid.toast.noCapacity)
  }, [])

  const moveTo = useCallback(
    (p: CellPos) => {
      const a = acc.current
      if (!a) return
      a.store.set({ anchor: p, focus: p, hasSelection: true, rowSelection: null })
      a.scrollTo(p.r, p.c)
    },
    [acc],
  )

  const startEdit = useCallback(
    (char: string) => {
      const a = acc.current
      const rect = a ? selectionRect(a.store) : null
      if (!a || !rect) return
      if (isSingle(rect)) {
        const t = a.target(rect.r0, rect.c0)
        if (!t) return
        if (t.editability !== 'ok') {
          toast(REASON[t.editability])
          return
        }
      }
      a.store.set({ mode: 'edit', draft: char, active: true, hasSelection: true })
    },
    [acc],
  )

  const cancel = useCallback(() => {
    acc.current?.store.set({ mode: 'nav', draft: '' })
  }, [acc])

  /** Enter / Tab / blur commit. Returns false when the value is invalid (the editor stays open). */
  const commit = useCallback(
    (value: string, dir: 'down' | 'right' | 'left' | 'none'): boolean => {
      const a = acc.current
      const rect = a ? selectionRect(a.store) : null
      if (!a || !rect) return true
      const targets = cellsOf(rect, a.target).flat()
      const res = planTyped(value, targets, a.unit)
      if (res.invalid) {
        toast.error(
          res.invalid.kind === 'invalid' && res.invalid.reason === 'MAX'
            ? th.grid.toast.maxWeek
            : th.grid.toast.invalidValue,
        )
        return false
      }
      a.store.set({ mode: 'nav', draft: '' })
      report(rect, targets, res)
      if (res.writes.length > 0)
        void a.gesture(isSingle(rect) ? th.grid.undo.edit : th.grid.undo.fill, res.writes)
      // a range keeps its selection (AC-801); a single cell moves on (Enter ↓, Tab →, Shift+Tab ←)
      if (isSingle(rect) && dir !== 'none') {
        const [dr, dc] = dir === 'down' ? [1, 0] : dir === 'right' ? [0, 1] : [0, -1]
        moveTo(movePos({ r: rect.r0, c: rect.c0 }, dr, dc, a.rowCount, a.colCount))
      }
      return true
    },
    [acc, moveTo, report],
  )

  const capacity = useCallback(
    (key: 'f' | 'h') => {
      const a = acc.current
      const rect = a ? selectionRect(a.store) : null
      if (!a || !rect) return
      const targets = cellsOf(rect, a.target).flat()
      const res = planCapacityKey(key, targets)
      report(rect, targets, res)
      if (res.writes.length > 0) void a.gesture(th.grid.undo.capacity, res.writes)
    },
    [acc, report],
  )

  const clear = useCallback(() => {
    const a = acc.current
    const rect = a ? selectionRect(a.store) : null
    if (!a || !rect) return
    const targets = cellsOf(rect, a.target).flat()
    const res = planClear(targets)
    report(rect, targets, res)
    if (res.writes.length > 0) void a.gesture(th.grid.undo.clear, res.writes)
  }, [acc, report])

  const shift = useCallback(
    (dir: -1 | 1) => {
      const a = acc.current
      const rect = a ? selectionRect(a.store) : null
      if (!a || !rect) return
      const res = planShift(rect, dir, a.target)
      if ('blocked' in res) {
        toast(th.grid.toast.shiftBlocked)
        return
      }
      if (res.writes.length > 0) void a.gesture(th.grid.undo.shift, res.writes)
      const s = a.store.get()
      const anchor = s.anchor ?? { r: rect.r0, c: rect.c0 }
      const focus = s.focus ?? anchor
      a.store.set({ anchor: { ...anchor, c: anchor.c + dir }, focus: { ...focus, c: focus.c + dir } })
      a.scrollTo(focus.r, focus.c + dir)
    },
    [acc],
  )

  /** Commits whatever the open editor holds (before a click elsewhere changes the selection). */
  const commitOpenEditor = useCallback(
    (root: HTMLElement | null) => {
      const a = acc.current
      if (!a || a.store.get().mode !== 'edit') return
      const input = root?.querySelector<HTMLInputElement>('[data-cell-editor]')
      if (!input || !commit(input.value, 'none')) cancel()
    },
    [acc, commit, cancel],
  )

  return { startEdit, cancel, commit, capacity, clear, shift, moveTo, commitOpenEditor }
}

export type GridEditing = ReturnType<typeof useGridEditing>
