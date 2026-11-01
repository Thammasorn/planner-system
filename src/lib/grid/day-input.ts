// src/lib/grid/day-input.ts — typed values / f / h on day cells and the column-kind aware write (FR-804, BR-26/27,
// M7-D12, X65). Pure, thin wrappers over src/domain/units.ts.
import { fullCapacityCd, halfCapacityCd, parseCellInput, type ParsedCell } from '@/domain/units'
import type { Cd, CellUnit } from '@/domain/types'
import type { TargetCell } from './apply'
import type { CellWrite } from './queue'

/** BR-26: a DAY row holds at most 1 day. */
export const MAX_DAY_CD = 100

/** FRACTION denominator = the day's capacity (cap 0 → days, M6 rule); > 1.00 → invalid MAX. */
export function parseDayInput(raw: string, o: { unit: CellUnit; dayCapCd: Cd }): ParsedCell {
  return parseCellInput(raw, { unit: o.unit, capCd: o.dayCapCd, maxCd: MAX_DAY_CD })
}

/** 'f' → the exact day capacity; 'h' → half rounded to 25; cap 0 → null (the cell is skipped). */
export function dayCapacityKey(key: 'f' | 'h', dayCapCd: Cd): Cd | null {
  if (dayCapCd === 0) return null
  return Math.min(MAX_DAY_CD, key === 'f' ? fullCapacityCd(dayCapCd) : halfCapacityCd(dayCapCd))
}

/** D target → { DAY, date, cd }; week / รวม target → { WEEK, Monday, cd }; 0 → null. */
export function writeFor(t: TargetCell, cd: Cd | null): CellWrite {
  if (t.taskAssignmentId === null) throw new RangeError('writeFor: target has no assignment')
  const day = t.granularity === 'DAY' && t.date !== undefined
  return {
    taskAssignmentId: t.taskAssignmentId,
    granularity: day ? 'DAY' : 'WEEK',
    period: day ? t.date! : t.week,
    cd: cd === 0 ? null : cd,
  }
}
