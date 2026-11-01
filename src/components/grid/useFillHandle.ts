'use client'
// src/components/grid/useFillHandle.ts — pointer gestures on the body (SPEC §4.8): click selects a cell, Shift+click /
// drag selects a range, and the 7 px fill handle at the selection's bottom-right copies the source values over the
// cells dragged across along one axis (planFill: copy, never increment; read-only targets skipped; one undo entry).
// Pointer only — the keyboard alternative of the fill handle is range + type.
import { useCallback, useRef, type PointerEvent, type RefObject } from 'react'
import { toast } from 'sonner'
import { th } from '@/i18n/th'
import { planFill } from '@/lib/grid/fill'
import { clipTargets, fillRun } from '@/lib/grid/kinds'
import { fillTargetRect, type CellPos, type Rect } from '@/lib/grid/selection'
import type { GridAccess, GridEditing } from './useGridEditing'
import { selectionRect } from './useGridEditing'

function cellPosAt(x: number, y: number): CellPos | null {
  const el = document.elementFromPoint(x, y)?.closest<HTMLElement>('[data-cell]')
  if (!el) return null
  const r = Number(el.dataset.r)
  const c = Number(el.dataset.c)
  return Number.isInteger(r) && Number.isInteger(c) ? { r, c } : null
}

function posOf(target: EventTarget | null): CellPos | null {
  const el = target instanceof Element ? target.closest<HTMLElement>('[data-cell]') : null
  if (!el) return null
  const r = Number(el.dataset.r)
  const c = Number(el.dataset.c)
  return Number.isInteger(r) && Number.isInteger(c) ? { r, c } : null
}

export function useFillHandle(acc: RefObject<GridAccess | null>, editing: GridEditing) {
  const drag = useRef<{ kind: 'select' } | { kind: 'fill'; source: Rect } | null>(null)

  const onPointerDown = useCallback(
    (e: PointerEvent<HTMLDivElement>) => {
      const a = acc.current
      if (!a || e.button !== 0) return
      const t = e.target as HTMLElement
      if (t.closest('[data-cell-editor]')) return
      const isHandle = t.closest('[data-fill-handle]') !== null
      const pos = posOf(e.target)
      if (!pos) return
      editing.commitOpenEditor(e.currentTarget)
      if (isHandle) {
        const source = selectionRect(a.store)
        if (!source) return
        e.preventDefault()
        drag.current = { kind: 'fill', source }
        e.currentTarget.setPointerCapture?.(e.pointerId)
        return
      }
      const s = a.store.get()
      a.store.set({
        anchor: e.shiftKey && s.hasSelection ? (s.anchor ?? pos) : pos,
        focus: pos,
        hasSelection: true,
        rowSelection: null,
        active: true,
        mode: 'nav',
        fill: null,
      })
      drag.current = { kind: 'select' }
    },
    [acc, editing],
  )

  const onPointerMove = useCallback(
    (e: PointerEvent<HTMLDivElement>) => {
      const a = acc.current
      const d = drag.current
      if (!a || !d || (e.buttons & 1) === 0) return
      const pos = cellPosAt(e.clientX, e.clientY)
      if (!pos) return
      if (d.kind === 'select') {
        const f = a.store.get().focus
        if (!f || f.r !== pos.r || f.c !== pos.c) a.store.set({ focus: pos })
      } else {
        a.store.set({ fill: fillTargetRect(d.source, pos) })
      }
    },
    [acc],
  )

  const onPointerUp = useCallback(
    (e: PointerEvent<HTMLDivElement>) => {
      const a = acc.current
      const d = drag.current
      drag.current = null
      if (!a || !d || d.kind !== 'fill') return
      e.currentTarget.releasePointerCapture?.(e.pointerId)
      const target = a.store.get().fill
      a.store.set({ fill: null })
      if (!target) return
      // M7-D12: fill only into columns of the source's kind
      const run = a.cols ? fillRun(a.cols, d.source, target) : { from: target.c0, to: target.c1, clipped: false }
      if (run.clipped) toast(th.grid.day.mixedKinds)
      const clipped = clipTargets(a.target, run)
      const src = d.source
      // the source columns stay readable (planFill copies from them); only targets are clipped
      const res = planFill(src, target, (r, c) => (c >= src.c0 && c <= src.c1 ? a.target(r, c) : clipped(r, c)))
      if (res.writes.length > 0) void a.gesture(th.grid.undo.fill, res.writes)
      const r0 = Math.min(d.source.r0, target.r0)
      const c0 = Math.min(d.source.c0, target.c0)
      const r1 = Math.max(d.source.r1, target.r1)
      const c1 = Math.max(d.source.c1, target.c1)
      a.store.set({ anchor: { r: r0, c: c0 }, focus: { r: r1, c: c1 }, hasSelection: true })
    },
    [acc],
  )

  return { onPointerDown, onPointerMove, onPointerUp }
}
