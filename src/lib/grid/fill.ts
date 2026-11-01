// src/lib/grid/fill.ts — fill handle (SPEC §4.8 "ลากจุดมุมขวาล่าง", X65). Pure: tiles the source values over the target
// rect (copy, never increment); read-only targets are skipped. M7: day columns write DAY values (a derived value over
// 1 day is capped at 1, BR-26); the caller clips the target to the same column kind (kinds.ts#sameKindRun).
import type { TargetCell } from './apply'
import { MAX_DAY_CD, writeFor } from './day-input'
import type { CellWrite } from './queue'
import type { Rect } from './selection'

const mod = (a: number, n: number) => ((a % n) + n) % n

export function planFill(
  source: Rect,
  target: Rect,
  grid: (r: number, c: number) => TargetCell | null,
): { writes: CellWrite[]; filled: number; skippedReadOnly: number } {
  const h = source.r1 - source.r0 + 1
  const w = source.c1 - source.c0 + 1
  const writes: CellWrite[] = []
  let skippedReadOnly = 0
  for (let r = target.r0; r <= target.r1; r++) {
    for (let c = target.c0; c <= target.c1; c++) {
      const t = grid(r, c)
      if (t === null) continue
      if (t.editability !== 'ok' || t.taskAssignmentId === null) {
        skippedReadOnly++
        continue
      }
      const src = grid(source.r0 + mod(r - source.r0, h), source.c0 + mod(c - source.c0, w))
      const raw = src?.cell?.cd ?? 0
      const cd = t.granularity === 'DAY' ? Math.min(raw, MAX_DAY_CD) : raw
      if ((t.cell?.cd ?? 0) === cd && t.cell?.derived !== true) continue
      writes.push(writeFor(t, cd === 0 ? null : cd))
    }
  }
  return { writes, filled: writes.length, skippedReadOnly }
}
