import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import {
  affectedWeeks,
  capacityByDay,
  capacityByWeek,
  dayCapacityCd,
  standardDayCd,
  standardWeekCd,
  timeOffFractionCd,
  toTimeOffSpan,
  weekCapacityCd,
  weekCapacityImpact,
  type CapacityProfile,
} from './capacity'
import { addDays, daysOfWeek, eachDay } from './dates'
import type { HalfDay, ISODate, Schedule, TimeOffSpan, Weekday } from './types'

const MON_FRI: Schedule = { 1: 100, 2: 100, 3: 100, 4: 100, 5: 100 }
const PART_MWF: Schedule = { 1: 100, 3: 100, 5: 100 }
const W = '2026-10-05' // Monday
const NO_HOLIDAYS: ReadonlySet<ISODate> = new Set()

const span = (s: ISODate, e: ISODate = s, half: HalfDay | null = null): TimeOffSpan =>
  toTimeOffSpan({ startDate: s, endDate: e, half })

const week = (
  schedule: Schedule,
  timeOff: readonly TimeOffSpan[] = [],
  holidays: readonly ISODate[] = [],
  ws: ISODate = W,
  deactivatedOn?: ISODate | null,
) => weekCapacityCd(schedule, new Set(holidays), timeOff, ws, deactivatedOn)

const days = (
  schedule: Schedule,
  timeOff: readonly TimeOffSpan[] = [],
  holidays: readonly ISODate[] = [],
  ws: ISODate = W,
  deactivatedOn?: ISODate | null,
) => daysOfWeek(ws).map((d) => dayCapacityCd(schedule, new Set(holidays), timeOff, d, deactivatedOn))

describe('§5.2 weekCapacityCd (SPEC table, week จ–ศ)', () => {
  it('ปกติ → 500', () => {
    expect(week(MON_FRI)).toBe(500)
    expect(days(MON_FRI)).toEqual([100, 100, 100, 100, 100, 0, 0])
  })
  it('ลา 2 วัน → 300 (= F3)', () => {
    const off = [span('2026-10-05', '2026-10-06')]
    expect(week(MON_FRI, off)).toBe(300)
    expect(days(MON_FRI, off)).toEqual([0, 0, 100, 100, 100, 0, 0])
  })
  it('ลาครึ่งวันบ่ายวันศุกร์ → 450', () => {
    expect(week(MON_FRI, [span('2026-10-09', '2026-10-09', 'PM')])).toBe(450)
  })
  it('พาร์ตไทม์ จ/พ/ศ → 300', () => {
    expect(week(PART_MWF)).toBe(300)
  })
  it('พาร์ตไทม์ จ/พ/ศ + ลาวันพุธ → 200', () => {
    expect(week(PART_MWF, [span('2026-10-07')])).toBe(200)
  })
  it('วันหยุดวันศุกร์ + ลาวันศุกร์ → 400 (BR-12: no double deduction)', () => {
    expect(week(MON_FRI, [span('2026-10-09')], ['2026-10-09'])).toBe(400)
    expect(dayCapacityCd(MON_FRI, new Set(['2026-10-09']), [span('2026-10-09')], '2026-10-09')).toBe(0)
  })
  it('ลาทั้งสัปดาห์ → 0', () => {
    expect(week(MON_FRI, [span('2026-10-05', '2026-10-11')])).toBe(0)
  })
})

describe('BR-13 deactivation', () => {
  it('from Wednesday → 200; the day before counts, the deactivation day is 0', () => {
    expect(week(MON_FRI, [], [], W, '2026-10-07')).toBe(200)
    expect(dayCapacityCd(MON_FRI, NO_HOLIDAYS, [], '2026-10-06', '2026-10-07')).toBe(100)
    expect(dayCapacityCd(MON_FRI, NO_HOLIDAYS, [], '2026-10-07', '2026-10-07')).toBe(0)
    expect(days(MON_FRI, [], [], W, '2026-10-07')).toEqual([100, 100, 0, 0, 0, 0, 0])
  })
  it('deactivated on the Monday → 0', () => {
    expect(week(MON_FRI, [], [], W, '2026-10-05')).toBe(0)
  })
  it('deactivated before the week → 0', () => {
    expect(week(MON_FRI, [], [], W, '2026-01-01')).toBe(0)
  })
  it('deactivated after the week → 500', () => {
    expect(week(MON_FRI, [], [], W, '2026-10-12')).toBe(500)
  })
  it('null / undefined deactivation → 500', () => {
    expect(week(MON_FRI, [], [], W, null)).toBe(500)
    expect(week(MON_FRI, [], [], W, undefined)).toBe(500)
    expect(week(MON_FRI)).toBe(500)
  })
})

