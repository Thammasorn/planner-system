// v3.7 per-cell date ranges (owner 2026-11-03): BR-90 shape/validation, BR-92 typed input, BR-93 conversion,
// BR-94 order (start, then end), BR-95 filters (start for is/before/after, overlap for "อยู่ในช่วง"), BR-97 calendar.
import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import {
  calendarMonth,
  cellText,
  convertCell,
  dateSpanOf,
  isDateRangeValue,
  matchesFilters,
  normalizeCellInput,
  parseDateCellInput,
  readCell,
  resizeDateRange,
  shiftDateRange,
  sortRows,
} from './database'
import { addDays, compareISO, diffDays } from './dates'
import type { DateRangeValue, ViewFilter } from './types'
import { TODAY, col, ctx, row } from './database/fixtures.test.helper'

const date = col('DATE')
const text = col('TEXT')
const nctx = { activeUserIds: new Set<string>() }
const cctx = { users: [], today: TODAY }

/** Any ISO date 1950-01-01 … ~2149. */
const isoArb = fc.integer({ min: 0, max: 73_000 }).map((n) => addDays('1950-01-01', n))
const rangeArb = fc
  .tuple(isoArb, fc.integer({ min: 0, max: 400 }))
  .map(([start, len]): DateRangeValue => ({ start, end: addDays(start, len) }))

describe('BR-90 range shape', () => {
  it('accepts { start, end } with start ≤ end, keeps a single date a plain string', () => {
    expect(normalizeCellInput(date, { start: '2026-11-03', end: '2026-11-07' }, nctx)).toEqual({
      ok: true,
      value: { start: '2026-11-03', end: '2026-11-07' },
    })
    expect(normalizeCellInput(date, { start: '2026-11-03', end: '2026-11-03' }, nctx)).toMatchObject({
      ok: true,
    })
    expect(normalizeCellInput(date, '2026-11-03', nctx)).toEqual({ ok: true, value: '2026-11-03' })
  })

  it.each([
    [{ start: '2026-11-07', end: '2026-11-03' }],
    [{ start: '2026-02-30', end: '2026-03-01' }],
    [{ start: '2026-11-03' }],
    [{ start: '2026-11-03', end: '2026-11-04', x: 1 }],
    [{ start: 20261103, end: '2026-11-04' }],
  ])('rejects %j', (v) => {
    expect(normalizeCellInput(date, v, nctx)).toEqual({ ok: false, reason: 'DATE' })
  })

  it('rejects a list of dates (wrong type)', () => {
    expect(normalizeCellInput(date, ['2026-11-03', '2026-11-04'], nctx)).toEqual({
      ok: false,
      reason: 'TYPE',
    })
  })

  it('a range is not accepted by other column types', () => {
    expect(normalizeCellInput(text, { start: '2026-11-03', end: '2026-11-04' }, nctx)).toEqual({
      ok: false,
      reason: 'TYPE',
    })
  })

  it('property: every valid range normalizes to itself and reads back unchanged', () => {
    fc.assert(
      fc.property(rangeArb, (r) => {
        expect(isDateRangeValue(r)).toBe(true)
        expect(normalizeCellInput(date, r, nctx)).toEqual({ ok: true, value: r })
        expect(readCell(date, r)).toEqual(r)
        expect(dateSpanOf(r)).toEqual(r)
      }),
    )
  })

  it('tolerant read: a reversed / malformed stored range reads as empty', () => {
    expect(readCell(date, { start: '2026-11-07', end: '2026-11-03' })).toBeNull()
    expect(readCell(date, { start: '2026-11-07' })).toBeNull()
    expect(dateSpanOf('2026-11-03')).toEqual({ start: '2026-11-03', end: '2026-11-03' })
  })
})

describe('BR-92 typed input (parseDateCellInput)', () => {
  it.each([
    ['3/11/2569', '2026-11-03'],
    ['3/11 → 7/11', { start: '2026-11-03', end: '2026-11-07' }],
    ['2026-11-03 → 2026-11-07', { start: '2026-11-03', end: '2026-11-07' }],
    ['2026-11-03 – 2026-11-07', { start: '2026-11-03', end: '2026-11-07' }],
    ['3/11/2569 - 7/11/2569', { start: '2026-11-03', end: '2026-11-07' }],
    ['7/11 -> 3/11', { start: '2026-11-03', end: '2026-11-07' }],
    ['', null],
    ['3/11 → ', 'invalid'],
    ['31/2 → 3/3', 'invalid'],
    ['1/1 → 2/1 → 3/1', 'invalid'],
  ])('%j → %j', (raw, want) => expect(parseDateCellInput(raw, TODAY)).toEqual(want))
})

