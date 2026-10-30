import fc from 'fast-check'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  addDays,
  addWeeks,
  compareISO,
  daysOfWeek,
  diffDays,
  eachDay,
  fromEpochDay,
  isISODate,
  isoWeekday,
  maxISO,
  minISO,
  toEpochDay,
  todayBangkok,
  weekRange,
  weekStart,
} from './dates'

afterEach(() => {
  vi.useRealTimers()
})

/** Oracle for the property tests: JS Date in UTC (allowed in test files only). */
function oracleAddDays(d: string, n: number): string {
  const [y, m, day] = d.split('-').map(Number) as [number, number, number]
  return new Date(Date.UTC(y, m - 1, day + n)).toISOString().slice(0, 10)
}
function oracleWeekday(d: string): number {
  const [y, m, day] = d.split('-').map(Number) as [number, number, number]
  const js = new Date(Date.UTC(y, m - 1, day)).getUTCDay() // 0 = Sunday
  return js === 0 ? 7 : js
}

describe('weekStart (BR-05)', () => {
  it.each(['2026-09-28', '2026-09-29', '2026-09-30', '2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04'])(
    'U-DATE-01 weekStart every weekday: %s → 2026-09-28',
    (d) => {
      expect(weekStart(d)).toBe('2026-09-28')
    },
  )

  it('U-DATE-01 weekStart every weekday: the next Monday starts a new week', () => {
    expect(weekStart('2026-10-05')).toBe('2026-10-05')
  })

  it('U-DATE-02 year boundary (§11.1)', () => {
    expect(weekStart('2027-01-01')).toBe('2026-12-28')
    expect(weekStart('2027-01-03')).toBe('2026-12-28')
    expect(addDays('2026-12-28', 7)).toBe('2027-01-04')
    expect(weekStart('2027-01-04')).toBe('2027-01-04')
  })
})

describe('todayBangkok (BR-06)', () => {
  it('U-DATE-03 todayBangkok 23:30 UTC (§11.1)', () => {
    vi.useFakeTimers()
    vi.setSystemTime('2026-09-29T23:30:00Z')
    expect(todayBangkok()).toBe('2026-09-30')
  })

  it.each([
    ['2026-09-30T16:59:59Z', '2026-09-30'],
    ['2026-09-30T17:00:00Z', '2026-10-01'],
    ['2026-12-31T17:00:00Z', '2027-01-01'],
  ])('U-DATE-04 todayBangkok edges: %s → %s', (instant, expected) => {
    expect(todayBangkok(new Date(instant))).toBe(expected)
  })

  it('U-DATE-04 todayBangkok returns a valid ISODate for the real clock', () => {
    expect(isISODate(todayBangkok())).toBe(true)
  })
})

describe('isoWeekday', () => {
  it.each([
    ['2026-09-28', 1],
    ['2026-09-30', 3],
    ['2026-10-04', 7],
    ['2027-01-01', 5],
  ] as const)('U-DATE-05 isoWeekday %s → %i', (d, expected) => {
    expect(isoWeekday(d)).toBe(expected)
  })
})

describe('isISODate', () => {
  it.each(['2026-09-30', '2028-02-29', '2000-02-29', '0000-01-01', '9999-12-31'])(
    'U-DATE-06 isISODate accepts %s',
    (s) => {
      expect(isISODate(s)).toBe(true)
    },
  )

  it.each([
    '2026-02-30',
    '2026-9-30',
    '2100-02-29',
    '2026-13-01',
    '2026-00-10',
    '2026-04-31',
    '2026-04-00',
    '',
    '2026-09-30T00:00',
    ' 2026-09-30',
    '２０２６-09-30',
  ])('U-DATE-06 isISODate rejects %j', (s) => {
    expect(isISODate(s)).toBe(false)
  })
})

describe('addDays / addWeeks / diffDays', () => {
  it.each([
    ['2028-02-28', 1, '2028-02-29'],
    ['2026-02-28', 1, '2026-03-01'],
    ['2026-03-01', -1, '2026-02-28'],
    ['2026-09-30', 0, '2026-09-30'],
  ] as const)('U-DATE-07 addDays / leap: addDays(%s, %i) = %s', (d, n, expected) => {
    expect(addDays(d, n)).toBe(expected)
  })

  it('U-DATE-08 addWeeks / diffDays', () => {
    expect(addWeeks('2026-09-28', 2)).toBe('2026-10-12')
    expect(addWeeks('2026-10-12', -2)).toBe('2026-09-28')
    expect(diffDays('2026-09-28', '2026-10-05')).toBe(7)
    expect(diffDays('2026-10-05', '2026-09-28')).toBe(-7)
    expect(diffDays('2026-09-30', '2026-09-30')).toBe(0)
  })

  it('U-DATE-08 addDays rejects a non-integer offset', () => {
    expect(() => addDays('2026-09-30', 1.5)).toThrow(RangeError)
  })
})

describe('daysOfWeek / weekRange / eachDay', () => {
  it('U-DATE-09 daysOfWeek', () => {
    expect(daysOfWeek('2026-12-28')).toEqual([
      '2026-12-28',
      '2026-12-29',
      '2026-12-30',
      '2026-12-31',
      '2027-01-01',
      '2027-01-02',
      '2027-01-03',
    ])
    const mid = daysOfWeek('2026-09-30')
    expect(mid[0]).toBe('2026-09-28')
    expect(mid).toHaveLength(7)
    expect(mid[6]).toBe('2026-10-04')
  })

  it.each([
    ['2026-09-28', '2026-10-19', ['2026-09-28', '2026-10-05', '2026-10-12']],
    ['2026-09-30', '2026-10-19', ['2026-10-05', '2026-10-12']],
    ['2026-10-19', '2026-10-19', []],
    ['2026-12-21', '2027-01-11', ['2026-12-21', '2026-12-28', '2027-01-04']],
    ['2026-10-19', '2026-10-05', []],
    ['2026-09-28', '2026-09-29', ['2026-09-28']],
  ] as const)('U-DATE-10 weekRange (M1-D18): [%s, %s)', (from, to, expected) => {
    expect(weekRange(from, to)).toEqual(expected)
  })

  it('U-DATE-11 eachDay', () => {
    expect(eachDay('2026-12-30', '2027-01-02')).toEqual([
      '2026-12-30',
      '2026-12-31',
      '2027-01-01',
      '2027-01-02',
    ])
    expect(eachDay('2026-09-30', '2026-09-30')).toEqual(['2026-09-30'])
    expect(eachDay('2026-10-02', '2026-10-01')).toEqual([])
  })
})

