// Test-only: a rectangular grid of TargetCells for the gesture planners (not imported by app code).
import { addWeeks } from '@/domain/dates'
import type { TargetCell } from './apply'
import type { Editability } from './rows'

export interface FakeRow {
  id: string
  /** cd per column (0 = empty) */
  values: number[]
  editability?: Editability | Editability[]
  capCd?: number | number[]
}

export function fakeGrid(rows: FakeRow[], firstWeek = '2026-11-09') {
  const cols = Math.max(...rows.map((r) => r.values.length))
  const at = (r: number, c: number): TargetCell | null => {
    const row = rows[r]
    if (!row || c < 0 || c >= cols) return null
    const cd = row.values[c] ?? 0
    const ed = Array.isArray(row.editability) ? (row.editability[c] ?? 'ok') : (row.editability ?? 'ok')
    const cap = Array.isArray(row.capCd) ? (row.capCd[c] ?? 500) : (row.capCd ?? 500)
    return {
      rowKey: `a:${row.id}`,
      taskAssignmentId: ed === 'readOnlyRow' || ed === 'unassigned' ? null : row.id,
      week: addWeeks(firstWeek, c),
      editability: ed,
      capCd: cap,
      ...(cd !== 0
        ? {
            cell: { cd, resolution: ed === 'dayWeek' ? ('DAY' as const) : ('WEEK' as const), derived: false },
          }
        : {}),
    }
  }
  return { at, cols }
}
