// src/lib/grid/shift.ts — Cmd+←/→ moves the selected values one column (SPEC §4.8, X65). Pure.
import type { CellWrite } from './queue'
import type { TargetCell } from './apply'
import { MAX_DAY_CD, writeFor } from './day-input'
import type { Rect } from './selection'

/**
 * Values move one column, the vacated edge column is cleared, the destination column is overwritten and the selection
 * moves. Any read-only cell in the source rect or the destination column, or the timeline edge → blocked. M7: the
 * column-kind rule (kinds.ts#canShift) is checked by the caller first; DAY weeks are written (X27); day values over
 * 1 day (derived) are capped at 1 (BR-26).
 */
export function planShift(
  rect: Rect,
  dir: -1 | 1,
  grid: (r: number, c: number) => TargetCell | null,
): { writes: CellWrite[]; newRect: Rect } | { blocked: true } {
  const dest = dir > 0 ? rect.c1 + 1 : rect.c0 - 1
  const lo = Math.min(rect.c0, dest)
  const hi = Math.max(rect.c1, dest)
  const rows: TargetCell[][] = []
  for (let r = rect.r0; r <= rect.r1; r++) {
    const line: TargetCell[] = []
    for (let c = lo; c <= hi; c++) {
      const t = grid(r, c)
      if (t === null || t.editability !== 'ok' || t.taskAssignmentId === null) return { blocked: true }
      line.push(t)
    }
    rows.push(line)
  }
  const writes: CellWrite[] = []
  for (const line of rows) {
    // line covers [lo, hi]; source values sit at the source columns, shifted by dir into the destination
    const values = line.map((t) => t.cell?.cd ?? 0)
    const next = line.map((_, i) => {
      const from = i - dir
      const fromCol = lo + from
      return fromCol >= rect.c0 && fromCol <= rect.c1 ? (values[from] ?? 0) : 0
    })
    line.forEach((t, i) => {
      const v = t.granularity === 'DAY' ? Math.min(next[i]!, MAX_DAY_CD) : next[i]!
      if (v === values[i]) return
      writes.push(writeFor(t, v === 0 ? null : v))
    })
  }
  return { writes, newRect: { r0: rect.r0, r1: rect.r1, c0: rect.c0 + dir, c1: rect.c1 + dir } }
}
