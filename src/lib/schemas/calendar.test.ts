import { describe, expect, it } from 'vitest'
import { th } from '@/i18n/th'
import { CALENDAR_MAX_DAYS, calendarQuerySchema } from './calendar'

describe('calendar query (M5-D8)', () => {
  it(`Mondays, to exclusive, at most ${CALENDAR_MAX_DAYS} days`, () => {
    expect(calendarQuerySchema.parse({ from: '2026-08-31', to: '2026-10-12' })).toEqual({
      from: '2026-08-31',
      to: '2026-10-12',
    })
    expect(calendarQuerySchema.safeParse({ from: '2026-09-28', to: '2026-10-05' }).success).toBe(true)
  })

  it.each([
    ['from not a Monday', '2026-09-01', '2026-10-12'],
    ['to not a Monday', '2026-08-31', '2026-10-13'],
    ['49 days', '2026-08-31', '2026-10-19'],
    ['to = from', '2026-08-31', '2026-08-31'],
    ['to before from', '2026-09-07', '2026-08-31'],
  ])('%s fails with th.errors.VALIDATION', (_label, from, to) => {
    const r = calendarQuerySchema.safeParse({ from, to })
    expect(r.success).toBe(false)
    expect(r.error?.issues[0]?.message).toBe(th.errors.VALIDATION)
  })

  it('malformed dates fail', () => {
    expect(calendarQuerySchema.safeParse({ from: '2026-8-31', to: '2026-10-12' }).success).toBe(false)
    expect(calendarQuerySchema.safeParse({ from: '2026-08-31' }).success).toBe(false)
  })
})
