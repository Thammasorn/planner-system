// FR-105, FR-107 — change own password; sign out everywhere. plan/m01-auth-employees.md §5.S4 (S4.6).
import { count, eq } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import { th } from '@/i18n/th'
import { changeOwnPassword, signOutEverywhere } from '@/server/actions/auth'
import { db } from '@/server/db/client'
import { session } from '@/server/db/schema'
import { asUser } from '../helpers/as-user'
import { auditCount, auditRowsAfter } from '../helpers/audit'
import { getSessionByCookie, signInApi, signInCookie } from '../helpers/auth-http'
import { makeUser, TEST_PASSWORD } from '../helpers/factories'

const NEW_PASSWORD = 'Brand-new-pass-7'

function change(currentPassword: string, newPassword: string) {
  return changeOwnPassword({ currentPassword, newPassword, confirmPassword: newPassword })
}

async function sessionCount(userId: string): Promise<number> {
  const [row] = await db.select({ n: count() }).from(session).where(eq(session.userId, userId))
  return Number(row?.n ?? 0)
}

describe('own account (FR-105, FR-107)', () => {
  it('T-ACC-01 a wrong current password → INVALID_PASSWORD on currentPassword', async () => {
    asUser(await makeUser())
    const res = await change('Not-the-pass-1', NEW_PASSWORD)
    expect(res).toMatchObject({ ok: false, code: 'INVALID_PASSWORD' })
    if (res.ok) return
    expect(res.fieldErrors?.currentPassword).toEqual([th.errors.INVALID_PASSWORD])
  })

  it('T-ACC-02 a new password shorter than 8 → VALIDATION (TOO_SHORT)', async () => {
    asUser(await makeUser())
    const res = await change(TEST_PASSWORD, 'Short1')
    expect(res).toMatchObject({ ok: false, code: 'VALIDATION' })
    if (res.ok) return
    expect(res.fieldErrors?.newPassword).toContain(th.account.policy.TOO_SHORT)
  })

  it('T-ACC-03 a new password equal to the email local part → VALIDATION (EQUALS_EMAIL)', async () => {
    const u = await makeUser({ email: 'longname.person@example.com' })
    asUser(u)
    const res = await change(TEST_PASSWORD, 'LongName.Person')
    expect(res).toMatchObject({ ok: false, code: 'VALIDATION' })
    if (res.ok) return
    expect(res.fieldErrors?.newPassword).toContain(th.account.policy.EQUALS_EMAIL)
    const whole = await change(TEST_PASSWORD, 'longname.person@example.com')
    expect(whole).toMatchObject({ ok: false, code: 'VALIDATION' })
  })

  it('T-ACC-04 a new password equal to the current one → VALIDATION (SAME_AS_CURRENT)', async () => {
    asUser(await makeUser())
    const res = await change(TEST_PASSWORD, TEST_PASSWORD)
    expect(res).toMatchObject({ ok: false, code: 'VALIDATION' })
    if (res.ok) return
    expect(res.fieldErrors?.newPassword).toContain(th.account.policy.SAME_AS_CURRENT)
  })

  it('T-ACC-05 success: old password rejected, new accepted, one audit row without any password', async () => {
    const u = await makeUser()
    asUser(u)
    const before = await auditCount()
    const res = await change(TEST_PASSWORD, NEW_PASSWORD)
    expect(res.ok, JSON.stringify(res)).toBe(true)
    expect(await signInApi(u.email, TEST_PASSWORD)).toBe('401:INVALID_EMAIL_OR_PASSWORD')
    expect(await signInApi(u.email, NEW_PASSWORD)).toBe('200')
    const rows = await auditRowsAfter(before)
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ entity: 'user', entityId: u.id, actorId: u.id, after: { passwordChanged: true } })
    const serialized = JSON.stringify(rows[0])
    expect(serialized.includes(TEST_PASSWORD)).toBe(false)
    expect(serialized.includes(NEW_PASSWORD)).toBe(false)
  })

  it('T-ACC-06 signOutEverywhere ends all 3 sessions; old cookies stop working; one audit row', async () => {
    const u = await makeUser() // raw session #1 (the actor's current one)
    const cookieA = await signInCookie(u.email, TEST_PASSWORD) // #2
    const cookieB = await signInCookie(u.email, TEST_PASSWORD) // #3
    expect(await sessionCount(u.id)).toBe(3)
    asUser(u)
    const before = await auditCount()
    const res = await signOutEverywhere({})
    expect(res).toMatchObject({ ok: true, redirectTo: '/login' })
    expect(await sessionCount(u.id)).toBe(0)
    expect(await getSessionByCookie(cookieA)).toBeNull()
    expect(await getSessionByCookie(cookieB)).toBeNull()
    const rows = await auditRowsAfter(before)
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ entity: 'user', entityId: u.id, actorId: u.id })
  })
})
