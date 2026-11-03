import { describe, expect, it } from 'vitest'
import { addWeeks, daysOfWeek } from '@/domain/dates'
import { buildColumns } from './columns'
import { markerEdgeColumn, markerEdges, type GridMarkerView } from './markers'

const weeks = (from: string, n: number) => Array.from({ length: n }, (_, i) => addWeeks(from, i))
const cols = (from: string, n: number, expanded: string[] = [], days = new Map<string, string[]>()) =>
  buildColumns(weeks(from, n), new Set(expanded), days)

const view = (id: string, date: string): GridMarkerView => ({ id, date, color: 'RED', label: id })

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
