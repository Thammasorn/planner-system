'use client'
// src/components/grid/useRowDrag.ts — drag ⠿ to reorder / re-parent task rows (SPEC FR-815, AC-809, BR-105, M7.1-D16,
// v3.9 Notion/Linear-like feel). A custom pointer drag, not dnd-kit: the virtualized grid unmounts off-screen rows.
// The handle captures the pointer; the target is arithmetic on the uniform row height (pointerRowPos → logicalRowPos,
// which removes the opened gap) + dropAt over the visible rows: the upper / lower half of a block = before / after it,
// the horizontal offset picks the depth. While dragging, the rows at and below the drop point slide one row down
// (CSS transition, none with prefers-reduced-motion), a lifted ghost follows the pointer (positioned through a ref —
// no React render per pointermove), the would-be parent row is highlighted. Autoscroll within 40 px of the body edges
// (rAF, ≤ 12 px/frame). Esc or a drop on an invalid / unchanged spot animates the ghost back to its row (no move);
// pointercancel = no move. Touch: a 300 ms long-press on ⠿ starts the drag (moving first cancels it). React state
// changes only when the target changes (≥ 50 fps on 200 rows, NFR-13).
import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import type { Placement } from '@/lib/tree/ops'
import type { FlatItem } from '@/lib/tree/projection'
import { FOOTER_ROWS, HEADER_TOTAL_H, ROW_H } from '@/lib/grid/columns'
import {
  autoscrollStep,
  DRAG_ANIM_MS,
  dropAt,
  INDENT_PX,
  logicalRowPos,
  LONG_PRESS_MS,
  pointerRowPos,
} from '@/lib/grid/row-drop'
import type { GridViewRow } from '@/lib/grid/rows'