describe('half days and clamping', () => {
  it('half day on a 50 cd part-time day → 0', () => {
    expect(
      dayCapacityCd({ 3: 50 }, NO_HOLIDAYS, [span('2026-10-07', '2026-10-07', 'AM')], '2026-10-07'),
    ).toBe(0)
  })
  it('half day on a 75 cd part-time day → 25', () => {
    expect(
      dayCapacityCd({ 3: 75 }, NO_HOLIDAYS, [span('2026-10-07', '2026-10-07', 'AM')], '2026-10-07'),
    ).toBe(25)
  })
  it('two half spans + one full on the same day (domain only) → 0, never negative', () => {
    const off = [span(W, W, 'AM'), span(W, W, 'PM'), span(W)]
    expect(dayCapacityCd(MON_FRI, NO_HOLIDAYS, off, W)).toBe(0)
    expect(week(MON_FRI, off)).toBe(400)
  })
  it('AM + PM on the same day → 0', () => {
    expect(dayCapacityCd(MON_FRI, NO_HOLIDAYS, [span(W, W, 'AM'), span(W, W, 'PM')], W)).toBe(0)
  })
})

describe('ranges across weeks, weekends and holidays', () => {
  it('cross-week Thu 10-08..Tue 10-13 → 300 and 300 (r5 M5-02)', () => {
    const off = [span('2026-10-08', '2026-10-13')]
    expect(week(MON_FRI, off, [], '2026-10-05')).toBe(300)
    expect(week(MON_FRI, off, [], '2026-10-12')).toBe(300)
  })
  it('over a weekend Fri 10-09..Mon 10-12 → 400 and 400', () => {
    const off = [span('2026-10-09', '2026-10-12')]
    expect(week(MON_FRI, off, [], '2026-10-05')).toBe(400)
    expect(week(MON_FRI, off, [], '2026-10-12')).toBe(400)
  })
  it('leave on the weekend only → 500', () => {
    expect(week(MON_FRI, [span('2026-10-10', '2026-10-11')])).toBe(500)
  })
  it('holiday on a non-working day → 500', () => {
    expect(week(MON_FRI, [], ['2026-10-10'])).toBe(500)
  })
  it('F2: holiday 2026-10-23 → week 10-19 = 400', () => {
    expect(week(MON_FRI, [], ['2026-10-23'], '2026-10-19')).toBe(400)
    expect(days(MON_FRI, [], ['2026-10-23'], '2026-10-19')).toEqual([100, 100, 100, 100, 0, 0, 0])
  })
  it('F4: leave 10-12..10-14 → week 10-12 = 200', () => {
    const off = [span('2026-10-12', '2026-10-14')]
    expect(week(MON_FRI, off, [], '2026-10-12')).toBe(200)
    expect(days(MON_FRI, off, [], '2026-10-12')).toEqual([0, 0, 0, 100, 100, 0, 0])
  })
  it('year boundary: holiday 2027-01-01, week 2026-12-28 → 400', () => {
    expect(week(MON_FRI, [], ['2027-01-01'], '2026-12-28')).toBe(400)
  })
  it('leave outside the week does not count', () => {
    expect(week(MON_FRI, [span('2026-09-28', '2026-10-04'), span('2026-10-12')])).toBe(500)
  })
})

