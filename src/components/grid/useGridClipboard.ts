'use client'
// src/components/grid/useGridClipboard.ts — Cmd+C / Cmd+V as TSV through the DOM copy / paste events on the grid root
// (SPEC §4.8, AC-803, M6-D28; no async clipboard API — copyText() is the fallback). Paste is one gesture (one save
// batch, one undo entry) with one toast `pasted(n)` (+ skipped counts).
import { useCallback, type ClipboardEvent, type RefObject } from 'react'
import { toast } from 'sonner'
import { th } from '@/i18n/th'
import { copyText } from '@/lib/copy-text'
import type { TargetCell } from '@/lib/grid/apply'
import { clipTargets, sameKindRun } from '@/lib/grid/kinds'
import { planPaste } from '@/lib/grid/paste'
import { cellsOf, rectSize } from '@/lib/grid/selection'
import { copyValues, parseTsv, serializeTsv } from '@/lib/grid/tsv'
import { selectionRect, toastSkipped, type GridAccess } from './useGridEditing'

function fromGridCell(e: ClipboardEvent<HTMLElement>): boolean {
  const t = e.target as HTMLElement
  if (t.closest('[data-cell-editor]')) return false // the inline editor pastes text natively
  return t.closest('[data-cell]') !== null || t === e.currentTarget
}

export function useGridClipboard(acc: RefObject<GridAccess | null>) {
  const onCopy = useCallback(
    (e: ClipboardEvent<HTMLDivElement>) => {
      const a = acc.current
      const rect = a ? selectionRect(a.store) : null
      if (!a || !rect || !fromGridCell(e)) return
      const tsv = serializeTsv(copyValues(cellsOf(rect, a.target), a.unit))
      e.preventDefault()
      if (e.clipboardData) e.clipboardData.setData('text/plain', tsv)
      else void copyText(tsv)
    },
    [acc],
  )

  const onPaste = useCallback(
    (e: ClipboardEvent<HTMLDivElement>) => {
      const a = acc.current
      const rect = a ? selectionRect(a.store) : null
      if (!a || !rect || !fromGridCell(e)) return
      const text = e.clipboardData?.getData('text/plain') ?? ''
      e.preventDefault()
      const block = parseTsv(text)
      if (block.length === 0) return
      // M7-D12: paste only into the anchor column's kind (stop before the first other-kind column)
      const size = rectSize(rect)
      const width = Math.max(0, ...block.map((x) => x.length))
      const tiled = size.cols % width === 0 && size.rows % block.length === 0 && (size.cols > width || size.rows > block.length)
      const run = a.cols
        ? sameKindRun(a.cols, rect.c0, rect.c0 + (tiled ? size.cols : width) - 1)
        : { from: rect.c0, to: Number.MAX_SAFE_INTEGER, clipped: false }
      const r = planPaste(block, { row: rect.r0, col: rect.c0 }, size, clipTargets(a.target, run), a.unit)
      if (run.clipped) toast(th.grid.day.mixedKinds)
      if (r.writes.length > 0) {
        void a.gesture(th.grid.undo.paste, r.writes)
        toast(th.grid.toast.pasted(r.pasted))
      }
      if (r.skippedReadOnly > 0) {
        // M7.1 (FR-817): summed cells of the pasted area are counted with their own text
        const rows = Math.max(size.rows, block.length)
        const area: (TargetCell | null)[] = []
        const cols = Math.max(size.cols, width)
        for (let i = 0; i < rows; i++) for (let j = 0; j < cols; j++) area.push(a.target(rect.r0 + i, rect.c0 + j))
        toastSkipped(r.skippedReadOnly, area)
      }
      if (r.invalid > 0) toast(th.grid.toast.invalidSkipped(r.invalid))
    },
    [acc],
  )

  return { onCopy, onPaste }
}