export interface RowDragState {
  taskId: string
  /** view-row index the drop line sits above; -1 = no line (in place / returning) */
  indicatorIndex: number
  depth: number
  valid: boolean
  /** the would-be parent (highlighted); undefined when invalid */
  parentId: string | null | undefined
  /** rows at and below this index are drawn one row lower (-1 = none) */
  gapIndex: number
  /** Esc / no-op drop: the ghost glides back, the rows slide back */
  returning: boolean
  /** the dragged row header's client rect at the start (the ghost's home) */
  origin: { x: number; y: number; width: number }
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

const reducedMotion = (): boolean =>
  typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true

export function useRowDrag(o: RowDragOptions) {
  const opts = useRef(o)
  useEffect(() => {
    opts.current = o
  })
  const [state, setState] = useState<RowDragState | null>(null)
  const ghostRef = useRef<HTMLDivElement | null>(null)
  const ghostAt = useRef({ x: 0, y: 0 })
  const cleanup = useRef<(() => void) | null>(null)
  const settleTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  useEffect(
    () => () => {
      cleanup.current?.()
      clearTimeout(settleTimer.current)
    },
    [],
  )

  const onHandlePointerDown = useCallback((e: ReactPointerEvent<HTMLElement>, taskId: string) => {
    if (e.button !== 0 || !opts.current.items) return
    cleanup.current?.()
    clearTimeout(settleTimer.current)
    const handle = e.currentTarget
    const pointerId = e.pointerId
    const startX = e.clientX
    const startY = e.clientY
    let lastX = e.clientX
    let lastY = e.clientY
    let lastPos: number | null = null
    let started = false
    let placement: Placement | null = null
    let shown: RowDragState | null = null
    let raf = 0
    let press: ReturnType<typeof setTimeout> | undefined
    const header = handle.closest<HTMLElement>('[data-row-header]') ?? handle
    const hr = header.getBoundingClientRect()
    const grab = { x: startX - hr.left, y: startY - hr.top }
    const scrollTop0 = opts.current.scroller()?.scrollTop ?? 0
    const origin = { x: hr.left, y: hr.top, width: hr.width }

    ghostAt.current = { x: origin.x, y: origin.y }
    const placeGhost = () => {
      ghostAt.current = { x: lastX - grab.x, y: lastY - grab.y }
      const g = ghostRef.current
      if (g) g.style.transform = `translate(${ghostAt.current.x}px, ${ghostAt.current.y}px)`
    }
    const compute = () => {
      const el = opts.current.scroller()
      const items = opts.current.items
      if (!el || !items) return
      const rect = el.getBoundingClientRect()
      const visual = pointerRowPos({
        clientY: lastY,
        scrollerTop: rect.top,
        scrollTop: el.scrollTop,
        headerH: HEADER_TOTAL_H,
        rowH: ROW_H,
      })
      const pos = logicalRowPos(visual, shown?.gapIndex ?? -1) ?? lastPos ?? visual
      lastPos = pos
      const t = dropAt({
        viewRows: opts.current.viewRows,
        items,
        activeTaskId: taskId,
        rowPos: pos,
        dx: lastX - startX,
        indentPx: INDENT_PX,
      })
      placement = t.valid ? t.placement : null
      const next: RowDragState = {
        taskId,
        indicatorIndex: t.indicatorIndex,
        depth: t.depth,
        valid: t.valid,
        parentId: t.parentId,
        gapIndex: t.indicatorIndex,
        returning: false,
        origin: { ...origin, y: origin.y - (el.scrollTop - scrollTop0) },
      }
      if (
        !shown ||
        shown.indicatorIndex !== next.indicatorIndex ||
        shown.depth !== next.depth ||
        shown.valid !== next.valid ||
        shown.parentId !== next.parentId
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
    const detach = () => {
      cleanup.current = null
      clearTimeout(press)
      cancelAnimationFrame(raf)
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onCancel)
      window.removeEventListener('keydown', onKey, true)
      if (handle.hasPointerCapture?.(pointerId)) handle.releasePointerCapture(pointerId)
    }
    /** drop = move now; otherwise glide the ghost home (Esc, invalid / unchanged spot) */
    const finish = (drop: boolean) => {
      const p = placement
      const back = started && shown !== null
      detach()
      if (drop && started && p) {
        setState(null)
        opts.current.onDrop(taskId, p)
        return
      }
      const ms = reducedMotion() ? 0 : DRAG_ANIM_MS
      if (!back || ms === 0) {
        setState(null)
        return
      }
      const home = shown!.origin
      const g = ghostRef.current
      if (g) {
        g.style.transition = `transform ${ms}ms ease`
        g.style.transform = `translate(${home.x}px, ${home.y}px)`
      }
      setState({ ...shown!, indicatorIndex: -1, gapIndex: -1, parentId: undefined, returning: true })
      settleTimer.current = setTimeout(() => setState(null), ms)
    }
    const onMove = (ev: PointerEvent) => {
      if (ev.pointerId !== pointerId) return
      lastX = ev.clientX
      lastY = ev.clientY
      if (!started) {
        if (press !== undefined && Math.hypot(ev.clientX - startX, ev.clientY - startY) > TOUCH_SLOP) {
          detach()
          setState(null)
        }
        return
      }
      ev.preventDefault()
      placeGhost()
      compute()
      if (!raf) raf = requestAnimationFrame(tick)
    }
    const onUp = (ev: PointerEvent) => {
      if (ev.pointerId === pointerId) finish(true)
    }
    const onCancel = (ev: PointerEvent) => {
      if (ev.pointerId !== pointerId) return
      detach()
      setState(null)
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
      detach()
      setState(null)
    }
    e.preventDefault()
    if (e.pointerType === 'touch') press = setTimeout(start, LONG_PRESS_MS)
    else start()
  }, [])

  /** the ghost element mounts with the first state: put it under the pointer's grab point at once */
  const setGhost = useCallback((el: HTMLDivElement | null) => {
    ghostRef.current = el
    if (el) el.style.transform = `translate(${ghostAt.current.x}px, ${ghostAt.current.y}px)`
  }, [])

  return { state, onHandlePointerDown, attachGhost: setGhost }
}