describe('BR-41 standard capacity', () => {
  it('standardWeekCd: Mon–Fri 500, part-time 300, empty 0', () => {
    expect(standardWeekCd(MON_FRI)).toBe(500)
    expect(standardWeekCd(PART_MWF)).toBe(300)
    expect(standardWeekCd({})).toBe(0)
    expect(standardWeekCd({ 1: 50, 6: 25 })).toBe(75)
  })
  it('standardDayCd ignores holidays, leave and deactivation', () => {
    // 2026-10-23 is a holiday in F2, a leave day elsewhere, a deactivation day elsewhere — schedule only.
    expect(standardDayCd(MON_FRI, '2026-10-23')).toBe(100)
    expect(standardDayCd(MON_FRI, '2026-10-24')).toBe(0)
    expect(standardDayCd({ 3: 75 }, '2026-10-07')).toBe(75)
  })
})

describe('weekCapacityCd › non-Monday', () => {
  it('throws RangeError when ws is not a Monday', () => {
    expect(() => weekCapacityCd(MON_FRI, NO_HOLIDAYS, [], '2026-10-06')).toThrow(RangeError)
    expect(() => weekCapacityCd(MON_FRI, NO_HOLIDAYS, [], '2026-10-11')).toThrow(RangeError)
  })
  it('throws RangeError on an invalid date', () => {
    expect(() => weekCapacityCd(MON_FRI, NO_HOLIDAYS, [], '2026-13-01')).toThrow(RangeError)
  })
})

describe('fractions', () => {
  it('timeOffFractionCd: null → 100, AM/PM → 50', () => {
    expect(timeOffFractionCd(null)).toBe(100)
    expect(timeOffFractionCd('AM')).toBe(50)
    expect(timeOffFractionCd('PM')).toBe(50)
  })
  it('toTimeOffSpan maps the fields and drops everything else', () => {
    expect(toTimeOffSpan({ startDate: '2026-10-05', endDate: '2026-10-06', half: null })).toEqual({
      startDate: '2026-10-05',
      endDate: '2026-10-06',
      fractionCd: 100,
    })
    const extra = { startDate: '2026-10-09', endDate: '2026-10-09', half: 'PM' as const, note: 'x', id: '1' }
    expect(toTimeOffSpan(extra)).toEqual({ startDate: '2026-10-09', endDate: '2026-10-09', fractionCd: 50 })
  })
})

describe('capacityByDay / capacityByWeek', () => {
  const F3: CapacityProfile = {
    schedule: MON_FRI,
    holidays: NO_HOLIDAYS,
    timeOff: [span('2026-10-05', '2026-10-06')],
    deactivatedOn: null,
  }

  it('F3 over [2026-09-28, 2026-10-19) → 21 day keys', () => {
    const r = capacityByDay(F3, '2026-09-28', '2026-10-19')
    expect(Object.keys(r)).toEqual(eachDay('2026-09-28', '2026-10-18'))
    expect(r['2026-10-05']).toEqual({ capacityCd: 0, standardCd: 100 })
    expect(r['2026-10-07']).toEqual({ capacityCd: 100, standardCd: 100 })
    expect(r['2026-10-10']).toEqual({ capacityCd: 0, standardCd: 0 })
  })
  it('F3 over [2026-09-28, 2026-10-19) → 3 week keys', () => {
    expect(capacityByWeek(F3, '2026-09-28', '2026-10-19')).toEqual({
      '2026-09-28': { capacityCd: 500, standardCd: 500 },
      '2026-10-05': { capacityCd: 300, standardCd: 500 },
      '2026-10-12': { capacityCd: 500, standardCd: 500 },
    })
  })
  it('weeks: a mid-week `from` includes the week that contains it', () => {
    expect(Object.keys(capacityByWeek(F3, '2026-10-07', '2026-10-13'))).toEqual(['2026-10-05', '2026-10-12'])
  })
  it('empty range → {}', () => {
    expect(capacityByDay(F3, '2026-10-05', '2026-10-05')).toEqual({})
    expect(capacityByWeek(F3, '2026-10-05', '2026-10-05')).toEqual({})
  })
  it('passes holidays and deactivation through', () => {
    const p: CapacityProfile = { ...F3, holidays: new Set(['2026-09-30']), deactivatedOn: '2026-10-15' }
    expect(capacityByWeek(p, '2026-09-28', '2026-10-19')).toEqual({
      '2026-09-28': { capacityCd: 400, standardCd: 500 },
      '2026-10-05': { capacityCd: 300, standardCd: 500 },
      '2026-10-12': { capacityCd: 300, standardCd: 500 },
    })
    expect(capacityByDay(p, '2026-10-15', '2026-10-16')).toEqual({
      '2026-10-15': { capacityCd: 0, standardCd: 100 },
    })
  })
})

