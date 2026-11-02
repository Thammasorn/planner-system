'use client'
// src/components/grid/useColumnResize.ts — the งาน column resize gesture (SPEC FR-814, AC-808, M7.1-D9). Pointer: capture
// on the separator, the live width goes to `onLive` (VirtualGrid writes the CSS variable in rAF — no React render per
// pixel) and the clamped width is committed once on release. Keyboard: ←/→ ±16, Shift ±64, Home/End, Enter = 240
// (nudgeWidth); each key commits for display at once, the preference is saved 500 ms after the last key. Double-click
// = 240. Exactly one `onSave` per gesture.
import { useCallback, useEffect, useRef, type KeyboardEvent, type PointerEvent } from 'react'
import { clampTaskWidth, nudgeWidth, TASK_W_DEFAULT } from '@/lib/grid/frozen'

export const RESIZE_SAVE_DELAY_MS = 500

export interface ColumnResizeOptions {
  /** the task width in effect (already clamped) */
  width: number
  /** the grid's clientWidth (0 = not measured) and whether the assignee column takes room */
  gridWidth: number
  showAssignees: boolean
  /** live width while dragging (CSS only) */
  onLive: (px: number) => void
  /** the new width for React state (display) */
  onCommit: (px: number) => void
  /** persist `grid.taskColumnWidth` (once per gesture) */
  onSave: (px: number) => void
}

export function useColumnResize(o: ColumnResizeOptions) {
  const opts = useRef(o)
  useEffect(() => {
    opts.current = o
  })
  const drag = useRef<{ startX: number; startW: number; last: number; id: number } | null>(null)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  useEffect(() => () => clearTimeout(saveTimer.current), [])

  const min = clampTaskWidth(0, o.gridWidth, o.showAssignees)
  const max = clampTaskWidth(Number.MAX_SAFE_INTEGER, o.gridWidth, o.showAssignees)

  const commitNow = useCallback((w: number) => {
    clearTimeout(saveTimer.current)
    opts.current.onLive(w)
    opts.current.onCommit(w)
    opts.current.onSave(w)
  }, [])

  const onPointerDown = useCallback((e: PointerEvent<HTMLElement>) => {
    if (e.button !== 0) return
    e.preventDefault()
    e.stopPropagation()
    e.currentTarget.setPointerCapture?.(e.pointerId)
    const w = opts.current.width
    drag.current = { startX: e.clientX, startW: w, last: w, id: e.pointerId }
  }, [])

  const onPointerMove = useCallback((e: PointerEvent<HTMLElement>) => {
    const d = drag.current
    if (!d || d.id !== e.pointerId) return
    const w = clampTaskWidth(d.startW + e.clientX - d.startX, opts.current.gridWidth, opts.current.showAssignees)
    if (w === d.last) return
    d.last = w
    e.currentTarget.setAttribute('aria-valuenow', String(w))
    opts.current.onLive(w)
  }, [])

  const end = useCallback(
    (e: PointerEvent<HTMLElement>, keep: boolean) => {
      const d = drag.current
      if (!d || d.id !== e.pointerId) return
      drag.current = null
      e.currentTarget.releasePointerCapture?.(e.pointerId)
      if (!keep || d.last === d.startW) {
        opts.current.onLive(d.startW)
        e.currentTarget.setAttribute('aria-valuenow', String(d.startW))
        return
      }
      commitNow(d.last)
    },
    [commitNow],
  )
  const onPointerUp = useCallback((e: PointerEvent<HTMLElement>) => end(e, true), [end])
  const onPointerCancel = useCallback((e: PointerEvent<HTMLElement>) => end(e, false), [end])

  const onKeyDown = useCallback((e: KeyboardEvent<HTMLElement>) => {
    if (e.altKey || e.metaKey || e.ctrlKey) return
    const next = nudgeWidth(opts.current.width, e.key, e.shiftKey)
    if (next === null) return
    e.preventDefault()
    e.stopPropagation()
    const w = clampTaskWidth(next, opts.current.gridWidth, opts.current.showAssignees)
    opts.current.onLive(w)
    opts.current.onCommit(w)
    clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => opts.current.onSave(w), RESIZE_SAVE_DELAY_MS)
  }, [])

  const onDoubleClick = useCallback(
    (e: { preventDefault(): void; stopPropagation(): void }) => {
      e.preventDefault()
      e.stopPropagation()
      commitNow(clampTaskWidth(TASK_W_DEFAULT, opts.current.gridWidth, opts.current.showAssignees))
    },
    [commitNow],
  )

  return { min, max, onPointerDown, onPointerMove, onPointerUp, onPointerCancel, onKeyDown, onDoubleClick }
}
