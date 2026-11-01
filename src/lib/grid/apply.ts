// src/lib/grid/apply.ts — typed values, f/h and clear over the selected cells (SPEC §4.8, AC-801/802, BR-26/27,
// M6-D10/D11, X65). Pure: every target is parsed against its own capacity; read-only and DAY weeks are skipped.
import { fullCapacityCd, halfCapacityCd, parseCellInput, type ParsedCell } from '@/domain/units'
import type { Cd, CellUnit, ISODate } from '@/domain/types'
import type { AssigneeCell } from '@/lib/contracts/grid'
import type { CellWrite } from './queue'
import type { Editability, RowKey } from './rows'

/** BR-26: a WEEK cell holds at most 7 days. */
export const MAX_WEEK_CD = 700

export interface TargetCell {
  rowKey: RowKey
  /** null on task rows (no assignment to write to) */
  taskAssignmentId: string | null
  week: ISODate
  editability: Editability
  /** the cell's own week capacity (people[u].capacity[W:week]; 0 when missing) */
  capCd: Cd
  cell?: AssigneeCell
}

export interface PlanResult {
  writes: CellWrite[]
  skippedReadOnly: number
  skippedDayWeek: number
  skippedNoCapacity: number
}

function empty(): PlanResult {
  return { writes: [], skippedReadOnly: 0, skippedDayWeek: 0, skippedNoCapacity: 0 }
}

/** Counts a non-editable target; true when the target can be written. */
function editable(t: TargetCell, r: PlanResult): t is TargetCell & { taskAssignmentId: string } {
  if (t.editability === 'ok' && t.taskAssignmentId !== null) return true
  if (t.editability === 'dayWeek') r.skippedDayWeek++
  else r.skippedReadOnly++
  return false
}

const weekWrite = (t: TargetCell & { taskAssignmentId: string }, cd: Cd | null): CellWrite => ({
  taskAssignmentId: t.taskAssignmentId,
  granularity: 'WEEK',
  period: t.week,
  cd,
})

/** Resolve a typed value (or f/h) for every target cell of the selection; returns writes + skipped counts. Any
 *  invalid parse (format, negative, > 7 days) cancels the whole gesture. */
export function planTyped(
  raw: string,
  targets: readonly TargetCell[],
  unit: CellUnit,
): PlanResult & { invalid: ParsedCell | null } {
  const r = empty()
  for (const t of targets) {
    if (!editable(t, r)) continue
    const p = parseCellInput(raw, { unit, capCd: t.capCd, maxCd: MAX_WEEK_CD })
    if (p.kind === 'invalid') return { ...empty(), invalid: p }
    if (p.kind === 'skip') r.skippedNoCapacity++
    else r.writes.push(weekWrite(t, p.kind === 'clear' ? null : p.cd))
  }
  return { ...r, invalid: null }
}

/** `f` = the cell's exact capacity, `h` = half rounded to 25 cd (X65); cap-0 cells are skipped. */
export function planCapacityKey(key: 'f' | 'h', targets: readonly TargetCell[]): PlanResult {
  const r = empty()
  for (const t of targets) {
    if (!editable(t, r)) continue
    if (t.capCd === 0) {
      r.skippedNoCapacity++
      continue
    }
    const cd = key === 'f' ? fullCapacityCd(t.capCd) : halfCapacityCd(t.capCd)
    r.writes.push(weekWrite(t, Math.min(cd, MAX_WEEK_CD)))
  }
  return r
}

/** Delete / Backspace: null for every editable non-empty target. */
export function planClear(targets: readonly TargetCell[]): PlanResult {
  const r = empty()
  for (const t of targets) {
    if (!editable(t, r)) continue
    if (t.cell && t.cell.cd !== 0) r.writes.push(weekWrite(t, null))
  }
  return r
}