describe('affectedWeeks', () => {
  it('[] → []', () => {
    expect(affectedWeeks([])).toEqual([])
  })
  it('one range inside a week', () => {
    expect(affectedWeeks([{ startDate: '2026-10-05', endDate: '2026-10-06' }])).toEqual(['2026-10-05'])
  })
  it('a range across two weeks', () => {
    expect(affectedWeeks([{ startDate: '2026-10-08', endDate: '2026-10-13' }])).toEqual([
      '2026-10-05',
      '2026-10-12',
    ])
  })
  it('two ranges (old + new of an update) → both weeks once, ordered', () => {
    const expected = ['2026-10-05', '2026-10-12']
    expect(
      affectedWeeks([
        { startDate: '2026-10-05', endDate: '2026-10-06' },
        { startDate: '2026-10-12', endDate: '2026-10-13' },
      ]),
    ).toEqual(expected)
    expect(
      affectedWeeks([
        { startDate: '2026-10-12', endDate: '2026-10-13' },
        { startDate: '2026-10-05', endDate: '2026-10-12' },
      ]),
    ).toEqual(expected)
  })
  it('weeks touched by no range are not listed (bounded by the ranges, not their span)', () => {
    expect(
      affectedWeeks([
        { startDate: '2026-10-05', endDate: '2026-10-05' },
        { startDate: '2026-10-21', endDate: '2026-10-21' },
      ]),
    ).toEqual(['2026-10-05', '2026-10-19'])
  })
  it('end before start → RangeError', () => {
    expect(() => affectedWeeks([{ startDate: '2026-10-06', endDate: '2026-10-05' }])).toThrow(RangeError)
  })
})

describe('weekCapacityImpact (FR-906, M5-D5)', () => {
  const base: Omit<CapacityProfile, 'timeOff'> = {
    schedule: MON_FRI,
    holidays: NO_HOLIDAYS,
    deactivatedOn: null,
  }

  it('create (F3): 500 → 300', () => {
    expect(weekCapacityImpact(base, [], [span('2026-10-05', '2026-10-06')], ['2026-10-05'])).toEqual([
      { weekStart: '2026-10-05', beforeCd: 500, afterCd: 300 },
    ])
  })
  it('move: week 10-05 300 → 500, week 10-12 500 → 300', () => {
    expect(
      weekCapacityImpact(
        base,
        [span('2026-10-05', '2026-10-06')],
        [span('2026-10-12', '2026-10-13')],
        ['2026-10-05', '2026-10-12'],
      ),
    ).toEqual([
      { weekStart: '2026-10-05', beforeCd: 300, afterCd: 500 },
      { weekStart: '2026-10-12', beforeCd: 500, afterCd: 300 },
    ])
  })
  it('on a holiday: 400 → 400 (no change)', () => {
    const p = { ...base, holidays: new Set(['2026-10-23']) }
    expect(weekCapacityImpact(p, [], [span('2026-10-23')], ['2026-10-19'])).toEqual([
      { weekStart: '2026-10-19', beforeCd: 400, afterCd: 400 },
    ])
  })
  it('deactivation applies to both sides', () => {
    const p = { ...base, deactivatedOn: '2026-10-07' }
    expect(weekCapacityImpact(p, [], [span('2026-10-05')], ['2026-10-05'])).toEqual([
      { weekStart: '2026-10-05', beforeCd: 200, afterCd: 100 },
    ])
  })
  it('no weeks → []', () => {
    expect(weekCapacityImpact(base, [], [span('2026-10-05')], [])).toEqual([])
  })
})

// ---------------------------------------------------------------------------------------------------------------
// Properties: arbitrary schedule, ≤ 5 spans and ≤ 3 holidays inside a 3-week window, optional deactivation.
const WINDOW_START = '2026-09-28' // Monday
const WINDOW_DAYS = eachDay(WINDOW_START, addDays(WINDOW_START, 20))
const WEEKS = ['2026-09-28', '2026-10-05', '2026-10-12'] as const

