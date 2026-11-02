// X30 / MASK-7 skeleton: pure helpers (no DB rows needed); runs in the integration project with src/server/**.
import { describe, expect, it } from 'vitest'
import { th } from '@/i18n/th'
import {
  isVisible,
  maskCellItems,
  maskedGridRow,
  maskHidden,
  maskProjectParts,
  maskTimeOff,
  namedProjectParts,
  partitionByProject,
  type TimeOffWithType,
} from './masking'

const rows = [
  { projectId: 'p', v: 1 },
  { projectId: 'q', v: 2 },
  { projectId: 'q', v: 3 },
]
const sum = (h: readonly { v: number }[]) => h.reduce((s, r) => s + r.v, 0)

describe('masking skeleton (SPEC §3.3, X30)', () => {
  it('isVisible: ALL sees everything, a set sees its members', () => {
    expect(isVisible('ALL', 'x')).toBe(true)
    expect(isVisible(new Set(['p']), 'p')).toBe(true)
    expect(isVisible(new Set(['p']), 'q')).toBe(false)
  })

  it('partitionByProject splits rows by visibility, keeping order', () => {
    expect(partitionByProject(rows, new Set(['p']))).toEqual({
      visible: [rows[0]],
      hidden: [rows[1], rows[2]],
    })
    expect(partitionByProject(rows, 'ALL')).toEqual({ visible: rows, hidden: [] })
  })

  it('maskHidden folds hidden rows into one aggregate without ids or names', () => {
    const out = maskHidden(rows, new Set(['p']), sum)
    expect(out.visible).toEqual([rows[0]])
    expect(out.masked).toEqual({ kind: 'masked', label: th.masking.otherProjects, value: 5 })
    expect(JSON.stringify(out.masked)).not.toContain('q')
  })

  it('maskHidden returns masked = null when nothing is hidden', () => {
    expect(maskHidden(rows, 'ALL', sum)).toEqual({ visible: rows, masked: null })
    expect(maskHidden(rows, new Set(['p', 'q']), sum).masked).toBeNull()
  })
})

describe('maskTimeOff (SPEC §3.3, MASK-5, M5-D7)', () => {
  const row: TimeOffWithType = {
    id: 'X-entry-7f3a',
    userId: 'u-owner',
    startDate: '2026-11-09',
    endDate: '2026-11-10',
    half: null,
    note: 'โน้ตลับ-01',
    leaveTypeId: 'lt-secret-91c2',
    leaveTypeName: 'ลาพักร้อน',
    leaveTypeColor: '#0369A1',
    leaveTypeArchived: false,
  }

  it('hidden details keep only who / when / half and the Thai label', () => {
    const out = maskTimeOff({ ...row, half: 'PM', startDate: '2026-11-16', endDate: '2026-11-16' }, false)
    expect(Object.keys(out).sort()).toEqual(['endDate', 'half', 'kind', 'label', 'startDate', 'userId'])
    expect(out).toEqual({
      kind: 'masked',
      userId: 'u-owner',
      startDate: '2026-11-16',
      endDate: '2026-11-16',
      half: 'PM',
      label: th.masking.leave,
    })
    const json = JSON.stringify(out)
    for (const secret of ['โน้ตลับ-01', 'ลาพักร้อน', '#0369A1', 'X-entry-7f3a', 'lt-secret-91c2'])
      expect(json).not.toContain(secret)
  })

  it('visible details → kind full with the note, type and colour', () => {
    expect(maskTimeOff(row, true)).toEqual({ kind: 'full', ...row })
  })
})

describe('M9 masking completion (M9-D8, SPEC §7.4, FR-1005, FR-906)', () => {
  const parts = new Map([
    ['P', { total: 100, committed: 100 }],
    ['Q', { total: 300, committed: 300 }],
    ['Z', { total: 0, committed: 0 }],
  ])
  const names = new Map([
    ['P', 'Project P'],
    ['Q', 'Secret Q'],
  ])

  it('maskProjectParts: visible parts + one null part; no Q anywhere; ALL → no null part; zero parts dropped', () => {
    const out = maskProjectParts(parts, new Set(['P']), names)
    expect(out).toEqual([
      { projectId: 'P', total: 100, committed: 100 },
      { projectId: null, total: 300, committed: 300 },
    ])
    expect(JSON.stringify(out)).not.toContain('Q')
    expect(maskProjectParts(parts, 'ALL', names)).toEqual([
      { projectId: 'P', total: 100, committed: 100 },
      { projectId: 'Q', total: 300, committed: 300 },
    ])
    expect(maskProjectParts(new Map(), new Set(['P']), names)).toEqual([])
  })

  it('visible parts are sorted by compareThai(name)', () => {
    const n = new Map([
      ['a', 'ข'],
      ['b', 'ก'],
    ])
    const p = new Map([
      ['a', { total: 1, committed: 0 }],
      ['b', { total: 2, committed: 0 }],
    ])
    expect(maskProjectParts(p, 'ALL', n).map((x) => x.projectId)).toEqual(['b', 'a'])
  })

  it('namedProjectParts names the hidden part th.masking.otherProjects', () => {
    expect(namedProjectParts(parts, new Set(['P']), names)).toEqual([
      { projectId: 'P', name: 'Project P', load: { total: 100, committed: 100 } },
      { projectId: null, name: th.masking.otherProjects, load: { total: 300, committed: 300 } },
    ])
  })

  it('maskedGridRow: zero keys dropped; all zero → null', () => {
    expect(maskedGridRow('u', { 'W:2026-10-05': { total: 0, committed: 0 } })).toBeNull()
    expect(
      maskedGridRow('u', { 'W:2026-10-05': { total: 0, committed: 0 }, 'W:2026-10-12': { total: 50, committed: 0 } }),
    ).toEqual({
      kind: 'masked',
      userId: 'u',
      label: th.masking.otherProjects,
      totals: { 'W:2026-10-12': { total: 50, committed: 0 } },
    })
  })

  it('maskCellItems: one masked item without id/count when hidden ≠ 0', () => {
    expect(maskCellItems([], { total: 0, committed: 0 })).toEqual([])
    expect(maskCellItems([], { total: 300, committed: 300 })).toEqual([
      { kind: 'masked', label: th.masking.otherProjects, load: { total: 300, committed: 300 } },
    ])
  })
})
