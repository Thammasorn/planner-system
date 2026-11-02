import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { addWeeks } from '@/domain/dates'
import { buildColumns, DAY_W, WEEK_TOTAL_W, WEEK_W, type GridColumn } from './columns'
import {
  linePath,
  niceScale,
  periodSlots,
  slotAt,
  slotCenter,
  slotRight,
  slotWeeks,
  valueSlotOf,
  valueSlots,
  yOf,
  type RenderedColumn,
} from './chart-geometry'

const weeks = (from: string, n: number) => Array.from({ length: n }, (_, i) => addWeeks(from, i))
/** What TanStack's column virtualizer renders: start = paddingStart (frozen width) + the column's offset. */
const rendered = (
  cols: readonly GridColumn[],
  first: number,
  last: number,
  frozen: number,
): RenderedColumn[] =>
  cols.slice(first, last + 1).map((c, k) => ({ index: first + k, start: frozen + c.offset, size: c.width }))

describe('periodSlots — the grid header geometry (owner feedback 2026-11-02)', () => {
  const cols = buildColumns(weeks('2026-09-14', 10), new Set(['2026-09-28']), new Map())

  it('keeps the virtualizer x of every rendered column: frozen width + offset, the column width', () => {
    const slots = periodSlots(cols, rendered(cols, 1, 9, 352))
    expect(slots.map((s) => s.key)).toEqual(cols.slice(1, 10).map((c) => c.key))
    expect(slots[0]).toMatchObject({ key: 'W:2026-09-21', left: 352 + WEEK_W, width: WEEK_W })
    const total = slots.find((s) => s.role === 'weekTotal')!
    expect(total).toMatchObject({
      key: 'W:2026-09-28',
      left: 352 + 2 * WEEK_W + 5 * DAY_W,
      width: WEEK_TOTAL_W,
    })
  })

  it('follows the frozen width (resized task column, hidden assignee column, phones)', () => {
    for (const frozen of [240, 352, 472, 192]) {
      const s = periodSlots(cols, rendered(cols, 0, 3, frozen))
      expect(s[0]!.left).toBe(frozen)
      expect(slotCenter(s[1]!)).toBe(frozen + WEEK_W + WEEK_W / 2)
    }
  })

  it('columns abut: each right edge is the next left edge (gridlines = the grid column edges)', () => {
    const s = periodSlots(cols, rendered(cols, 0, cols.length - 1, 352))
    for (let i = 1; i < s.length; i++) expect(s[i]!.left).toBe(slotRight(s[i - 1]!))
  })

  it('weeks = the weeks whose value column is rendered (collapsed week, or the รวม of an expanded week)', () => {
    const all = periodSlots(cols, rendered(cols, 0, cols.length - 1, 352))
    expect(slotWeeks(all)).toEqual(weeks('2026-09-14', 10))
    expect(valueSlots(all).find((s) => s.weekStart === '2026-09-28')!.role).toBe('weekTotal')
    // the window ends inside the expanded week: its days are columns, the week has no value column → no point
    const lastDay = cols.findIndex((c) => c.key === 'D:2026-10-01')
    expect(slotWeeks(periodSlots(cols, rendered(cols, 0, lastDay, 352)))).toEqual(weeks('2026-09-14', 2))
  })

  it('no extra and no missing weeks: property over random windows and expansions', () => {
    fc.assert(
      fc.property(
        fc.uniqueArray(fc.integer({ min: 0, max: 11 }), { maxLength: 6 }),
        fc.integer({ min: 0, max: 60 }),
        fc.integer({ min: 0, max: 60 }),
        fc.integer({ min: 120, max: 752 }),
        (exp, a, b, frozen) => {
          const ws = weeks('2026-08-31', 12)
          const cs = buildColumns(ws, new Set(exp.map((i) => ws[i]!)), new Map())
          const first = Math.min(a, b) % cs.length
          const last = Math.min(cs.length - 1, Math.max(a, b))
          const s = periodSlots(cs, rendered(cs, first, last, frozen))
          const expected = cs
            .slice(first, last + 1)
            .filter((c) => c.role !== 'day')
            .map((c) => c.weekStart)
          expect(slotWeeks(s)).toEqual(expected)
          for (const v of valueSlots(s))
            expect(slotCenter(v)).toBe(frozen + cs[v.index]!.offset + cs[v.index]!.width / 2)
        },
      ),
    )
  })
})

describe('slotAt / valueSlotOf (tooltip column under the pointer)', () => {
  const cols = buildColumns(weeks('2026-09-14', 4), new Set(['2026-09-21']), new Map())
  const slots = periodSlots(cols, rendered(cols, 0, cols.length - 1, 300))

  it('finds the column by x (left edge inclusive, right edge exclusive); outside → null', () => {
    expect(slotAt(slots, 299)).toBeNull()
    expect(slotAt(slots, 300)!.key).toBe('W:2026-09-14')
    expect(slotAt(slots, 300 + WEEK_W - 0.5)!.key).toBe('W:2026-09-14')
    expect(slotAt(slots, 300 + WEEK_W)!.key).toBe('D:2026-09-21')
    expect(slotAt(slots, 10_000)).toBeNull()
  })

  it('a day column → its week’s รวม column; a value column → itself', () => {
    const day = slots.find((s) => s.key === 'D:2026-09-23')!
    expect(valueSlotOf(slots, day)).toMatchObject({ key: 'W:2026-09-21', role: 'weekTotal' })
    expect(valueSlotOf(slots, slots[0]!)).toBe(slots[0])
    expect(valueSlotOf(slots.slice(0, 4), day)).toBeNull()
  })
})

describe('niceScale / yOf / linePath', () => {
  it('nice maxima and ticks from 0', () => {
    expect(niceScale(5)).toEqual({ max: 6, ticks: [0, 2, 4, 6] })
    expect(niceScale(6)).toEqual({ max: 6, ticks: [0, 2, 4, 6] })
    expect(niceScale(1.3)).toEqual({ max: 1.5, ticks: [0, 0.5, 1, 1.5] })
    expect(niceScale(0)).toEqual({ max: 1, ticks: [0, 0.25, 0.5, 0.75, 1] })
    expect(niceScale(15)).toEqual({ max: 15, ticks: [0, 5, 10, 15] })
  })

  it('property: max ≥ value, ≤ 8 ticks, evenly spaced from 0', () => {
    fc.assert(
      fc.property(fc.double({ min: 0.01, max: 500, noNaN: true }), (v) => {
        const s = niceScale(v)
        expect(s.max).toBeGreaterThanOrEqual(v - 1e-9)
        expect(s.ticks[0]).toBe(0)
        expect(s.ticks.length).toBeLessThanOrEqual(8)
      }),
    )
  })

  it('y: 0 at the bottom, max at the top', () => {
    expect(yOf(0, 6, 10, 200)).toBe(210)
    expect(yOf(6, 6, 10, 200)).toBe(10)
    expect(yOf(3, 6, 10, 200)).toBe(110)
  })

  it('a null value breaks the line (a gap, never 0)', () => {
    expect(
      linePath([
        { x: 10, y: 5 },
        { x: 20, y: 6 },
        { x: 30, y: null },
        { x: 40, y: 7 },
        { x: 50, y: 8 },
      ]),
    ).toBe('M10 5L20 6M40 7L50 8')
    expect(linePath([])).toBe('')
  })
})
