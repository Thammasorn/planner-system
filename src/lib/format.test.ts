import { describe, expect, it, vi } from 'vitest'
import { th } from '@/i18n/th'
import {
  bangkokHour,
  formatHomeDate,
  formatLeaveRange,
  formatRelative,
  formatThaiDate,
  formatThaiDateRange,
  formatThaiDateSpan,
  formatThaiInstantDate,
  formatThaiMonthYear,
  formatWeekHeader,
} from './format'

describe('formatThaiDate', () => {
  it.each([
    ['2026-09-30', '30 ก.ย. 2569'],
    ['2026-12-28', '28 ธ.ค. 2569'],
    ['2027-01-04', '4 ม.ค. 2570'],
    ['2028-02-29', '29 ก.พ. 2571'],
  ])('%s → %s', (iso, expected) => {
    expect(formatThaiDate(iso)).toBe(expected)
  })

  it('formats the long style', () => {
    expect(formatThaiDate('2026-09-30', 'long')).toBe('30 กันยายน 2569')
  })

  it.each(['2026-02-30', '2026-9-30', '', '2026-13-01', '2027-02-29', '2026-09-30T00:00'])(
    'rejects %j with RangeError',
    (bad) => {
      expect(() => formatThaiDate(bad)).toThrow(RangeError)
    },
  )

  it('does not depend on the process time zone', () => {
    vi.stubEnv('TZ', 'America/Los_Angeles')
    expect(formatThaiDate('2026-09-30')).toBe('30 ก.ย. 2569')
  })
})

describe('formatWeekHeader', () => {
  it.each([
    ['2026-09-28', '28/9'],
    ['2027-01-04', '4/1'],
  ])('%s → %s', (iso, expected) => {
    expect(formatWeekHeader(iso)).toBe(expected)
  })

  it('rejects invalid dates', () => {
    expect(() => formatWeekHeader('2026-02-30')).toThrow(RangeError)
  })
})

describe('formatThaiInstantDate', () => {
  it.each([
    ['2026-09-29T23:30:00Z', '30 ก.ย. 2569'],
    ['2026-09-30T16:59:59Z', '30 ก.ย. 2569'],
    ['2026-09-30T17:00:00Z', '1 ต.ค. 2569'],
  ])('%s → %s (Asia/Bangkok)', (instant, expected) => {
    expect(formatThaiInstantDate(new Date(instant))).toBe(expected)
  })

  it('formats the long style', () => {
    expect(formatThaiInstantDate(new Date('2026-09-30T05:00:00Z'), 'long')).toBe('30 กันยายน 2569')
  })
})

describe('formatThaiDateRange / formatLeaveRange (M5)', () => {
  it('two dates joined by an en dash; the same day once', () => {
    expect(formatThaiDateRange('2026-10-05', '2026-10-06')).toBe('5 ต.ค. 2569 – 6 ต.ค. 2569')
    expect(formatThaiDateRange('2026-10-05', '2026-10-05')).toBe('5 ต.ค. 2569')
  })

  it('half days add th.timeOff.halfLong in parentheses', () => {
    expect(formatLeaveRange('2026-10-20', '2026-10-20', 'AM')).toBe(
      `20 ต.ค. 2569 (${th.timeOff.halfLong.AM})`,
    )
    expect(formatLeaveRange('2026-10-20', '2026-10-20', 'AM')).toBe('20 ต.ค. 2569 (ครึ่งวันเช้า)')
    expect(formatLeaveRange('2026-10-20', '2026-10-20', 'PM')).toBe('20 ต.ค. 2569 (ครึ่งวันบ่าย)')
    expect(formatLeaveRange('2026-12-28', '2027-01-04', null)).toBe('28 ธ.ค. 2569 – 4 ม.ค. 2570')
  })

  it('invalid ISO → RangeError', () => {
    expect(() => formatThaiDateRange('2026-02-30', '2026-03-01')).toThrow(RangeError)
    expect(() => formatLeaveRange('2026-10-20', 'x', null)).toThrow(RangeError)
  })
})

describe('M10 helpers (bangkokHour, formatHomeDate, formatRelative)', () => {
  it('bangkokHour is the Asia/Bangkok wall-clock hour', () => {
    expect(bangkokHour(new Date('2026-09-30T03:00:00Z'))).toBe(10)
    expect(bangkokHour(new Date('2026-09-30T16:59:00Z'))).toBe(23)
    expect(bangkokHour(new Date('2026-09-30T17:00:00Z'))).toBe(0)
  })

  it('formatHomeDate = short Thai weekday + medium date', () => {
    expect(formatHomeDate('2026-09-30')).toBe('พุธ 30 ก.ย. 2569')
    const weekdayShort = new Intl.DateTimeFormat('th-TH', { weekday: 'short', timeZone: 'UTC' }).format(
      new Date('2027-01-01T00:00:00Z'),
    )
    expect(formatHomeDate('2027-01-01')).toBe(`${weekdayShort} ${formatThaiDate('2027-01-01', 'medium')}`)
    expect(() => formatHomeDate('2026-02-30')).toThrow(RangeError)
  })

  it('formatRelative: minutes, hours, days, then a date', () => {
    const now = '2026-09-30T10:00:00+07:00'
    const two = formatRelative('2026-09-30T08:00:00+07:00', now)
    expect(two).toContain('2')
    expect(two).toContain('ชม.')
    expect(formatRelative('2026-09-30T09:55:00+07:00', now)).toContain('5')
    expect(formatRelative('2026-09-28T10:00:00+07:00', now)).not.toBe(two)
    expect(formatRelative('2026-08-01T10:00:00+07:00', now)).toBe(
      formatThaiInstantDate(new Date('2026-08-01T10:00:00+07:00'), 'medium'),
    )
    // a future instant (clock skew) never shows a negative distance
    expect(formatRelative('2026-09-30T10:00:30+07:00', now)).toBe(formatRelative(now, now))
  })
})

describe('formatThaiMonthYear (M11, FR-1441)', () => {
  it.each([
    ['2026-11-01', 'พฤศจิกายน 2569'],
    ['2026-11-30', 'พฤศจิกายน 2569'],
    ['2027-01-01', 'มกราคม 2570'],
    ['2026-02-01', 'กุมภาพันธ์ 2569'],
  ])('%s → %s', (iso, expected) => {
    expect(formatThaiMonthYear(iso)).toBe(expected)
  })

  it('rejects invalid dates and ignores the process time zone', () => {
    expect(() => formatThaiMonthYear('2026-02-30')).toThrow(RangeError)
    vi.stubEnv('TZ', 'Pacific/Honolulu')
    expect(formatThaiMonthYear('2026-11-01')).toBe('พฤศจิกายน 2569')
  })
})

describe('formatThaiDateSpan (v3.7 database date ranges)', () => {
  it.each([
    ['2026-11-03', '2026-11-07', '3–7 พ.ย. 2569'],
    ['2026-11-30', '2026-12-04', '30 พ.ย. – 4 ธ.ค. 2569'],
    ['2026-12-30', '2027-01-02', '30 ธ.ค. 2569 – 2 ม.ค. 2570'],
    ['2026-11-03', '2026-11-03', '3 พ.ย. 2569'],
  ])('%s … %s → %s', (a, b, want) => expect(formatThaiDateSpan(a, b)).toBe(want))
})