const dayArb = fc.constantFrom(...WINDOW_DAYS)
const scheduleArb: fc.Arbitrary<Schedule> = fc
  .tuple(...Array.from({ length: 7 }, () => fc.constantFrom<number | undefined>(undefined, 25, 50, 75, 100)))
  .map((vals) => {
    const s: Schedule = {}
    vals.forEach((v, i) => {
      if (v !== undefined) s[(i + 1) as Weekday] = v
    })
    return s
  })
const spanArb: fc.Arbitrary<TimeOffSpan> = fc
  .tuple(dayArb, dayArb, fc.constantFrom<HalfDay | null>(null, 'AM', 'PM'))
  .map(([a, b, half]) => (a <= b ? span(a, b, half) : span(b, a, half)))
const profileArb = fc.record({
  schedule: scheduleArb,
  timeOff: fc.array(spanArb, { maxLength: 5 }),
  holidays: fc.uniqueArray(dayArb, { maxLength: 3 }),
  deactivatedOn: fc.option(dayArb, { nil: null }),
  ws: fc.constantFrom(...WEEKS),
})

describe('capacity properties (fast-check)', () => {
  it('0 ≤ weekCapacityCd ≤ standardWeekCd, and integer', () => {
    fc.assert(
      fc.property(profileArb, (p) => {
        const w = weekCapacityCd(p.schedule, new Set(p.holidays), p.timeOff, p.ws, p.deactivatedOn)
        return Number.isInteger(w) && w >= 0 && w <= standardWeekCd(p.schedule)
      }),
    )
  })
  it('weekCapacityCd = Σ dayCapacityCd over daysOfWeek(ws)', () => {
    fc.assert(
      fc.property(profileArb, (p) => {
        const h = new Set(p.holidays)
        const sum = daysOfWeek(p.ws).reduce(
          (s, d) => s + dayCapacityCd(p.schedule, h, p.timeOff, d, p.deactivatedOn),
          0,
        )
        return weekCapacityCd(p.schedule, h, p.timeOff, p.ws, p.deactivatedOn) === sum
      }),
    )
  })
  it('adding one more span never increases any day', () => {
    fc.assert(
      fc.property(profileArb, spanArb, (p, extra) => {
        const h = new Set(p.holidays)
        const more = [...p.timeOff, extra]
        return WINDOW_DAYS.every(
          (d) =>
            dayCapacityCd(p.schedule, h, more, d, p.deactivatedOn) <=
            dayCapacityCd(p.schedule, h, p.timeOff, d, p.deactivatedOn),
        )
      }),
    )
  })
  it('a holiday day is 0', () => {
    fc.assert(
      fc.property(profileArb, (p) => {
        const h = new Set(p.holidays)
        return p.holidays.every((d) => dayCapacityCd(p.schedule, h, p.timeOff, d, p.deactivatedOn) === 0)
      }),
    )
  })
  it('every day result is an integer within [0, standardDayCd]', () => {
    fc.assert(
      fc.property(profileArb, (p) => {
        const h = new Set(p.holidays)
        return WINDOW_DAYS.every((d) => {
          const c = dayCapacityCd(p.schedule, h, p.timeOff, d, p.deactivatedOn)
          return Number.isInteger(c) && c >= 0 && c <= standardDayCd(p.schedule, d)
        })
      }),
    )
  })
  it('capacityByWeek agrees with weekCapacityCd and standardWeekCd', () => {
    fc.assert(
      fc.property(profileArb, (p) => {
        const profile: CapacityProfile = {
          schedule: p.schedule,
          holidays: new Set(p.holidays),
          timeOff: p.timeOff,
          deactivatedOn: p.deactivatedOn,
        }
        const r = capacityByWeek(profile, WINDOW_START, addDays(WINDOW_START, 21))
        return WEEKS.every(
          (ws) =>
            r[ws]?.capacityCd ===
              weekCapacityCd(profile.schedule, profile.holidays, p.timeOff, ws, p.deactivatedOn) &&
            r[ws]?.standardCd === standardWeekCd(p.schedule),
        )
      }),
    )
  })
})
