// src/lib/grid/kinds.ts — same-kind column rules (SPEC §4.8 การกรอก, M7-D12, X65). Kinds: W (week and รวม columns),
// D (day columns). Paste, fill and range typing stop before the first column of another kind; Cmd+←/→ needs one
// kind (and, for D, one week). Pure.
import type { GridColumn } from './columns'

export interface ColumnRun {
  from: number
  to: number
  /** a column of another kind cut the run short */
  clipped: boolean
}

/** From the anchor column towards `toIdx` (either direction), stopping before the first column whose kind differs.
 *  Indexes past the grid edge are dropped silently (not a kind change). */
export function sameKindRun(cols: readonly GridColumn[], fromIdx: number, toIdx: number): ColumnRun {
  const anchor = cols[fromIdx]
  if (!anchor) return { from: fromIdx, to: fromIdx - 1, clipped: false }
  const step = toIdx >= fromIdx ? 1 : -1
  let last = fromIdx
  let clipped = false
  for (let i = fromIdx + step; step > 0 ? i <= toIdx : i >= toIdx; i += step) {
    const c = cols[i]
    if (!c) break
    if (c.kind !== anchor.kind) {
      clipped = true
      break
    }
    last = i
  }
  return { from: Math.min(fromIdx, last), to: Math.max(fromIdx, last), clipped }
}

/** Fill handle: the target columns that share the source's kind, contiguous from the source edge. An empty run has
 *  `to < from`. Vertical fills (target columns = source columns) are never clipped. */
export function fillRun(
  cols: readonly GridColumn[],
  source: { c0: number; c1: number },
  target: { c0: number; c1: number },
): ColumnRun {
  if (target.c0 >= source.c0 && target.c1 <= source.c1) return { from: target.c0, to: target.c1, clipped: false }
  if (target.c0 > source.c1) {
    const r = sameKindRun(cols, source.c1, target.c1)
    return { from: target.c0, to: Math.min(r.to, target.c1), clipped: r.clipped }
  }
  const r = sameKindRun(cols, source.c0, target.c0)
  return { from: Math.max(r.from, target.c0), to: target.c1, clipped: r.clipped }
}

/** Cmd+←/→: every involved column (the selection and its destination) shares the kind; for D also the same week.
 *  The timeline edge (no destination column) is left to planShift (blocked there). */
export function canShift(cols: readonly GridColumn[], sel: { from: number; to: number }, dir: -1 | 1): boolean {
  const first = cols[sel.from]
  if (!first) return false
  const dest = dir > 0 ? sel.to + 1 : sel.from - 1
  const lo = Math.min(sel.from, dest)
  const hi = Math.max(sel.to, dest)
  for (let i = lo; i <= hi; i++) {
    const c = cols[i]
    if (!c) continue
    if (c.kind !== first.kind) return false
    if (c.kind === 'D' && c.weekStart !== first.weekStart) return false
  }
  return true
}

/** The planners' target lookup restricted to the columns [from, to]; null elsewhere (dropped, like past the edge). */
export function clipTargets<T>(
  at: (r: number, c: number) => T | null,
  run: { from: number; to: number },
): (r: number, c: number) => T | null {
  return (r, c) => (c < run.from || c > run.to ? null : at(r, c))
}
