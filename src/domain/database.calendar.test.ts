// BR-97 calendar month grid (plan/m11 S1.10, FR-1440…1445 › unit `database.calendar.test.ts`).
// The header text "พฤศจิกายน 2569" is UI formatting (`formatThaiMonthYear`, src/lib/format.ts); the grid it heads is here.
import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { calendarMonth, type CalendarMonth } from './database'
import { addDays, isoWeekday } from './dates'
import { ctx, col, row } from './database/fixtures.test.helper'
import type { DbRowModel } from './types'

const title = col('TITLE', { position: 'a5' })
const date = col('DATE', { position: 'a1' })
const sel = col('SELECT', { position: 'a2' })
const num = col('NUMBER', { position: 'a3' })
const cols = [title, date, sel, num]

const days = <R extends DbRowModel>(m: CalendarMonth<R>) => m.weeks.flat()
const dayOf = <R extends DbRowModel>(m: CalendarMonth<R>, d: string) => days(m).find((x) => x.date === d)!
const ids = (rs: readonly DbRowModel[]) => rs.map((r) => r.id)
const pad = (n: number) => String(n).padStart(2, '0')
const daysInMonth = (y: number, m: number) =>
  m === 2 ? (y % 4 === 0 && (y % 100 !== 0 || y % 400 === 0) ? 29 : 28) : [4, 6, 9, 11].includes(m) ? 30 : 31

describe('calendarMonth › month grid, Monday first (BR-97, FR-1440)', () => {
  it('พฤศจิกายน 2569 (Nov 2026, the 1st is a Sunday) → Mon 2026-10-26 … Sun 2026-12-06, 6 weeks', () => {
    const out = calendarMonth({ year: 2026, month: 11 }, [], date.id, [], cols, ctx)
    expect(out.weeks).toHaveLength(6)
    expect(out.weeks[0]![0]).toEqual({ date: '2026-10-26', inMonth: false, rows: [] })
    expect(out.weeks[0]![5]).toMatchObject({ date: '2026-10-31', inMonth: false })
    expect(out.weeks[0]![6]).toMatchObject({ date: '2026-11-01', inMonth: true })
    expect(out.weeks[1]![0]).toMatchObject({ date: '2026-11-02', inMonth: true }) // today in the fixtures
    expect(out.weeks[5]![0]).toMatchObject({ date: '2026-11-30', inMonth: true })
    expect(out.weeks[5]![1]).toMatchObject({ date: '2026-12-01', inMonth: false })
    expect(out.weeks[5]![6]).toMatchObject({ date: '2026-12-06', inMonth: false })
    expect(days(out).filter((d) => d.inMonth)).toHaveLength(30)
    expect(out.noDate).toEqual([])
  })
  it('every week is Mon … Sun (column 0 Monday, column 5–6 the weekend)', () => {
    const out = calendarMonth({ year: 2026, month: 11 }, [], date.id, [], cols, ctx)
    for (const w of out.weeks) {
      expect(w.map((d) => isoWeekday(d.date))).toEqual([1, 2, 3, 4, 5, 6, 7])
    }
  })
  it('Feb 2027 is exactly 4 weeks (Mon 1 … Sun 28), all in month', () => {
    const out = calendarMonth({ year: 2027, month: 2 }, [], date.id, [], cols, ctx)
    expect(out.weeks).toHaveLength(4)
    expect(out.weeks[0]![0]!.date).toBe('2027-02-01')
    expect(out.weeks[3]![6]!.date).toBe('2027-02-28')
    expect(days(out).every((d) => d.inMonth)).toBe(true)
  })
  it('Feb 2026 is 5 weeks (2026-01-26 … 2026-03-01)', () => {
    const out = calendarMonth({ year: 2026, month: 2 }, [], date.id, [], cols, ctx)
    expect(out.weeks).toHaveLength(5)
    expect(out.weeks[0]![0]!.date).toBe('2026-01-26')
    expect(out.weeks[4]![6]!.date).toBe('2026-03-01')
  })
  it('leap Feb 2028 includes the 29th (2028-01-31 … 2028-03-05, 5 weeks)', () => {
    const out = calendarMonth({ year: 2028, month: 2 }, [], date.id, [], cols, ctx)
    expect(out.weeks).toHaveLength(5)
    expect(dayOf(out, '2028-02-29').inMonth).toBe(true)
    expect(out.weeks[0]![0]!.date).toBe('2028-01-31')
    expect(out.weeks[4]![6]!.date).toBe('2028-03-05')
  })
  it('December rolls into January (Dec 2026: 2026-11-30 … 2027-01-03, 5 weeks)', () => {
    const out = calendarMonth({ year: 2026, month: 12 }, [], date.id, [], cols, ctx)
    expect(out.weeks[0]![0]!.date).toBe('2026-11-30')
    expect(out.weeks.at(-1)![6]!.date).toBe('2027-01-03')
    expect(out.weeks).toHaveLength(5)
  })
  it('a month starting on Monday starts the grid on the 1st (Mar 2027)', () => {
    const out = calendarMonth({ year: 2027, month: 3 }, [], date.id, [], cols, ctx)
    expect(out.weeks[0]![0]).toMatchObject({ date: '2027-03-01', inMonth: true })
    expect(out.weeks.at(-1)![6]!.date).toBe('2027-04-04')
  })
  it('rejects an invalid month', () => {
    expect(() => calendarMonth({ year: 2026, month: 1.5 }, [], date.id, [], cols, ctx)).toThrow(RangeError)
    expect(() => calendarMonth({ year: 2026, month: 13 }, [], date.id, [], cols, ctx)).toThrow(RangeError)
    expect(() => calendarMonth({ year: 2026, month: 0 }, [], date.id, [], cols, ctx)).toThrow(RangeError)
  })
})

