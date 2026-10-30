import { eq } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import { th } from '@/i18n/th'
import { db } from '@/server/db/client'
import { session } from '@/server/db/schema'
import { asUser } from '../../../tests/helpers/as-user'
import { makeUser, TEST_PASSWORD } from '../../../tests/helpers/factories'
import { getSetCookies, testCookieJar } from '../../../tests/helpers/request'
import { login, logout } from './auth'

const COOKIE = 'better-auth.session_token'

describe('login / logout actions (FR-101, M1-D7, M1-D12)', () => {
  it('T-LOGIN-01 login sets the session cookie and returns { redirectTo }; next is sanitised; mustChange → /account/password', async () => {
    const u = await makeUser({ email: 'cindy@example.com' })
    const res = await login({ email: '  CINDY@example.com ', password: TEST_PASSWORD })
    expect(res).toEqual({ ok: true, redirectTo: '/home' })
    expect(testCookieJar().get(COOKIE)?.value).toBeTruthy()
    const sessions = await db.select({ id: session.id }).from(session).where(eq(session.userId, u.id))
    expect(sessions).toHaveLength(2) // the factory's + this sign-in

    expect(await login({ email: u.email, password: TEST_PASSWORD, next: '//evil.example.com' })).toEqual({
      ok: true,
      redirectTo: '/home',
    })
    expect(await login({ email: u.email, password: TEST_PASSWORD, next: '/settings/employees' })).toEqual({
      ok: true,
      redirectTo: '/settings/employees',
    })

    const m = await makeUser({ mustChangePassword: true })
    expect(await login({ email: m.email, password: TEST_PASSWORD })).toEqual({
      ok: true,
      redirectTo: '/account/password',
    })
    expect(await login({ email: m.email, password: TEST_PASSWORD, next: '/settings/positions' })).toEqual({
      ok: true,
      redirectTo: '/account/password?next=%2Fsettings%2Fpositions',
    })
  })

  it('maps Better Auth errors to Thai codes (wrong password, unknown email, deactivated)', async () => {
    const u = await makeUser()
    expect(await login({ email: u.email, password: 'wrong-password' })).toEqual({
      ok: false,
      code: 'INVALID_CREDENTIALS',
      message: th.auth.errors.INVALID_CREDENTIALS,
    })
    expect(await login({ email: 'nobody@example.com', password: 'whatever-1' })).toMatchObject({
      ok: false,
      code: 'INVALID_CREDENTIALS',
    })
    const d = await makeUser({ deactivated: { on: '2026-09-01' } })
    expect(await login({ email: d.email, password: TEST_PASSWORD })).toEqual({
      ok: false,
      code: 'ACCOUNT_DEACTIVATED',
      message: th.auth.errors.ACCOUNT_DEACTIVATED,
    })
    expect(getSetCookies().get(COOKIE)).toBeUndefined()
  })

  it('logout deletes the current session and clears the cookie (allowed while mustChangePassword)', async () => {
    const u = await makeUser({ mustChangePassword: true })
    expect((await login({ email: u.email, password: TEST_PASSWORD })).ok).toBe(true)
    const before = await db.select({ id: session.id }).from(session).where(eq(session.userId, u.id))
    asUser(u, { mustChangePassword: true })
    expect(await logout({})).toEqual({ ok: true, redirectTo: '/login' })
    const after = await db.select({ id: session.id }).from(session).where(eq(session.userId, u.id))
    expect(after).toHaveLength(before.length - 1)
    expect(testCookieJar().get(COOKIE)).toBeUndefined()
  })
})
