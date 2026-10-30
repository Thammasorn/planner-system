import { describe, expect, it } from 'vitest'
import type { EmployeeRow } from '@/lib/contracts/users'
import { filterEmployees, sortEmployees, DEFAULT_FILTER } from './filter'

const POS_PM = 'a1b2c3d4-0000-4000-8000-000000000001'
const POS_DES = 'a1b2c3d4-0000-4000-8000-000000000002'

function row(p: Partial<EmployeeRow> & Pick<EmployeeRow, 'id' | 'name'>): EmployeeRow {
  const nickname = p.nickname ?? null
  return {
    email: `${p.id}@example.com`,
    role: 'worker',
    positionId: null,
    positionName: null,
    color: null,
    active: true,
    deactivatedOn: null,
    mustChangePassword: false,
    schedule: [],
    displayName: nickname?.trim() || p.name,
    ...p,
    nickname,
  }
}

const rows: EmployeeRow[] = [
  row({ id: 'm', name: 'Demo Manager', nickname: 'Manager', positionId: POS_PM, positionName: 'Project Manager' }),
  row({ id: 'p', name: 'Peter S.', nickname: 'Peter', positionId: POS_DES, positionName: 'Designer' }),
  row({ id: 'c', name: 'Cindy C.', nickname: 'Cindy', active: false, deactivatedOn: '2026-09-30' }),
  row({ id: 'n', name: 'นิ่ม ใจดี', nickname: null }),
  row({ id: 'j', name: 'Jack J.', nickname: 'Jack', positionId: POS_DES, positionName: 'Designer' }),
]

const ids = (r: EmployeeRow[]) => r.map((x) => x.id)

describe('filterEmployees', () => {
  it('U-FILT-01 matches name and nickname, case-insensitively', () => {
    expect(ids(filterEmployees(rows, { ...DEFAULT_FILTER, q: 'pat' }))).toEqual(['p'])
    expect(ids(filterEmployees(rows, { ...DEFAULT_FILTER, q: 'MAN' }))).toEqual(['m'])
    expect(ids(filterEmployees(rows, { ...DEFAULT_FILTER, q: '  jack j ' }))).toEqual(['j'])
  })

  it('U-FILT-02 Thai names match after NFC normalisation on both sides', () => {
    const decomposedQuery = 'นิ'.normalize('NFD')
    expect(ids(filterEmployees(rows, { ...DEFAULT_FILTER, q: decomposedQuery }))).toEqual(['n'])
    expect(ids(filterEmployees(rows, { ...DEFAULT_FILTER, q: 'นิ' }))).toEqual(['n'])
  })

  it('U-FILT-03 positionId "none" keeps users without a position; an id keeps that position', () => {
    expect(ids(filterEmployees(rows, { ...DEFAULT_FILTER, positionId: 'none' }))).toEqual(['c', 'n'])
    expect(ids(filterEmployees(rows, { ...DEFAULT_FILTER, positionId: POS_DES }))).toEqual(['p', 'j'])
  })

  it('U-FILT-04 status filter; default is all', () => {
    expect(DEFAULT_FILTER.status).toBe('all')
    expect(ids(filterEmployees(rows, { ...DEFAULT_FILTER, status: 'deactivated' }))).toEqual(['c'])
    expect(filterEmployees(rows, { ...DEFAULT_FILTER, status: 'active' })).toHaveLength(4)
    expect(filterEmployees(rows, DEFAULT_FILTER)).toHaveLength(5)
  })

  it('U-FILT-05 sort puts inactive users last, then Thai collation on the display name', () => {
    const sorted = ids(sortEmployees(rows))
    expect(sorted.at(-1)).toBe('c')
    // Thai collation orders Thai script before Latin.
    expect(sorted.slice(0, 4)).toEqual(['n', 'j', 'm', 'p'])
  })
})
