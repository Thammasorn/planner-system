import { describe, expect, it } from 'vitest'
import { addWeeks, daysOfWeek } from '@/domain/dates'
import type { GridMarkerView, PlanMarkerDTO } from '@/lib/contracts/plan-markers'
import { buildColumns } from './columns'
import {
  defaultMarkerDate,
  defaultToolbarMarkerDate,
  markerEdgeColumn,
  markerEdges,
  toMarkerViews,
} from './markers'

const weeks = (from: string, n: number) => Array.from({ length: n }, (_, i) => addWeeks(from, i))
const cols = (from: string, n: number, expanded: string[] = [], days = new Map<string, string[]>()) =>
  buildColumns(weeks(from, n), new Set(expanded), days)

const dto = (id: string, date: string, o: Partial<PlanMarkerDTO> = {}): PlanMarkerDTO => ({
  id,
  projectId: 'p',
  date,
  color: 'RED',
  label: null,
  createdBy: 'u',
  updatedAt: '2026-10-01T00:00:00Z',
  ...o,
})
const view = (id: string, date: string): GridMarkerView => ({
  id,
  source: 'PLAN',
  date,
  tone: 'RED',
  label: null,
  editable: true,
})

describe('toMarkerViews (M7.1-D12)', () => {
  it('maps DTOs to PLAN views in input order with canEdit', () => {
    expect(
      toMarkerViews([dto('a', '2026-10-23', { label: 'UAT sign-off' }), dto('b', '2026-11-06', { color: 'GREEN' })], true),
    ).toEqual([
      { id: 'a', source: 'PLAN', date: '2026-10-23', tone: 'RED', label: 'UAT sign-off', editable: true },
      { id: 'b', source: 'PLAN', date: '2026-11-06', tone: 'GREEN', label: null, editable: true },
    ])
    expect(toMarkerViews([dto('a', '2026-10-23', { color: 'YELLOW' })], false)[0]).toMatchObject({
      tone: 'YELLOW',
      editable: false,
    })
  })
})

describe('markerEdgeColumn (BR-102)', () => {
  it('collapsed week 2026-10-19 + date 2026-10-23 → that week column', () => {
    const cs = cols('2026-10-05', 4)
    expect(cs[markerEdgeColumn('2026-10-23', cs)!]!.key).toBe('W:2026-10-19')
  })
  it('expanded → the Fri 23 day column', () => {
    const cs = cols('2026-10-05', 4, ['2026-10-19'])
    expect(cs[markerEdgeColumn('2026-10-23', cs)!]!.key).toBe('D:2026-10-23')
  })
  it('Sun 2026-10-25 with Mon–Fri shown → the Fri column, never รวม', () => {
    const cs = cols('2026-10-05', 4, ['2026-10-19'])
    const i = markerEdgeColumn('2026-10-25', cs)!
    expect(cs[i]!.key).toBe('D:2026-10-23')
    expect(cs[i]!.role).toBe('day')
  })
  it('a day before every shown day of its week → the first day column', () => {
    const cs = cols('2026-10-19', 1, ['2026-10-19'], new Map([['2026-10-19', ['2026-10-21', '2026-10-22']]]))
    expect(cs[markerEdgeColumn('2026-10-19', cs)!]!.key).toBe('D:2026-10-21')
    expect(cs[markerEdgeColumn('2026-10-24', cs)!]!.key).toBe('D:2026-10-22')
  })
  it('week outside cols → null', () => {
    const cs = cols('2026-10-05', 2)
    expect(markerEdgeColumn('2026-11-30', cs)).toBeNull()
    expect(markerEdgeColumn('2026-09-01', cs)).toBeNull()
    expect(markerEdgeColumn('2026-10-05', [])).toBeNull()
  })
  it('year boundary: 2027-01-01 (Fri) → week 2026-12-28', () => {
    const cs = cols('2026-12-21', 3)
    expect(cs[markerEdgeColumn('2027-01-01', cs)!]!.key).toBe('W:2026-12-28')
    const ex = cols('2026-12-21', 3, ['2026-12-28'], new Map([['2026-12-28', daysOfWeek('2026-12-28').slice(0, 5)]]))
    expect(ex[markerEdgeColumn('2027-01-01', ex)!]!.key).toBe('D:2027-01-01')
  })
})

describe('markerEdges (BR-102 stacking)', () => {
  it('right edges sorted by column; two markers on one edge stack by (date, created order)', () => {
    const cs = cols('2026-10-05', 4)
    const edges = markerEdges(
      [view('late', '2026-10-23'), view('next', '2026-10-30'), view('early', '2026-10-19'), view('late2', '2026-10-23')],
      cs,
    )
    expect(edges.map((e) => [e.colIndex, e.x, e.views.map((v) => v.id)])).toEqual([
      [2, 3 * 64, ['early', 'late', 'late2']],
      [3, 4 * 64, ['next']],
    ])
  })
  it('markers outside cols are dropped', () => {
    expect(markerEdges([view('x', '2025-01-01')], cols('2026-10-05', 2))).toEqual([])
  })
  it('x = right edge of a day column in day zoom', () => {
    const cs = cols('2026-10-19', 1, ['2026-10-19'])
    const [e] = markerEdges([view('a', '2026-10-23')], cs)
    expect(e!.x).toBe(5 * 44)
  })
})

describe('defaultMarkerDate (M7.1-D11)', () => {
  it('week header → Friday; day header → that day; รวม → Friday', () => {
    const cs = cols('2026-10-19', 2, ['2026-10-26'])
    expect(defaultMarkerDate(cs[0]!)).toBe('2026-10-23')
    expect(defaultMarkerDate(cs.find((c) => c.date === '2026-10-28')!)).toBe('2026-10-28')
    expect(defaultMarkerDate(cs[cs.length - 1]!)).toBe('2026-10-30')
  })
  it('toolbar → Friday of the week of today', () => {
    expect(defaultToolbarMarkerDate('2026-09-30')).toBe('2026-10-02')
    expect(defaultToolbarMarkerDate('2026-10-04')).toBe('2026-10-02')
  })
})
