import { describe, expect, it } from 'vitest'
import { th } from '@/i18n/th'
import { changePasswordInput, loginInput, passwordPolicy, PASSWORD_MAX, PASSWORD_MIN } from './account'

describe('passwordPolicy (X60)', () => {
  it("U-SCH-01 passwordPolicy('short', {email:'a@x.co'})=['TOO_SHORT']", () => {
    expect(passwordPolicy('short', { email: 'a@x.co' })).toEqual(['TOO_SHORT'])
    expect(PASSWORD_MIN).toBe(8)
    expect(passwordPolicy('', { email: '' })).toEqual(['TOO_SHORT'])
  })

  it("U-SCH-02 'x'.repeat(129) → ['TOO_LONG']", () => {
    expect(passwordPolicy('x'.repeat(129), { email: 'a@x.co' })).toEqual(['TOO_LONG'])
    expect(passwordPolicy('x'.repeat(PASSWORD_MAX), { email: 'a@x.co' })).toEqual([])
  })

  it('counts code points, not UTF-16 units', () => {
    expect(passwordPolicy('😀'.repeat(8), { email: '' })).toEqual([])
    expect(passwordPolicy('😀'.repeat(7), { email: '' })).toEqual(['TOO_SHORT'])
  })

  it("U-SCH-03 ' Cindy@Example.com ' with email 'cindy@example.com' → ['EQUALS_EMAIL']", () => {
    expect(passwordPolicy(' Cindy@Example.com ', { email: 'cindy@example.com' })).toEqual(['EQUALS_EMAIL'])
  })

  it("U-SCH-04 'Cindy12345' with email 'cindy12345@example.com' (local part) → ['EQUALS_EMAIL']; email '' → no email check", () => {
    expect(passwordPolicy('Cindy12345', { email: 'cindy12345@example.com' })).toEqual(['EQUALS_EMAIL'])
    expect(passwordPolicy('Cindy12345', { email: ' CHI12345@Example.com ' })).toEqual(['EQUALS_EMAIL'])
    expect(passwordPolicy('Cindy12345', { email: '' })).toEqual([])
  })

  it("U-SCH-05 'demo1234' vs cindy@example.com → []", () => {
    expect(passwordPolicy('demo1234', { email: 'cindy@example.com' })).toEqual([])
  })

  it("U-SCH-06 same as current → ['SAME_AS_CURRENT']", () => {
    expect(passwordPolicy('Start-pass-99', { email: '', currentPassword: 'Start-pass-99' })).toEqual([
      'SAME_AS_CURRENT',
    ])
    expect(passwordPolicy('short', { email: 'short@x.co', currentPassword: 'short' })).toEqual([
      'TOO_SHORT',
      'EQUALS_EMAIL',
      'SAME_AS_CURRENT',
    ])
  })
})

describe('changePasswordInput / loginInput', () => {
  it('U-SCH-07 changePasswordInput confirm mismatch → issue on confirmPassword', () => {
    const r = changePasswordInput.safeParse({
      currentPassword: 'old-pass-1',
      newPassword: 'New-pass-2026',
      confirmPassword: 'New-pass-2027',
    })
    expect(r.success).toBe(false)
    const issue = r.error?.issues.find((i) => i.path[0] === 'confirmPassword')
    expect(issue?.message).toBe(th.account.policy.MISMATCH)
  })

  it('changePasswordInput applies the policy to newPassword (no email at schema level)', () => {
    const r = changePasswordInput.safeParse({
      currentPassword: 'same-pass-1',
      newPassword: 'same-pass-1',
      confirmPassword: 'same-pass-1',
    })
    expect(r.success).toBe(false)
    expect(r.error?.issues.map((i) => [i.path[0], i.message])).toEqual([
      ['newPassword', th.account.policy.SAME_AS_CURRENT],
    ])
    const short = changePasswordInput.safeParse({
      currentPassword: 'x',
      newPassword: 'abc',
      confirmPassword: 'abc',
    })
    expect(short.error?.issues.map((i) => i.message)).toContain(th.account.policy.TOO_SHORT)
    const ok = changePasswordInput.safeParse({
      currentPassword: 'x',
      newPassword: 'Nok-pass-2026',
      confirmPassword: 'Nok-pass-2026',
    })
    expect(ok.success).toBe(true)
  })

  it("U-SCH-08 loginInput.parse({ email: '  Cindy@Example.COM ', password: 'x' }).email === 'cindy@example.com'", () => {
    expect(loginInput.parse({ email: '  Cindy@Example.COM ', password: 'x' }).email).toBe('cindy@example.com')
    const empty = loginInput.safeParse({ email: 'cindy@example.com', password: '' })
    expect(empty.error?.issues[0]?.message).toBe(th.auth.passwordRequired)
    const bad = loginInput.safeParse({ email: 'not-an-email', password: 'x' })
    expect(bad.error?.issues[0]?.message).toBe(th.employees.emailInvalid)
  })
})
