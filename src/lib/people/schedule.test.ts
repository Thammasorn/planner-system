import { describe, expect, it } from 'vitest'
import { th } from '@/i18n/th'
import { formatSchedule } from './schedule'

describe('formatSchedule (FR-1008 header, M9-D14)', () => {
  it('Mon–Fri all 1.00 → จ–ศ · 1.00 วัน/วัน', () => {
    expect(formatSchedule({ 1: 100, 2: 100, 3: 100, 4: 100, 5: 100 })).toBe(
      th.people.schedule.perDay('จ–ศ', '1.00'),
    )
  })

  it('Mon–Fri all 0.50 → perDay with 0.50', () => {
    expect(formatSchedule({ 1: 50, 2: 50, 3: 50, 4: 50, 5: 50 })).toBe(
      th.people.schedule.perDay('จ–ศ', '0.50'),
    )
  })

  it('other schedules list each working day', () => {
    expect(formatSchedule({ 1: 100, 3: 100, 5: 100 })).toBe('จ 1.00 · พ 1.00 · ศ 1.00')
    expect(formatSchedule({ 1: 100, 2: 100, 3: 100, 4: 100, 5: 100, 6: 50 })).toBe(
      'จ 1.00 · อ 1.00 · พ 1.00 · พฤ 1.00 · ศ 1.00 · ส 0.50',
    )
  })

  it('zero days are skipped; none → ไม่มีวันทำงาน', () => {
    expect(formatSchedule({})).toBe(th.people.schedule.none)
    expect(formatSchedule({ 1: 0, 2: 0 })).toBe(th.people.schedule.none)
    expect(formatSchedule({ 2: 0, 4: 75 })).toBe('พฤ 0.75')
  })
})
