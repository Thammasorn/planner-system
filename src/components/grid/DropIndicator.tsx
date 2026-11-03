'use client'
// src/components/grid/DropIndicator.tsx — where a dragged task row will land (SPEC FR-815, M7.1-D16, v3.9): a line in
// the middle of the opened gap above view row `indicatorIndex`, starting at the projected depth's caret x (so the
// indent level is visible), with a dot and a short text — "ย้ายไปเป็นงานย่อยของ <parent>" when nesting, the invalid
// text (dashed red line) when the spot is not allowed — never colour alone. aria-live announces it.
// RowDragGhost: the lifted copy of the dragged row that follows the pointer (positioned by useRowDrag through its ref).
import { createPortal } from 'react-dom'
import type { JSX } from 'react'
import { th } from '@/i18n/th'
import { HEADER_TOTAL_H, ROW_H } from '@/lib/grid/columns'
import styles from './grid.module.css'

export interface DropIndicatorProps {
  indicatorIndex: number
  depth: number
  valid: boolean
  width: number
  /** x (px, from the task cell's left) where the line starts: the caret x of `depth` (row-layout taskLeadLayout) */
  leadX: number
  /** the would-be parent's name when the row lands as a child */
  parentName?: string | null
}

export function DropIndicator(p: DropIndicatorProps): JSX.Element | null {
  if (p.indicatorIndex < 0) return null
  const text = !p.valid
    ? th.grid.reorder.invalid
    : p.parentName
      ? th.grid.reorder.dropInside(p.parentName)
      : null
  return (
    <div
      className={styles.dropIndicator}
      style={{ top: HEADER_TOTAL_H + p.indicatorIndex * ROW_H + ROW_H / 2 - 1, width: p.width }}
      data-testid="drop-indicator"
      data-valid={p.valid ? 'true' : 'false'}
      data-depth={p.depth}
      data-index={p.indicatorIndex}
    >
      <span className={styles.dropLine} style={{ left: p.leadX }} aria-hidden="true" />
      <span className={styles.dropMarker} role="status" aria-live="polite">
        <span className={styles.dropLeadSpace} style={{ width: p.leadX }} aria-hidden="true" />
        <span className={styles.dropDot} aria-hidden="true" />
        {text ? <span className={styles.dropText}>{text}</span> : null}
      </span>
    </div>
  )
}

export function RowDragGhost({
  attach,
  name,
  width,
  valid,
  returning,
}: {
  /** useRowDrag's attachGhost (a callback ref: the hook positions the element) */
  attach: (el: HTMLDivElement | null) => void
  name: string
  width: number
  valid: boolean
  returning: boolean
}): JSX.Element | null {
  if (typeof document === 'undefined') return null
  return createPortal(
    <div
      ref={attach}
      className={styles.dragGhost}
      style={{ width: width, height: ROW_H }}
      data-testid="row-drag-ghost"
      data-valid={valid ? 'true' : 'false'}
      data-returning={returning ? 'true' : undefined}
      aria-hidden="true"
    >
      <span className={styles.dragGhostGrip}>⠿</span>
      <span className={styles.name}>{name}</span>
      {valid ? null : <span className={styles.dragGhostNo}>⛔</span>}
    </div>,
    document.body,
  )
}
