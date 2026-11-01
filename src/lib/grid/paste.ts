// src/lib/grid/paste.ts — paste tiling (SPEC §4.8, AC-803, X65, M6-D28). Pure.
import type { CellUnit } from '@/domain/types'
import { parseFor, type TargetCell } from './apply'
import { writeFor } from './day-input'
import type { CellWrite } from './queue'

/**
 * A selection whose height and width are exact multiples of the block (and larger) is tiled; otherwise the block is
 * pasted once from the top-left. Cells past the grid edge (or the caller's same-kind run, `null` targets) are dropped;
 * read-only targets are skipped (not shifted); empty tokens clear; each token is parsed against its target's own
 * capacity (fraction unit; day cells: the day's capacity and ≤ 1 day). M7: DAY weeks are written (X27).
 */
export function planPaste(
  block: readonly (readonly string[])[],
  anchor: { row: number; col: number },
  sel: { rows: number; cols: number },
  grid: (r: number, c: number) => TargetCell | null,
  unit: CellUnit,
): { writes: CellWrite[]; pasted: number; skippedReadOnly: number; invalid: number } {
  const h = block.length
  const w = Math.max(0, ...block.map((r) => r.length))
  const writes: CellWrite[] = []
  let skippedReadOnly = 0
  let invalid = 0
  if (h === 0 || w === 0) return { writes, pasted: 0, skippedReadOnly, invalid }
  const tile = sel.rows % h === 0 && sel.cols % w === 0 && (sel.rows > h || sel.cols > w)
  const rows = tile ? sel.rows : h
  const cols = tile ? sel.cols : w
  for (let i = 0; i < rows; i++) {
    for (let j = 0; j < cols; j++) {
      const token = block[i % h]?.[j % w]
      if (token === undefined) continue
      const t = grid(anchor.row + i, anchor.col + j)
      if (t === null) continue
      if (t.editability !== 'ok' || t.taskAssignmentId === null) {
        skippedReadOnly++
        continue
      }
      const p = parseFor(token, t, unit)
      if (p.kind === 'value' || p.kind === 'clear') writes.push(writeFor(t, p.kind === 'value' ? p.cd : null))
      else invalid++
    }
  }
  return { writes, pasted: writes.length, skippedReadOnly, invalid }
}
