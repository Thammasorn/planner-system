// src/lib/grid/selection.ts — selection math over (row index, column index) of the visible rows / columns. Pure.

export interface CellPos {
  r: number
  c: number
}

/** Inclusive, normalised rectangle (r0 ≤ r1, c0 ≤ c1). */
export interface Rect {
  r0: number
  c0: number
  r1: number
  c1: number
}

export function rectOf(a: CellPos, b: CellPos): Rect {
  return { r0: Math.min(a.r, b.r), c0: Math.min(a.c, b.c), r1: Math.max(a.r, b.r), c1: Math.max(a.c, b.c) }
}

export function inRect(rect: Rect | null, r: number, c: number): boolean {
  return rect !== null && r >= rect.r0 && r <= rect.r1 && c >= rect.c0 && c <= rect.c1
}

export function rectSize(rect: Rect): { rows: number; cols: number } {
  return { rows: rect.r1 - rect.r0 + 1, cols: rect.c1 - rect.c0 + 1 }
}

export function clampPos(p: CellPos, rows: number, cols: number): CellPos {
  return { r: Math.max(0, Math.min(rows - 1, p.r)), c: Math.max(0, Math.min(cols - 1, p.c)) }
}

/** Moves one step (clamped to the grid). */
export function movePos(p: CellPos, dr: number, dc: number, rows: number, cols: number): CellPos {
  return clampPos({ r: p.r + dr, c: p.c + dc }, rows, cols)
}

/** Cells of a rect, row-major, through a lookup (null entries are dropped). */
export function cellsOf<T>(rect: Rect, at: (r: number, c: number) => T | null): T[][] {
  const out: T[][] = []
  for (let r = rect.r0; r <= rect.r1; r++) {
    const row: T[] = []
    for (let c = rect.c0; c <= rect.c1; c++) {
      const t = at(r, c)
      if (t !== null) row.push(t)
    }
    out.push(row)
  }
  return out
}

/**
 * Fill-handle target: from the source rect towards the pointer cell along ONE axis (the dominant one), excluding the
 * source itself. null when the pointer is inside the source.
 */
export function fillTargetRect(source: Rect, pointer: CellPos): Rect | null {
  const down = pointer.r - source.r1
  const up = source.r0 - pointer.r
  const right = pointer.c - source.c1
  const left = source.c0 - pointer.c
  const v = Math.max(down, up)
  const h = Math.max(right, left)
  if (v <= 0 && h <= 0) return null
  if (v >= h) {
    return down > 0
      ? { r0: source.r1 + 1, r1: pointer.r, c0: source.c0, c1: source.c1 }
      : { r0: pointer.r, r1: source.r0 - 1, c0: source.c0, c1: source.c1 }
  }
  return right > 0
    ? { r0: source.r0, r1: source.r1, c0: source.c1 + 1, c1: pointer.c }
    : { r0: source.r0, r1: source.r1, c0: pointer.c, c1: source.c0 - 1 }
}
