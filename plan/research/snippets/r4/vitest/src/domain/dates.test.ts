import { test as fcTest, fc } from '@fast-check/vitest'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { addDays, isoWeekday, todayBangkok, weekStart } from './dates'

afterEach(() => {
  vi.useRealTimers()
})

describe('todayBangkok', () => {
  it('23:30 UTC is already the next day in Bangkok (fake timers + setSystemTime)', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-09-29T23:30:00Z'))
    expect(todayBangkok()).toBe('2026-09-30')
  })
  it('setSystemTime without fake timers mocks only Date', () => {
    vi.setSystemTime('2026-09-30T03:00:00Z')
    expect(todayBangkok()).toBe('2026-09-30')
    expect(vi.getMockedSystemTime()?.toISOString()).toBe('2026-09-30T03:00:00.000Z')
    vi.useRealTimers()
  })
})

describe('weekStart', () => {
  it('handles year boundary', () => {
    expect(weekStart('2027-01-03')).toBe('2026-12-28')
    expect(weekStart('2026-12-28')).toBe('2026-12-28')
  })
  // fast-check through the vitest adapter
  fcTest.prop([fc.integer({ min: 0, max: 3650 })])('is a Monday within the previous 6 days', (n) => {
    const d = addDays('2026-01-01', n)
    const ws = weekStart(d)
    expect(isoWeekday(ws)).toBe(1)
    expect(ws <= d && addDays(ws, 6) >= d).toBe(true)
  })
  // plain fast-check API
  it('fc.assert + fc.property', () => {
    fc.assert(
      fc.property(fc.integer({ min: -5000, max: 5000 }), fc.integer({ min: -60, max: 60 }), (a, b) => {
        expect(addDays(addDays('2026-09-30', a), b)).toBe(addDays('2026-09-30', a + b))
      }),
      { numRuns: 200 },
    )
  })
})
