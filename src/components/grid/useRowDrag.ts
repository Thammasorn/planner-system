'use client'
// src/components/grid/useRowDrag.ts — drag ⠿ to reorder task rows (SPEC FR-815, AC-809, BR-105, M7.1-D16). A custom
// pointer drag, not dnd-kit: the virtualized grid unmounts off-screen rows. The handle captures the pointer; the target
// is arithmetic on the uniform row height (pointerRowIndex) + M3's projection (dropTarget) over the visible rows, the
// horizontal offset picks the depth. Autoscroll within 40 px of the body edges (rAF, ≤ 12 px/frame). Esc or
// pointercancel = no move. Touch: a 300 ms long-press on ⠿ starts the drag (moving first cancels it). React state
// changes only when the indicator changes (≥ 50 fps on 200 rows, NFR-13).
import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import type { Placement } from '@/lib/tree/ops'
import type { FlatItem } from '@/lib/tree/projection'
import { FOOTER_ROWS, HEADER_TOTAL_H, ROW_H } from '@/lib/grid/columns'
import {
  autoscrollStep,
  dropTarget,
  INDENT_PX,
  LONG_PRESS_MS,
  pointerRowIndex,
} from '@/lib/grid/row-drop'
import type { GridViewRow } from '@/lib/grid/rows'

export interface RowDragState {
  taskId: string
  indicatorIndex: number
  depth: number
  valid: boolean
}

export interface RowDragOptions {
  scroller: () => HTMLElement | null
  viewRows: readonly GridViewRow[]
  /** the project's task tree in DFS order (null until loaded: no drag) */
  items: readonly FlatItem[] | null
  onDrop: (taskId: string, placement: Placement) => void
}

/** Movement (px) that cancels a pending touch long-press. */
const TOUCH_SLOP = 8

export function useRowDrag(o: RowDragOptions) {
  const opts = useRef(o)
  useEffect(() => {
    opts.current = o
  })
  const [state, setState] = useState<RowDragState | null>(null)
  const cleanup = useRef<(() => void) | null>(null)
  useEffect(() => () => cleanup.current?.(), [])

  const onHandlePointerDown = useCallback((e: ReactPointerEvent<HTMLElement>, taskId: string) => {
    if (e.button !== 0 || !opts.current.items) return
    cleanup.current?.()
    const handle = e.currentTarget
    const pointerId = e.pointerId
    const startX = e.clientX
    let lastX = e.clientX
    let lastY = e.clientY
    let started = false
    let placement: Placement | null = null
    let shown: RowDragState | null = null
    let raf = 0
    let press: ReturnType<typeof setTimeout> | undefined

    const compute = () => {
      const el = opts.current.scroller()
      const items = opts.current.items
      if (!el || !items) return
      const rect = el.getBoundingClientRect()
      const idx = pointerRowIndex({
        clientY: lastY,
        scrollerTop: rect.top,
        scrollTop: el.scrollTop,
        headerH: HEADER_TOTAL_H,
        rowH: ROW_H,
      })
      const t = dropTarget({
        viewRows: opts.current.viewRows,
        items,
        activeTaskId: taskId,
        pointerIndex: idx,
        dx: lastX - startX,
        indentPx: INDENT_PX,
      })
      placement = t.placement
      const next: RowDragState = { taskId, indicatorIndex: t.indicatorIndex, depth: t.depth, valid: t.valid }
      if (
        !shown ||
        shown.indicatorIndex !== next.indicatorIndex ||
        shown.depth !== next.depth ||
        shown.valid !== next.valid
      ) {
        shown = next
        setState(next)
      }
    }
    const tick = () => {
      raf = 0
      const el = opts.current.scroller()
      if (!el || !started) return
      const rect = el.getBoundingClientRect()
      const step = autoscrollStep(lastY, rect.top + HEADER_TOTAL_H, rect.bottom - FOOTER_ROWS * ROW_H)
      if (step !== 0) {
        el.scrollTop += step
        compute()
        raf = requestAnimationFrame(tick)
      }
    }
    const start = () => {
      started = true
      handle.setPointerCapture?.(pointerId)
      compute()
    }
    const finish = (drop: boolean) => {
      const p = placement
      cleanup.current?.()
      if (drop && started && p) opts.current.onDrop(taskId, p)
    }
    const onMove = (ev: PointerEvent) => {
      if (ev.pointerId !== pointerId) return
      lastX = ev.clientX
      lastY = ev.clientY
      if (!started) {
        if (press !== undefined && Math.hypot(ev.clientX - startX, ev.clientY - e.clientY) > TOUCH_SLOP) finish(false)
        return
      }
      ev.preventDefault()
      compute()
      if (!raf) raf = requestAnimationFrame(tick)
    }
    const onUp = (ev: PointerEvent) => {
      if (ev.pointerId === pointerId) finish(true)
    }
    const onCancel = (ev: PointerEvent) => {
      if (ev.pointerId === pointerId) finish(false)
    }
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key !== 'Escape') return
      ev.preventDefault()
      ev.stopPropagation()
      finish(false)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onCancel)
    window.addEventListener('keydown', onKey, true)
    cleanup.current = () => {
      cleanup.current = null
      clearTimeout(press)
      cancelAnimationFrame(raf)
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onCancel)
      window.removeEventListener('keydown', onKey, true)
      if (handle.hasPointerCapture?.(pointerId)) handle.releasePointerCapture(pointerId)
      setState(null)
    }
    e.preventDefault()
    if (e.pointerType === 'touch') press = setTimeout(start, LONG_PRESS_MS)
    else start()
  }, [])

  return { state, onHandlePointerDown }
}
