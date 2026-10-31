import { describe, expect, it } from 'vitest'
import { th } from '@/i18n/th'
import {
  createHolidaySchema,
  HOLIDAY_IMPORT_MAX,
  importHolidaysSchema,
  restoreHolidaySchema,
  updateHolidaySchema,
} from './holidays'

const id = '0b6c1b5e-6a51-4c4b-9e1a-2f0a8d7c3b21'
const firstMessage = (r: { error?: { issues: { message: string }[] } }) => r.error?.issues[0]?.message

describe('holiday schemas (FR-901, M5-D11)', () => {
  it('trims and NFC-normalises the name', () => {
    expect(createHolidaySchema.parse({ date: '2026-10-23', name: '  วันปิยมหาราช  ' }).name).toBe(
      'วันปิยมหาราช',
    )
    const decomposed = 'Café'
    expect(createHolidaySchema.parse({ date: '2026-10-23', name: decomposed }).name).toBe('Café')
  })

  it('name required, ≤ 200 chars; dates must be real ISO dates', () => {
    expect(firstMessage(createHolidaySchema.safeParse({ date: '2026-10-23', name: '' }))).toBe(
      th.holidays.errors.nameRequired,
    )
    expect(firstMessage(createHolidaySchema.safeParse({ date: '2026-10-23', name: 'ก'.repeat(201) }))).toBe(
      th.holidays.errors.nameTooLong,
    )
    expect(createHolidaySchema.safeParse({ date: '2026-10-23', name: 'ก'.repeat(200) }).success).toBe(true)
    expect(firstMessage(createHolidaySchema.safeParse({ date: '2026-02-30', name: 'x' }))).toBe(
      th.holidays.errors.invalidDate,
    )
  })

  it('update / restore need a uuid id', () => {
    expect(updateHolidaySchema.safeParse({ date: '2026-10-23', name: 'x' }).success).toBe(false)
    expect(restoreHolidaySchema.parse({ id, date: '2026-10-23', name: 'x' })).toEqual({
      id,
      date: '2026-10-23',
      name: 'x',
    })
  })

  it(`import: 1…${HOLIDAY_IMPORT_MAX} rows with unique dates`, () => {
    expect(firstMessage(importHolidaysSchema.safeParse({ rows: [] }))).toBe(th.holidays.import.errors.empty)
    const rows = Array.from({ length: 501 }, (_, i) => ({
      date: `2${String(100 + Math.floor(i / 28)).padStart(3, '0')}-01-${String((i % 28) + 1).padStart(2, '0')}`,
      name: `วัน ${i}`,
    }))
    expect(firstMessage(importHolidaysSchema.safeParse({ rows }))).toBe(
      th.holidays.import.errors.tooMany(500),
    )
    expect(importHolidaysSchema.safeParse({ rows: rows.slice(0, 500) }).success).toBe(true)
    expect(
      firstMessage(
        importHolidaysSchema.safeParse({
          rows: [
            { date: '2026-10-23', name: 'a' },
            { date: '2026-10-23', name: 'b' },
          ],
        }),
      ),
    ).toBe(th.holidays.import.errors.duplicateAny)
  })
})
