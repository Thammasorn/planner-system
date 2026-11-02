import { describe, expect, it } from 'vitest'
import { addWeeks, daysOfWeek } from '@/domain/dates'
import { buildColumns } from './columns'
import {
  MONTH_LABEL_LONG_MIN_W,
  monthLabel,
  monthOfColumn,
  monthSpans,
  monthStartKeys,
  visibleSpanWidth,
} from './months'

const weeks = (from: string, n: number) => Array.from({ length: n }, (_, i) => addWeeks(from, i))
const cols = (from: string, n: number, expanded: string[] = []) =>
  buildColumns(weeks(from, n), new Set(expanded), new Map())

describe('monthOfColumn (FR-818)', () => {
  it('week column → month of its Monday (28/9 = ก.ย.)', () => {
    const c = cols('2026-09-28', 1)[0]!
    expect(monthOfColumn(c)).toBe('2026-09')
  })
  it('day column → month of its date', () => {
    const c = cols('2026-09-28', 1, ['2026-09-28']).find((x) => x.date === '2026-10-01')!
    expect(monthOfColumn(c)).toBe('2026-10')
  })
  it('weekTotal → month of the preceding day column of its week; alone → month of its Monday', () => {
    const cs = cols('2026-09-28', 1, ['2026-09-28'])
    const total = cs[cs.length - 1]!
    expect(total.role).toBe('weekTotal')
    expect(monthOfColumn(total, cs[cs.length - 2])).toBe('2026-10')
    expect(monthOfColumn(total)).toBe('2026-09')
    // a preceding column of another week is ignored
    expect(monthOfColumn(total, cols('2026-11-02', 1)[0])).toBe('2026-09')
  })
})

describe('monthSpans (FR-818, M7.1-D10)', () => {
  it('weeks 2026-09-14…2026-11-02 → ก.ย. (14/9, 21/9, 28/9), ต.ค. (5/10…26/10), พ.ย. (2/11)', () => {
    const cs = cols('2026-09-14', 8)
    expect(monthSpans(cs)).toEqual([
      { key: '2026-09', startIdx: 0, endIdx: 2, left: 0, width: 3 * 64 },
      { key: '2026-10', startIdx: 3, endIdx: 6, left: 3 * 64, width: 4 * 64 },
      { key: '2026-11', startIdx: 7, endIdx: 7, left: 7 * 64, width: 64 },
    ])
  })
  it('week 28/9 expanded → day 2026-10-01 starts ต.ค. and the รวม column stays in ต.ค.', () => {
    const cs = cols('2026-09-21', 3, ['2026-09-28'])
    const spans = monthSpans(cs)
    expect(spans.map((s) => s.key)).toEqual(['2026-09', '2026-10'])
    const oct = spans[1]!
    expect(cs[oct.startIdx]!.key).toBe('D:2026-10-01')
    expect(oct.endIdx).toBe(cs.length - 1)
    expect(oct.left).toBe(cs[oct.startIdx]!.offset)
    expect(oct.width).toBe(cs.reduce((a, c, i) => (i >= oct.startIdx ? a + c.width : a), 0))
  })
  it('year change 2026-12-28 → 2027-01-04', () => {
    const spans = monthSpans(cols('2026-12-21', 3))
    expect(spans.map((s) => s.key)).toEqual(['2026-12', '2027-01'])
  })
  it('range → only the spans intersecting it, each with its full extent', () => {
    const cs = cols('2026-09-14', 8)
    expect(monthSpans(cs, { first: 4, last: 5 })).toEqual([
      { key: '2026-10', startIdx: 3, endIdx: 6, left: 192, width: 256 },
    ])
    expect(monthSpans(cs, { first: 2, last: 3 }).map((s) => s.key)).toEqual(['2026-09', '2026-10'])
    // clamped to the column list
    expect(monthSpans(cs, { first: -5, last: 99 })).toHaveLength(3)
  })
  it('no columns / empty range → []', () => {
    expect(monthSpans([])).toEqual([])
    expect(monthSpans(cols('2026-09-14', 2), { first: 3, last: 2 })).toEqual([])
  })
})

describe('monthStartKeys (month boundary lines)', () => {
  it('first column of each month except the very first rendered column', () => {
    expect([...monthStartKeys(cols('2026-09-14', 8))]).toEqual(['W:2026-10-05', 'W:2026-11-02'])
  })
  it('expanded 28/9: boundary between 30 ก.ย. and 1 ต.ค. only (AC-811)', () => {
    const keys = monthStartKeys(cols('2026-09-21', 3, ['2026-09-28']))
    expect([...keys]).toEqual(['D:2026-10-01'])
  })
  it('a list starting on a month start has no boundary at index 0', () => {
    expect(monthStartKeys(cols('2026-06-01', 1)).size).toBe(0)
  })
  it('every day of an expanded week is accounted for', () => {
    const cs = buildColumns(['2026-09-28'], new Set(['2026-09-28']), new Map([['2026-09-28', daysOfWeek('2026-09-28')]]))
    expect([...monthStartKeys(cs)]).toEqual(['D:2026-10-01'])
  })
})

describe('monthLabel (th.grid.months)', () => {
  it('wide span → long "ตุลาคม 2569"', () => {
    expect(monthLabel('2026-10', MONTH_LABEL_LONG_MIN_W)).toEqual({ text: 'ตุลาคม 2569', full: 'ตุลาคม 2569' })
  })
  it('a single-column month gets the short label "ต.ค. 69"', () => {
    expect(monthLabel('2026-10', 64)).toEqual({ text: 'ต.ค. 69', full: 'ตุลาคม 2569' })
  })
  it('year boundary: มกราคม 2570 / ม.ค. 70', () => {
    expect(monthLabel('2027-01', 300).text).toBe('มกราคม 2570')
    expect(monthLabel('2027-01', 10).text).toBe('ม.ค. 70')
  })
  it('all twelve short labels', () => {
    const shorts = Array.from({ length: 12 }, (_, i) => monthLabel(`2026-${String(i + 1).padStart(2, '0')}`, 0).text)
    expect(shorts).toEqual([
      'ม.ค. 69', 'ก.พ. 69', 'มี.ค. 69', 'เม.ย. 69', 'พ.ค. 69', 'มิ.ย. 69',
      'ก.ค. 69', 'ส.ค. 69', 'ก.ย. 69', 'ต.ค. 69', 'พ.ย. 69', 'ธ.ค. 69',
    ])
  })
})

describe('visibleSpanWidth (§8.12: the month label fits what is on screen)', () => {
  const span = { key: '2026-11', startIdx: 4, endIdx: 8, left: 256, width: 320 }
  it('no view (unmeasured) → full width', () => {
    expect(visibleSpanWidth(span)).toBe(320)
    expect(visibleSpanWidth(span, null)).toBe(320)
  })
  it('a month mostly under the sticky "รวม" (768 px finding): only its on-screen part counts → short label', () => {
    const w = visibleSpanWidth(span, { from: 0, to: 320 })
    expect(w).toBe(64)
    expect(monthLabel('2026-11', w).text).not.toBe(monthLabel('2026-11', w).full)
  })
  it('scrolled under the frozen columns on the left', () => {
    expect(visibleSpanWidth(span, { from: 500, to: 1200 })).toBe(76)
  })
  it('fully inside / fully outside', () => {
    expect(visibleSpanWidth(span, { from: 0, to: 2000 })).toBe(320)
    expect(visibleSpanWidth(span, { from: 600, to: 900 })).toBe(0)
  })
})