describe('calendarMonth › cards placed by ISO date (BR-97, FR-1441)', () => {
  it('rows land on the day equal to their cell, in-month and out-of-month days in range', () => {
    const rows = [
      row('first', { [date.id]: '2026-11-01' }),
      row('today', { [date.id]: '2026-11-02' }),
      row('last', { [date.id]: '2026-11-30' }),
      row('oct', { [date.id]: '2026-10-26' }),
      row('dec', { [date.id]: '2026-12-06' }),
    ]
    const out = calendarMonth({ year: 2026, month: 11 }, rows, date.id, [], cols, ctx)
    expect(ids(dayOf(out, '2026-11-01').rows)).toEqual(['first'])
    expect(ids(dayOf(out, '2026-11-02').rows)).toEqual(['today'])
    expect(ids(dayOf(out, '2026-11-30').rows)).toEqual(['last'])
    expect(ids(dayOf(out, '2026-10-26').rows)).toEqual(['oct'])
    expect(ids(dayOf(out, '2026-12-06').rows)).toEqual(['dec'])
    expect(out.noDate).toEqual([])
  })
  it('rows dated outside the displayed range are not shown anywhere (not in noDate either)', () => {
    const rows = [row('before', { [date.id]: '2026-10-25' }), row('after', { [date.id]: '2026-12-07' })]
    const out = calendarMonth({ year: 2026, month: 11 }, rows, date.id, [], cols, ctx)
    expect(days(out).every((d) => d.rows.length === 0)).toBe(true)
    expect(out.noDate).toEqual([])
  })
  it('within one day rows follow BR-94 (view sorts, then position, then id)', () => {
    const rows = [
      row('late', { [date.id]: '2026-11-05', [num.id]: '1' }),
      row('early', { [date.id]: '2026-11-05', [num.id]: '9' }),
      row('b', { [date.id]: '2026-11-06' }, { position: 'a1' }),
      row('a', { [date.id]: '2026-11-06' }, { position: 'a1' }),
      row('z', { [date.id]: '2026-11-06' }, { position: 'a0' }),
    ]
    const sorted = calendarMonth(
      { year: 2026, month: 11 },
      rows,
      date.id,
      [{ columnId: num.id, dir: 'DESC' }],
      cols,
      ctx,
    )
    expect(ids(dayOf(sorted, '2026-11-05').rows)).toEqual(['early', 'late'])
    const unsorted = calendarMonth({ year: 2026, month: 11 }, rows, date.id, [], cols, ctx)
    expect(ids(dayOf(unsorted, '2026-11-06').rows)).toEqual(['z', 'a', 'b'])
  })
  it('more than 3 rows on a day are all returned (the "+N เพิ่มเติม" cut is UI)', () => {
    const rows = ['r1', 'r2', 'r3', 'r4', 'r5'].map((id) => row(id, { [date.id]: '2026-11-10' }))
    const out = calendarMonth({ year: 2026, month: 11 }, rows, date.id, [], cols, ctx)
    expect(dayOf(out, '2026-11-10').rows).toHaveLength(5)
  })
  it('keeps the caller row type (R extends DbRowModel)', () => {
    const rows = [{ ...row('x', { [date.id]: '2026-11-03' }), hasBody: true }]
    const out = calendarMonth({ year: 2026, month: 11 }, rows, date.id, [], cols, ctx)
    expect(dayOf(out, '2026-11-03').rows[0]!.hasBody).toBe(true)
  })
})

