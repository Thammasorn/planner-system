import type { EmployeeRow } from '@/lib/contracts/users'

export type StatusFilter = 'all' | 'active' | 'deactivated'

export interface EmployeeFilter {
  /** substring of the name or nickname */
  q: string
  /** a position id, 'none' (no position) or 'all' */
  positionId: string
  status: StatusFilter
}

export const DEFAULT_FILTER: EmployeeFilter = { q: '', positionId: 'all', status: 'all' }

/** NFC + Thai-aware lower case, so composed/decomposed input and Latin case never matter (M1-D15). */
export function normalizeSearch(s: string): string {
  return s.normalize('NFC').toLocaleLowerCase('th').trim()
}

/** FR-209: search name/nickname, filter by position (incl. "ไม่ระบุตำแหน่ง") and status. Keeps the input order. */
export function filterEmployees(rows: readonly EmployeeRow[], f: EmployeeFilter): EmployeeRow[] {
  const q = normalizeSearch(f.q)
  return rows.filter((r) => {
    if (f.status === 'active' && !r.active) return false
    if (f.status === 'deactivated' && r.active) return false
    if (f.positionId === 'none' && r.positionId !== null) return false
    if (f.positionId !== 'all' && f.positionId !== 'none' && r.positionId !== f.positionId) return false
    if (q === '') return true
    return normalizeSearch(r.name).includes(q) || normalizeSearch(r.nickname ?? '').includes(q)
  })
}

const collator = new Intl.Collator('th')

/** Active first, then the display name in Thai collation. */
export function sortEmployees(rows: readonly EmployeeRow[]): EmployeeRow[] {
  return [...rows].sort(
    (a, b) => Number(!a.active) - Number(!b.active) || collator.compare(a.displayName, b.displayName),
  )
}
