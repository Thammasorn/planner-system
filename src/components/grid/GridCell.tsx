'use client'
// src/components/grid/GridCell.tsx — one memoised body cell (FR-804/807/808, BR-20a, M6-D9/D12/D20, PLAN §3.9).
// A plain div with one CSS Module class and data-* state; selection/focus flags come from the external grid store, so
// only cells whose flags change re-render. The inline editor replaces the text while editing.
import { memo, useCallback, useEffect, useRef, type KeyboardEvent } from 'react'
import { StatusGlyph } from '@/components/common/StatusGlyph'
import type { Editability } from '@/lib/grid/rows'
import { asciiForCode } from '@/lib/grid/keymap'
import {
  CELL_EDITING,
  CELL_FILL,
  CELL_FOCUSED,
  CELL_HANDLE,
  CELL_ROVING,
  CELL_SELECTED,
  useCellFlags,
  type GridStore,
} from './gridStore'
import styles from './grid.module.css'

export interface GridCellProps {
  store: GridStore
  r: number
  c: number
  left: number
  width: number
  rowKey: string
  periodKey: string
  text: string
  /** accessible name: th.grid.cell.label(row, week, value + glyph texts) */
  label: string
  editability: Editability
  resolution: 'WEEK' | 'DAY' | undefined
  tentative: boolean
  leave: boolean
  noCapacity: boolean
  notCounted: boolean
  today: boolean
  /** the editor's initial value for F2 / '' (exact, current unit) */
  exactValue: string
  onEditorBlur: (value: string) => void
}

function CellEditor({
  initial,
  label,
  onBlur,
}: {
  initial: string
  label: string
  onBlur: (value: string) => void
}) {
  const ref = useRef<HTMLInputElement>(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    el.focus({ preventScroll: true })
    const end = el.value.length
    el.setSelectionRange(end, end)
  }, [])
  // M6-D27: on the Kedmanee layout digit / period / comma keys type Thai characters — insert the ASCII character
  const onKeyDown = useCallback((e: KeyboardEvent<HTMLInputElement>) => {
    if (e.nativeEvent.isComposing || e.metaKey || e.ctrlKey || e.altKey) return
    const ch = asciiForCode(e.code)
    if (ch === null || e.key === ch) return
    e.preventDefault()
    const el = e.currentTarget
    el.setRangeText(ch, el.selectionStart ?? el.value.length, el.selectionEnd ?? el.value.length, 'end')
    el.removeAttribute('aria-invalid')
  }, [])
  return (
    <input
      ref={ref}
      className={styles.editor}
      data-cell-editor=""
      defaultValue={initial}
      inputMode="decimal"
      autoComplete="off"
      aria-label={label}
      onKeyDown={onKeyDown}
      onInput={(e) => e.currentTarget.removeAttribute('aria-invalid')}
      onBlur={(e) => onBlur(e.currentTarget.value)}
    />
  )
}

export const GridCell = memo(function GridCell(p: GridCellProps) {
  const flags = useCellFlags(p.store, p.r, p.c)
  const ref = useRef<HTMLDivElement | null>(null)
  const focused = (flags & CELL_FOCUSED) !== 0
  const editing = (flags & CELL_EDITING) !== 0

  useEffect(() => {
    const el = ref.current
    if (!el || !focused || editing || !p.store.get().active) return
    if (document.activeElement !== el) el.focus({ preventScroll: true })
  }, [focused, editing, p.store])

  // keep keyboard focus inside the grid when the focused cell scrolls out of the virtual window
  const setRef = useCallback((el: HTMLDivElement | null) => {
    ref.current = el
    if (!el) return
    return () => {
      if (document.activeElement === el)
        el.closest<HTMLElement>('[role="grid"]')?.focus({ preventScroll: true })
    }
  }, [])

  const draft = editing ? p.store.get().draft : ''
  return (
    <div
      ref={setRef}
      role="gridcell"
      aria-colindex={p.c + 2}
      aria-selected={(flags & CELL_SELECTED) !== 0}
      aria-readonly={p.editability !== 'ok' ? true : undefined}
      aria-label={p.label}
      tabIndex={(flags & CELL_ROVING) !== 0 ? 0 : -1}
      className={styles.cell}
      style={{ left: p.left, width: p.width }}
      data-cell=""
      data-r={p.r}
      data-c={p.c}
      data-tip="cell"
      data-testid={`cell-${p.rowKey}-${p.periodKey}`}
      data-resolution={p.resolution}
      data-tentative={p.tentative ? 'true' : undefined}
      data-leave={p.leave ? 'true' : undefined}
      data-no-capacity={p.noCapacity ? 'true' : undefined}
      data-not-counted={p.notCounted ? 'true' : undefined}
      data-today={p.today ? 'true' : undefined}
      data-focused={focused ? 'true' : undefined}
      data-fill={(flags & CELL_FILL) !== 0 ? 'true' : undefined}
    >
      {editing ? (
        <CellEditor initial={draft === '' ? p.exactValue : draft} label={p.label} onBlur={p.onEditorBlur} />
      ) : (
        <>
          {p.leave ? <StatusGlyph kind="leave" /> : null}
          {p.noCapacity ? <StatusGlyph kind="noCapacity" /> : null}
          <span data-cell-value="">{p.text}</span>
          {p.resolution === 'DAY' ? <StatusGlyph kind="dayDetail" /> : null}
        </>
      )}
      {(flags & CELL_HANDLE) !== 0 && p.editability === 'ok' ? (
        <span className={styles.fillHandle} data-fill-handle="" aria-hidden="true" />
      ) : null}
    </div>
  )
})