describe('BR-93 conversion', () => {
  it('range → text "start → end" → range again (round trip)', () => {
    fc.assert(
      fc.property(rangeArb, (r) => {
        const t = convertCell(date, text, r, cctx)
        expect(t).toBe(`${r.start} → ${r.end}`)
        expect(convertCell(text, date, t, cctx)).toEqual(r)
      }),
    )
  })

  it('text with "–" or "→" becomes a range, a single date a string, junk empty', () => {
    expect(convertCell(text, date, '2026-11-03 – 2026-11-07', cctx)).toEqual({
      start: '2026-11-03',
      end: '2026-11-07',
    })
    expect(convertCell(text, date, '3/11/2569', cctx)).toBe('2026-11-03')
    expect(convertCell(text, date, 'ไม่ใช่วันที่', cctx)).toBeNull()
  })

  it('range → NUMBER / CHECKBOX / URL via its text', () => {
    const r = { start: '2026-11-03', end: '2026-11-07' }
    expect(convertCell(date, col('NUMBER'), r, cctx)).toBeNull()
    expect(convertCell(date, col('CHECKBOX'), r, cctx)).toBeNull()
    expect(convertCell(date, col('URL'), r, cctx)).toBeNull()
    expect(cellText(date, r, ctx)).toBe('2026-11-03 → 2026-11-07')
  })
})

describe('BR-94 order: start, then end', () => {
  it('single date before a range from the same day; ranges by end', () => {
    const rows = [
      row('r-long', { [date.id]: { start: '2026-11-03', end: '2026-11-09' } }, { position: 'a1' }),
      row('r-later', { [date.id]: '2026-11-04' }, { position: 'a2' }),
      row('r-short', { [date.id]: { start: '2026-11-03', end: '2026-11-05' } }, { position: 'a3' }),
      row('r-single', { [date.id]: '2026-11-03' }, { position: 'a4' }),
      row('r-empty', {}, { position: 'a0' }),
    ]
    const asc = sortRows(rows, [{ columnId: date.id, dir: 'ASC' }], [date], ctx).map((r) => r.id)
    expect(asc).toEqual(['r-single', 'r-short', 'r-long', 'r-later', 'r-empty'])
    const desc = sortRows(rows, [{ columnId: date.id, dir: 'DESC' }], [date], ctx).map((r) => r.id)
    expect(desc).toEqual(['r-later', 'r-long', 'r-short', 'r-single', 'r-empty'])
  })

  it('property: ASC order is non-decreasing by (start, end)', () => {
    fc.assert(
      fc.property(fc.array(fc.oneof(rangeArb, isoArb), { maxLength: 12 }), (vals) => {
        const rows = vals.map((v, i) => row(`r${i}`, { [date.id]: v }, { position: `a${i}` }))
        const out = sortRows(rows, [{ columnId: date.id, dir: 'ASC' }], [date], ctx)
        for (let i = 1; i < out.length; i++) {
          const a = dateSpanOf(out[i - 1]!.cells[date.id])!
          const b = dateSpanOf(out[i]!.cells[date.id])!
          expect(compareISO(a.start, b.start) || compareISO(a.end, b.end)).toBeLessThanOrEqual(0)
        }
      }),
    )
  })
})