describe('compareISO / minISO / maxISO', () => {
  it('U-DATE-12 compare/min/max', () => {
    expect(compareISO('2026-09-30', '2026-10-01')).toBe(-1)
    expect(compareISO('2026-10-01', '2026-09-30')).toBe(1)
    expect(compareISO('2026-09-30', '2026-09-30')).toBe(0)
    expect(minISO('2026-09-30', '2026-10-01')).toBe('2026-09-30')
    expect(minISO('2026-10-01', '2026-09-30')).toBe('2026-09-30')
    expect(maxISO('2026-09-30', '2026-10-01')).toBe('2026-10-01')
    expect(maxISO('2026-10-01', '2026-09-30')).toBe('2026-10-01')
  })

  it('U-DATE-12 compareISO validates its input', () => {
    expect(() => compareISO('2026-02-30', '2026-03-01')).toThrow(RangeError)
  })
})

describe('epoch days', () => {
  it('U-DATE-13 epoch days', () => {
    expect(toEpochDay('1970-01-01')).toBe(0)
    expect(toEpochDay('1969-12-31')).toBe(-1)
    expect(toEpochDay('2026-09-30')).toBe(20726)
    expect(fromEpochDay(20726)).toBe('2026-09-30')
    expect(fromEpochDay(0)).toBe('1970-01-01')
    expect(fromEpochDay(toEpochDay('0000-01-01'))).toBe('0000-01-01')
    expect(fromEpochDay(toEpochDay('9999-12-31'))).toBe('9999-12-31')
  })

  it('U-DATE-13 epoch days: toEpochDay(fromEpochDay(n)) === n for n ∈ [-200000, 200000]', () => {
    fc.assert(
      fc.property(fc.integer({ min: -200_000, max: 200_000 }), (n) => {
        const d = fromEpochDay(n)
        expect(isISODate(d)).toBe(true)
        expect(toEpochDay(d)).toBe(n)
      }),
    )
  })

  it('U-DATE-13 fromEpochDay rejects non-integers and out-of-range years', () => {
    expect(() => fromEpochDay(0.5)).toThrow(RangeError)
    expect(() => fromEpochDay(toEpochDay('0000-01-01') - 1)).toThrow(RangeError)
    expect(() => fromEpochDay(toEpochDay('9999-12-31') + 1)).toThrow(RangeError)
  })
})

describe('properties', () => {
  it('U-DATE-14 properties: weekStart is a Monday ≤ d within 6 days; addDays composes; matches a Date.UTC oracle', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 36_500 }),
        fc.integer({ min: -400, max: 400 }),
        fc.integer({ min: -400, max: 400 }),
        (n, a, b) => {
          const d = addDays('2000-01-01', n)
          expect(d).toBe(oracleAddDays('2000-01-01', n))
          expect(isoWeekday(d)).toBe(oracleWeekday(d))
          const ws = weekStart(d)
          expect(isoWeekday(ws)).toBe(1)
          const gap = diffDays(ws, d)
          expect(gap).toBeGreaterThanOrEqual(0)
          expect(gap).toBeLessThanOrEqual(6)
          expect(addDays(addDays(d, a), b)).toBe(addDays(d, a + b))
          expect(diffDays(d, addDays(d, a))).toBe(a)
          expect(compareISO(d, addDays(d, a))).toBe(Math.sign(a) === 0 ? 0 : -Math.sign(a))
        },
      ),
      { numRuns: 500 },
    )
  })

  it('U-DATE-14 properties: weekRange yields consecutive Mondays inside [from, to)', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 3650 }), fc.integer({ min: 0, max: 120 }), (n, len) => {
        const from = addDays('2020-01-01', n)
        const to = addDays(from, len)
        const weeks = weekRange(from, to)
        for (const [i, m] of weeks.entries()) {
          expect(isoWeekday(m)).toBe(1)
          expect(compareISO(from, m)).toBeLessThanOrEqual(0)
          expect(compareISO(m, to)).toBe(-1)
          if (i > 0) expect(diffDays(weeks[i - 1]!, m)).toBe(7)
        }
        // no Monday in range is missed
        const mondays = eachDay(from, addDays(to, -1)).filter((d) => isoWeekday(d) === 1)
        expect(weeks).toEqual(mondays)
      }),
      { numRuns: 300 },
    )
  })
})

describe('invalid input', () => {
  it('U-DATE-15 invalid input throws RangeError', () => {
    expect(() => addDays('2026-02-30', 1)).toThrow(RangeError)
    expect(() => weekStart('x')).toThrow(RangeError)
    expect(() => toEpochDay('2026-9-30')).toThrow(RangeError)
    expect(() => isoWeekday('')).toThrow(RangeError)
    expect(() => daysOfWeek('2026-13-01')).toThrow(RangeError)
    expect(() => weekRange('2026-09-28', 'nope')).toThrow(RangeError)
    expect(() => eachDay('nope', '2026-09-28')).toThrow(RangeError)
  })
})
