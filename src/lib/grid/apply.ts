// src/lib/grid/apply.ts — typed values, f/h and clear over the selected cells (SPEC §4.8, AC-801/802, BR-26/27,
// M6-D10/D11, X65; M7 S3.6). Pure: every target is parsed against its own capacity (a day cell against that day's
// capacity); read-only targets are skipped. M7: DAY-resolution weeks are editable (their WEEK writes go through the
// BR-24 flow, X27) and day columns write DAY changes (writeFor).
import { fullCapacityCd, halfCapacityCd, parseCellInput, type ParsedCell } from '@/domain/units'
import type { Cd, CellUnit, ISODate } from '@/domain/types'
import type { AssigneeCell } from '@/lib/contracts/grid'
import { dayCapacityKey, parseDayInput, writeFor } from './day-input'
import type { CellWrite } from './queue'
import type { RowKey, SumEditability } from './rows'

/** BR-26: a WEEK cell holds at most 7 days. */
export const MAX_WEEK_CD = 700

export interface TargetCell {
  rowKey: RowKey
  /** null on task rows (no assignment to write to) */
  taskAssignmentId: string | null
  week: ISODate
  /** M7.1: 'readOnlySum' = a summed cell (assignee column hidden, BR-101) */
  editability: SumEditability
  /** the cell's own capacity: people[u].capacity[W:week] (week / รวม) or [D:date] (day column); 0 when missing */
  capCd: Cd
  cell?: AssigneeCell
  /** M7: 'DAY' for day columns (role 'day'); absent / 'WEEK' for week and รวม columns */
  granularity?: 'WEEK' | 'DAY'
  /** M7: the day of a day column */
  date?: ISODate
}

export interface PlanResult {
  writes: CellWrite[]
  skippedReadOnly: number
  skippedNoCapacity: number
  /** M7: day cells whose typed value exceeds 1 day (rejected per cell, M7-D12) */
  rejectedDayMax: number
}

function empty(): PlanResult {
  return { writes: [], skippedReadOnly: 0, skippedNoCapacity: 0, rejectedDayMax: 0 }
}

const isDay = (t: TargetCell) => t.granularity === 'DAY'

/** Counts a non-editable target; true when the target can be written. */
function editable(t: TargetCell, r: PlanResult): t is TargetCell & { taskAssignmentId: string } {
  if (t.editability === 'ok' && t.taskAssignmentId !== null) return true
  r.skippedReadOnly++
  return false
}

/** A token parsed against the target's own capacity and limit (day cells: day capacity, ≤ 1 day). */
export function parseFor(raw: string, t: TargetCell, unit: CellUnit): ParsedCell {
  return isDay(t)
    ? parseDayInput(raw, { unit, dayCapCd: t.capCd })
    : parseCellInput(raw, { unit, capCd: t.capCd, maxCd: MAX_WEEK_CD })
}

/**
 * Resolve a typed value (or f/h) for every target cell of the selection. A format / negative / > 7 days error cancels
 * the whole gesture (`invalid`). A day value > 1 day rejects that day cell only (`rejectedDayMax`); when every editable
 * target was rejected, `invalid` is that MAX result so the editor stays open (`dayMax: true`).
 */
export function planTyped(
  raw: string,
  targets: readonly TargetCell[],
  unit: CellUnit,
): PlanResult & { invalid: ParsedCell | null; dayMax: boolean } {
  const r = empty()
  for (const t of targets) {
    if (!editable(t, r)) continue
    const p = parseFor(raw, t, unit)
    if (p.kind === 'invalid') {
      if (isDay(t) && p.reason === 'MAX') {
        r.rejectedDayMax++
        continue
      }
      return { ...empty(), invalid: p, dayMax: false }
    }
    if (p.kind === 'skip') r.skippedNoCapacity++
    else r.writes.push(writeFor(t, p.kind === 'clear' ? null : p.cd))
  }
  if (r.rejectedDayMax > 0 && r.writes.length === 0 && r.skippedNoCapacity === 0)
    return { ...r, invalid: { kind: 'invalid', reason: 'MAX' }, dayMax: true }
  return { ...r, invalid: null, dayMax: false }
}

/** `f` = the cell's exact capacity, `h` = half rounded to 25 cd (X65); cap-0 cells are skipped. Day cells use the
 *  day's capacity (dayCapacityKey). */
export function planCapacityKey(key: 'f' | 'h', targets: readonly TargetCell[]): PlanResult {
  const r = empty()
  for (const t of targets) {
    if (!editable(t, r)) continue
    const cd = isDay(t)
      ? dayCapacityKey(key, t.capCd)
      : t.capCd === 0
        ? null
        : Math.min(key === 'f' ? fullCapacityCd(t.capCd) : halfCapacityCd(t.capCd), MAX_WEEK_CD)
    if (cd === null) {
      r.skippedNoCapacity++
      continue
    }
    r.writes.push(writeFor(t, cd))
  }
  return r
}

/** Delete / Backspace: null for every editable non-empty target (a derived day value deletes that day, BR-22). */
export function planClear(targets: readonly TargetCell[]): PlanResult {
  const r = empty()
  for (const t of targets) {
    if (!editable(t, r)) continue
    if (t.cell && t.cell.cd !== 0) r.writes.push(writeFor(t, null))
  }
  return r
}

/** M7.1 (FR-817, M7.1-D6): how many of the targets are summed read-only cells (assignee column hidden). */
export function countReadOnlySum(targets: readonly (TargetCell | null)[]): number {
  let n = 0
  for (const t of targets) if (t?.editability === 'readOnlySum') n++
  return n
}

/**
 * The skip toasts of a range gesture (FR-817): summed cells get `th.grid.sumMode.skipped(n)` once; the other read-only
 * cells keep M6's "ข้าม N ช่องที่แก้ไม่ได้". Returns [sumSkipped, otherSkipped].
 */
export function splitSkipped(skippedReadOnly: number, sumCount: number): [number, number] {
  const sum = Math.min(skippedReadOnly, sumCount)
  return [sum, skippedReadOnly - sum]
}