describe('BR-95 filters on ranges', () => {
  const r = row('r', { [date.id]: { start: '2026-11-03', end: '2026-11-07' } })
  const single = row('s', { [date.id]: '2026-11-05' })
  const empty = row('e')
  const f = (op: ViewFilter['op'], value?: ViewFilter['value']): ViewFilter[] => [
    { columnId: date.id, op, value },
  ]
  const on = (d: string) => ({ kind: 'date' as const, date: d })

  it('is / before / after / on-or-… compare the start', () => {
    expect(matchesFilters(r, f('is', on('2026-11-03')), [date], ctx)).toBe(true)
    expect(matchesFilters(r, f('is', on('2026-11-05')), [date], ctx)).toBe(false)
    expect(matchesFilters(r, f('before', on('2026-11-04')), [date], ctx)).toBe(true)
    expect(matchesFilters(r, f('after', on('2026-11-04')), [date], ctx)).toBe(false)
    expect(matchesFilters(r, f('onOrAfter', on('2026-11-03')), [date], ctx)).toBe(true)
    expect(matchesFilters(r, f('onOrBefore', on('2026-11-02')), [date], ctx)).toBe(false)
  })

  it('within = overlap (either order of the reference), empty never matches', () => {
    const w = (start: string, end: string) => f('within', { kind: 'range', start, end })
    expect(matchesFilters(r, w('2026-11-07', '2026-11-10'), [date], ctx)).toBe(true)
    expect(matchesFilters(r, w('2026-11-01', '2026-11-03'), [date], ctx)).toBe(true)
    expect(matchesFilters(r, w('2026-11-08', '2026-11-10'), [date], ctx)).toBe(false)
    expect(matchesFilters(r, w('2026-11-10', '2026-11-04'), [date], ctx)).toBe(true)
    expect(matchesFilters(single, w('2026-11-05', '2026-11-05'), [date], ctx)).toBe(true)
    expect(matchesFilters(single, w('2026-11-06', '2026-11-09'), [date], ctx)).toBe(false)
    expect(matchesFilters(empty, w('2026-11-01', '2026-11-30'), [date], ctx)).toBe(false)
    expect(matchesFilters(r, f('isEmpty'), [date], ctx)).toBe(false)
    expect(matchesFilters(empty, f('isEmpty'), [date], ctx)).toBe(true)
  })

  it('within without a range value (or with a single date ref) is incomplete → skipped', () => {
    expect(matchesFilters(empty, f('within'), [date], ctx)).toBe(true)
    expect(matchesFilters(empty, f('within', on('2026-11-03')), [date], ctx)).toBe(true)
  })

  it('property: within ⇔ the spans share a day', () => {
    fc.assert(
      fc.property(rangeArb, rangeArb, (cell, ref) => {
        const hit = matchesFilters(
          row('x', { [date.id]: cell }),
          f('within', { kind: 'range', ...ref }),
          [date],
          ctx,
        )
        let shared = false
        for (let d = cell.start; compareISO(d, cell.end) <= 0 && !shared; d = addDays(d, 1))
          shared = compareISO(d, ref.start) >= 0 && compareISO(d, ref.end) <= 0
        expect(hit).toBe(shared)
      }),
      { numRuns: 60 },
    )
  })
})

describe('BR-97 calendar ranges', () => {
  it('a range goes to `ranges` and to every covered shown day, not to `rows`', () => {
    const rows = [
      row('span', { [date.id]: { start: '2026-10-30', end: '2026-11-04' } }),
      row('one', { [date.id]: '2026-11-03' }),
      row('far', { [date.id]: { start: '2027-01-01', end: '2027-01-05' } }),
    ]
    const out = calendarMonth({ year: 2026, month: 11 }, rows, date.id, [], [date], ctx)
    expect(out.ranges.map((x) => x.row.id)).toEqual(['span'])
    const days = out.weeks.flat()
    const covered = days.filter((d) => d.rangeRows.some((x) => x.id === 'span')).map((d) => d.date)
    expect(covered).toEqual([
      '2026-10-30',
      '2026-10-31',
      '2026-11-01',
      '2026-11-02',
      '2026-11-03',
      '2026-11-04',
    ])
    expect(days.find((d) => d.date === '2026-11-03')!.rows.map((x) => x.id)).toEqual(['one'])
    expect(out.noDate).toEqual([])
  })

  it('a range wider than the shown weeks is clipped to them', () => {
    const rows = [row('wide', { [date.id]: { start: '2026-09-01', end: '2027-03-01' } })]
    const out = calendarMonth({ year: 2026, month: 11 }, rows, date.id, [], [date], ctx)
    expect(out.weeks.flat().every((d) => d.rangeRows.length === 1)).toBe(true)
  })
})

describe('calendar move / resize helpers', () => {
  it('property: shift keeps the length; resize never inverts the range', () => {
    fc.assert(
      fc.property(rangeArb, fc.integer({ min: -400, max: 400 }), isoArb, (r, by, to) => {
        const moved = shiftDateRange(r, by)
        expect(diffDays(moved.start, moved.end)).toBe(diffDays(r.start, r.end))
        expect(diffDays(r.start, moved.start)).toBe(by)
        for (const edge of ['start', 'end'] as const) {
          const out = resizeDateRange(r, edge, to)
          expect(isDateRangeValue(out)).toBe(true)
          expect(edge === 'start' ? out.end : out.start).toBe(edge === 'start' ? r.end : r.start)
        }
      }),
    )
  })
})
