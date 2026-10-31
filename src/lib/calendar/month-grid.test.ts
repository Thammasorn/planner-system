import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { isoWeekday } from '@/domain/dates'
import {
  addMonths,
  dayOfMonth,
  entriesOnDay,
  inMonth,
  isYearMonth,
  monthGrid,
  monthTitle,
  moveFocus,
  orderRange,
  splitVisible,
  yearMonthOf,
} from './month-grid'

describe('isYearMonth', () => {
  it.each([
    ['2026-10', true],
    ['2026-01', true],
    ['2026-12', true],
    ['2026-13', false],
    ['2026-00', false],
    ['2026-1', false],
    ['26-10', false],
    ['2026-10-01', false],
    ['', false],
  ])('%s → %s', (s, ok) => {
    expect(isYearMonth(s)).toBe(ok)
  })
})

describe('yearMonthOf / inMonth / dayOfMonth', () => {
  it('yearMonthOf', () => {
    expect(yearMonthOf('2026-10-05')).toBe('2026-10')
  })
  it('inMonth', () => {
    expect(inMonth('2026-10-31', '2026-10')).toBe(true)
    expect(inMonth('2026-09-30', '2026-10')).toBe(false)
    expect(inMonth('2027-10-01', '2026-10')).toBe(false)
  })
  it('dayOfMonth', () => {
    expect(dayOfMonth('2026-10-05')).toBe(5)
    expect(dayOfMonth('2026-10-31')).toBe(31)
  })
})

describe('addMonths', () => {
  it.each([
    ['2026-12', 1, '2027-01'],
    ['2026-01', -1, '2025-12'],
    ['2026-10', 0, '2026-10'],
    ['2026-10', 14, '2027-12'],
    ['2026-10', -22, '2024-12'],
    ['2026-10', -10, '2025-12'],
  ])('%s %+d → %s', (ym, n, expected) => {
    expect(addMonths(ym, n)).toBe(expected)
  })
  it('rejects an invalid month or a non-integer offset', () => {
    expect(() => addMonths('2026-13', 1)).toThrow(RangeError)
    expect(() => addMonths('2026-10', 1.5)).toThrow(RangeError)
  })
  it('round-trips and stays a valid YearMonth (property)', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1000, max: 8999 }),
        fc.integer({ min: 1, max: 12 }),
        fc.integer({ min: -9000, max: 9000 }),
        (y, m, n) => {
          const ym = `${y}-${String(m).padStart(2, '0')}`
          const moved = addMonths(ym, n)
          return isYearMonth(moved) && addMonths(moved, -n) === ym
        },
      ),
    )
  })
})

describe('monthTitle', () => {
  it('Thai month name + B.E. year from th.calendar', () => {
    expect(monthTitle('2026-10')).toBe('ตุลาคม 2569')
    expect(monthTitle('2027-01')).toBe('มกราคม 2570')
    expect(monthTitle('2026-12')).toBe('ธันวาคม 2569')
  })
  it('rejects an invalid month', () => {
    expect(() => monthTitle('2026-13')).toThrow(RangeError)
  })
})

describe('monthGrid (M5-D8: 6 Monday-first weeks from weekStart(<month>-01))', () => {
  it('2026-09 → 2026-08-31 … 2026-10-12 (exclusive)', () => {
    const g = monthGrid('2026-09')
    expect(g.from).toBe('2026-08-31')
    expect(g.to).toBe('2026-10-12')
    expect(g.weeks).toHaveLength(6)
    for (const w of g.weeks) expect(w).toHaveLength(7)
    expect(g.weeks[0]![0]).toBe('2026-08-31')
    expect(g.weeks[0]![1]).toBe('2026-09-01')
    expect(g.weeks[5]![6]).toBe('2026-10-11')
  })
  it('2026-10 → 2026-09-28 … 2026-11-09', () => {
    const g = monthGrid('2026-10')
    expect(g.from).toBe('2026-09-28')
    expect(g.to).toBe('2026-11-09')
  })
  it('2027-02 starts on its 1st (a Monday)', () => {
    expect(monthGrid('2027-02').from).toBe('2027-02-01')
    expect(monthGrid('2027-02').to).toBe('2027-03-15')
  })
  it('rejects an invalid month', () => {
    expect(() => monthGrid('2026-00')).toThrow(RangeError)
  })
  it('property: every grid starts on a Monday, covers the whole month, consecutive days', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1900, max: 2200 }), fc.integer({ min: 1, max: 12 }), (y, m) => {
        const ym = `${y}-${String(m).padStart(2, '0')}`
        const g = monthGrid(ym)
        const flat = g.weeks.flat()
        const inside = flat.filter((d) => inMonth(d, ym))
        return (
          isoWeekday(g.from) === 1 &&
          flat[0] === g.from &&
          flat.length === 42 &&
          inside[0] === `${ym}-01` &&
          inside.length >= 28 &&
          inside.every((d, i) => d === `${ym}-${String(i + 1).padStart(2, '0')}`) &&
          flat.every((d, i) => i === 0 || d > flat[i - 1]!)
        )
      }),
    )
  })
})

describe('orderRange', () => {
  it('orders two days', () => {
    expect(orderRange('2026-10-06', '2026-10-05')).toEqual({ startDate: '2026-10-05', endDate: '2026-10-06' })
    expect(orderRange('2026-10-05', '2026-10-06')).toEqual({ startDate: '2026-10-05', endDate: '2026-10-06' })
    expect(orderRange('2026-10-05', '2026-10-05')).toEqual({ startDate: '2026-10-05', endDate: '2026-10-05' })
  })
})

describe('moveFocus', () => {
  it.each([
    ['ArrowLeft', '2026-10-04'],
    ['ArrowRight', '2026-10-06'],
    ['ArrowUp', '2026-09-28'],
    ['ArrowDown', '2026-10-12'],
  ] as const)('%s from 2026-10-05 → %s', (code, expected) => {
    expect(moveFocus('2026-10-05', code)).toBe(expected)
  })
  it('crosses a year boundary', () => {
    expect(moveFocus('2026-12-31', 'ArrowRight')).toBe('2027-01-01')
  })
})

describe('entriesOnDay', () => {
  const entries = [
    { id: 'a', startDate: '2026-10-05', endDate: '2026-10-06' },
    { id: 'b', startDate: '2026-10-06', endDate: '2026-10-06' },
    { id: 'c', startDate: '2026-10-07', endDate: '2026-10-09' },
  ]
  it('includes both boundaries and keeps the order', () => {
    expect(entriesOnDay(entries, '2026-10-05').map((e) => e.id)).toEqual(['a'])
    expect(entriesOnDay(entries, '2026-10-06').map((e) => e.id)).toEqual(['a', 'b'])
    expect(entriesOnDay(entries, '2026-10-09').map((e) => e.id)).toEqual(['c'])
    expect(entriesOnDay(entries, '2026-10-10')).toEqual([])
  })
})

describe('splitVisible', () => {
  it('more than max → first max + count', () => {
    expect(splitVisible([1, 2, 3, 4, 5])).toEqual({ shown: [1, 2, 3], more: 2 })
  })
  it('up to max → all, more 0', () => {
    expect(splitVisible([1, 2, 3])).toEqual({ shown: [1, 2, 3], more: 0 })
    expect(splitVisible([])).toEqual({ shown: [], more: 0 })
  })
  it('custom max', () => {
    expect(splitVisible(['a', 'b', 'c'], 1)).toEqual({ shown: ['a'], more: 2 })
  })
})
