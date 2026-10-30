import { describe, expect, it } from 'vitest'
import { th } from '@/i18n/th'
import { createEmployeeInput, DEFAULT_SCHEDULE, scheduleInput, updateEmployeeInput } from './employees'

const VALID = {
  name: 'Nok Test',
  email: 'Nok@Example.com',
  positionId: null,
  role: 'worker' as const,
  password: 'Start-pass-99',
}
const UUID = '0b6c1b5e-6a51-4c4b-9e1a-2f0a8d7c3b21'

describe('employee schemas (FR-201…FR-207)', () => {
  it('U-SCH-09 schedule rules, defaults and strict UUIDs', () => {
    expect(scheduleInput.safeParse([]).error?.issues[0]?.message).toBe(th.employees.schedule.atLeastOneDay)
    expect(
      scheduleInput.safeParse([
        { weekday: 1, fractionCd: 100 },
        { weekday: 1, fractionCd: 50 },
      ]).success,
    ).toBe(false)
    expect(scheduleInput.safeParse([{ weekday: 1, fractionCd: 30 }]).success).toBe(false)
    expect(scheduleInput.safeParse([{ weekday: 8, fractionCd: 100 }]).success).toBe(false)

    const parsed = createEmployeeInput.parse(VALID)
    expect(parsed.schedule).toEqual(DEFAULT_SCHEDULE)
    expect(parsed.mustChangePassword).toBe(true) // FR-203
    expect(parsed.email).toBe('nok@example.com')

    expect(
      createEmployeeInput.safeParse({ ...VALID, positionId: '11111111-1111-1111-1111-111111111111' }).success,
    ).toBe(false)
    expect(createEmployeeInput.safeParse({ ...VALID, positionId: UUID }).success).toBe(true)
  })

  it('createEmployeeInput applies the password policy against the email', () => {
    const r = createEmployeeInput.safeParse({ ...VALID, password: 'nok' })
    expect(r.error?.issues.map((i) => [i.path[0], i.message])).toEqual([
      ['password', th.account.policy.TOO_SHORT],
      ['password', th.account.policy.EQUALS_EMAIL],
    ])
    expect(createEmployeeInput.safeParse({ ...VALID, name: '  ' }).error?.issues[0]?.message).toBe(
      th.employees.nameRequired,
    )
    expect(createEmployeeInput.safeParse({ ...VALID, color: '#000000' }).success).toBe(false)
    expect(createEmployeeInput.safeParse({ ...VALID, color: '#2F5597' }).success).toBe(true)
  })

  it('updateEmployeeInput requires the schedule and a userId', () => {
    const base = {
      userId: UUID,
      name: 'A',
      email: 'a@example.com',
      positionId: null,
      role: 'manager' as const,
    }
    expect(updateEmployeeInput.safeParse(base).success).toBe(false)
    expect(
      updateEmployeeInput.safeParse({ ...base, schedule: [{ weekday: 1, fractionCd: 50 }] }).success,
    ).toBe(true)
  })
})
