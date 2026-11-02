'use client'
// src/components/grid/useMilestoneDrag.ts — drag a ◆ to another column (SPEC FR-707, X66, M8-D10; plan/m08 S3.6).
// Pointer events on the ◆ button (no dnd-kit): a move of ≥ 4 px starts the drag (below that it stays a click). While
// dragging the target column is the one under the pointer, in column-offset space: the grab point inside the ◆'s own
// column + the pointer's travel + the scroller's horizontal travel (columnAtX), so neither the frozen width nor the
// scroller's position on screen is needed. `Escape` cancels; `pointerup` drops: dateForDrop (day column → that day;
// week / "รวม" column → same weekday in that week); an unchanged date does nothing. No auto-scroll in MVP (R8): far
// moves use the popover's date field. `enabled` = model.context.canManage (C40).
import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type RefObject } from 'react'
import type { ISODate } from '@/domain/types'
import type { GridMilestone } from '@/lib/contracts/grid'
import type { GridColumn } from '@/lib/grid/columns'
import { columnAtX, dateForDrop, milestoneColumnKey } from '@/lib/grid/milestones'

/** Pointer travel (px) below which a press on a ◆ is a click (opens the popover). */
export const DRAG_SLOP_PX = 4

export interface MilestoneDragState {
  id: string
  targetIdx: number
}

export interface MilestoneDragOptions {
  cols: readonly GridColumn[]
  scrollEl: RefObject<HTMLElement | null>
  enabled: boolean
  onDrop(m: GridMilestone, newDate: ISODate): void
}

export interface MilestoneDrag {
  onPointerDown: (e: ReactPointerEvent<HTMLElement>, m: GridMilestone) => void
  drag: MilestoneDragState | null
  /** true once after a drag ended on this ◆ — its click (fired after pointerup) must not open the popover */
  consumeClick: () => boolean
}

export function useMilestoneDrag(o: MilestoneDragOptions): MilestoneDrag {
  const opts = useRef(o)
  useEffect(() => {
    opts.current = o
  })
  const [drag, setDrag] = useState<MilestoneDragState | null>(null)
  const cleanup = useRef<(() => void) | null>(null)
  const suppressClick = useRef(false)
  useEffect(() => () => cleanup.current?.(), [])

  const onPointerDown = useCallback((e: ReactPointerEvent<HTMLElement>, m: GridMilestone) => {
    suppressClick.current = false // a drag whose click never came (pointer released elsewhere) swallows nothing later
    if (e.button !== 0 || !opts.current.enabled) return
    const cols = opts.current.cols
    const key = milestoneColumnKey(m.date, cols)
    const startIdx = key === null ? -1 : cols.findIndex((c) => c.key === key)
    const startCol = cols[startIdx]
    if (!startCol) return
    cleanup.current?.()
    e.stopPropagation() // not a grid selection gesture
    const button = e.currentTarget
    const pointerId = e.pointerId
    const startX = e.clientX
    const startY = e.clientY
    const cell = button.closest<HTMLElement>('[data-ms-cell]') ?? button
    const grab = Math.max(0, Math.min(startCol.width - 1, startX - cell.getBoundingClientRect().left))
    const anchorX = startCol.offset + grab
    const startScroll = opts.current.scrollEl.current?.scrollLeft ?? 0
    let started = false
    let target = startIdx

    const finish = (drop: boolean) => {
      cleanup.current?.()
      if (!started) return
      suppressClick.current = true
      // The click (if any) follows pointerup in the same task. When the drop re-renders the ◆ in another cell, that
      // click never reaches it; clear the flag afterwards so a later Enter / click is not swallowed.
      setTimeout(() => {
        suppressClick.current = false
      }, 0)
      const col = opts.current.cols[target]
      if (!drop || !col) return
      const next = dateForDrop(m.date, col)
      if (next !== m.date) opts.current.onDrop(m, next)
    }
    const onMove = (ev: PointerEvent) => {
      if (ev.pointerId !== pointerId) return
      const dx = ev.clientX - startX
      if (!started) {
        if (Math.hypot(dx, ev.clientY - startY) < DRAG_SLOP_PX) return
        started = true
        button.setPointerCapture?.(pointerId)
      }
      ev.preventDefault()
      const scroll = (opts.current.scrollEl.current?.scrollLeft ?? 0) - startScroll
      const idx = columnAtX(opts.current.cols, anchorX + dx + scroll)
      if (idx < 0) return
      target = idx
      setDrag((prev) => (prev && prev.id === m.id && prev.targetIdx === idx ? prev : { id: m.id, targetIdx: idx }))
    }
    const onUp = (ev: PointerEvent) => {
      if (ev.pointerId === pointerId) finish(true)
    }
    const onCancel = (ev: PointerEvent) => {
      if (ev.pointerId === pointerId) finish(false)
    }
    const onKey = (ev: KeyboardEvent) => {
      if (ev.code !== 'Escape' && ev.key !== 'Escape') return
      if (started) {
        ev.preventDefault()
        ev.stopPropagation()
      }
      finish(false)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onCancel)
    window.addEventListener('keydown', onKey, true)
    cleanup.current = () => {
      cleanup.current = null
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onCancel)
      window.removeEventListener('keydown', onKey, true)
      if (button.hasPointerCapture?.(pointerId)) button.releasePointerCapture(pointerId)
      setDrag(null)
    }
  }, [])

  const consumeClick = useCallback(() => {
    const v = suppressClick.current
    suppressClick.current = false
    return v
  }, [])

  return { onPointerDown, drag, consumeClick }
}