describe('calendarMonth › "ไม่มีวันที่" list (BR-97, FR-1444)', () => {
  it('empty, null, malformed or non-string dates go to noDate in BR-94 order', () => {
    const rows = [
      row('none', {}, { position: 'a3' }),
      row('null', { [date.id]: null }, { position: 'a2' }),
      row('bad', { [date.id]: 'x' }, { position: 'a1' }),
      row('feb30', { [date.id]: '2026-02-30' }, { position: 'a4' }),
      row('num', { [date.id]: 20261105 }, { position: 'a5' }),
      row('dated', { [date.id]: '2026-11-05' }),
    ]
    const out = calendarMonth({ year: 2026, month: 11 }, rows, date.id, [], cols, ctx)
    expect(ids(out.noDate)).toEqual(['bad', 'null', 'none', 'feb30', 'num'])
    expect(ids(dayOf(out, '2026-11-05').rows)).toEqual(['dated'])
  })
  it('noDate is the same regardless of the displayed month', () => {
    const rows = [row('none'), row('d', { [date.id]: '2026-11-05' })]
    for (const month of [1, 6, 11]) {
      expect(ids(calendarMonth({ year: 2026, month }, rows, date.id, [], cols, ctx).noDate)).toEqual(['none'])
    }
  })
  it('a missing, unknown or non-DATE column puts every row in noDate', () => {
    const rows = [row('a', { [date.id]: '2026-11-05' }), row('b')]
    for (const id of [undefined, 'c-gone', sel.id, num.id, title.id]) {
      const out = calendarMonth({ year: 2026, month: 11 }, rows, id, [], cols, ctx)
      expect(ids(out.noDate)).toEqual(['a', 'b'])
      expect(days(out).every((d) => d.rows.length === 0)).toBe(true)
    }
  })
})

describe('calendarMonth › properties', () => {
  const month = fc.record({ year: fc.integer({ min: 1900, max: 2200 }), month: fc.integer({ min: 1, max: 12 }) })

  it('4–6 contiguous Monday-first weeks covering exactly the month’s days as inMonth', () => {
    fc.assert(
      fc.property(month, ({ year, month: m }) => {
        const out = calendarMonth({ year, month: m }, [], date.id, [], cols, ctx)
        const all = days(out)
        expect(out.weeks.length).toBeGreaterThanOrEqual(4)
        expect(out.weeks.length).toBeLessThanOrEqual(6)
        expect(out.weeks.every((w) => w.length === 7)).toBe(true)
        expect(isoWeekday(all[0]!.date)).toBe(1)
        all.forEach((d, i) => i > 0 && expect(d.date).toBe(addDays(all[i - 1]!.date, 1)))
        const prefix = `${String(year).padStart(4, '0')}-${pad(m)}-`
        const inMonth = all.filter((d) => d.inMonth)
        expect(inMonth).toHaveLength(daysInMonth(year, m))
        expect(inMonth.every((d) => d.date.startsWith(prefix))).toBe(true)
        expect(out.weeks[0]!.some((d) => d.date === `${prefix}01`)).toBe(true)
      }),
    )
  })

  it('every row appears at most once: on its in-range day, or in noDate when it has no date', () => {
    const dayIn = fc.integer({ min: -10, max: 45 }).map((n) => addDays('2026-11-01', n))
    const cell = fc.option(dayIn, { nil: undefined })
    fc.assert(
      fc.property(fc.array(cell, { maxLength: 30 }), (cells) => {
        const rows = cells.map((d, i) => row(`r${pad(i)}`, d === undefined ? {} : { [date.id]: d }))
        const out = calendarMonth({ year: 2026, month: 11 }, rows, date.id, [], cols, ctx)
        const placed = days(out).flatMap((d) => d.rows.map((r) => [r.id, d.date] as const))
        expect(new Set(placed.map(([id]) => id)).size).toBe(placed.length)
        for (const [id, d] of placed) expect(rows.find((r) => r.id === id)!.cells[date.id]).toBe(d)
        expect(ids(out.noDate)).toEqual(ids(rows.filter((r) => !(date.id in r.cells))))
        const inRange = rows.filter((r) => {
          const v = r.cells[date.id] as string | undefined
          return v !== undefined && v >= '2026-10-26' && v <= '2026-12-06'
        })
        expect(placed).toHaveLength(inRange.length)
      }),
    )
  })
})
