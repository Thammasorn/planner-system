// FR-101, FR-103, AC-102, NFR-08a/b — login, sign-up disabled, cookies, session lifetime, password hashing.
// plan/m01-auth-employees.md §5.S4 (S4.2).
import { verifyPassword } from 'better-auth/crypto'
import { count, eq } from 'drizzle-orm'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { th } from '@/i18n/th'
import { login } from '@/server/actions/auth'
import { createEmployee } from '@/server/actions/employees'
import { auth } from '@/server/auth'
import { db } from '@/server/db/client'
import { account, session, user } from '@/server/db/schema'
import { asUser } from '../helpers/as-user'
import { authRequest, signInHttp } from '../helpers/auth-http'
import { makeUser, TEST_PASSWORD } from '../helpers/factories'

const DAY_MS = 24 * 60 * 60 * 1000

async function userCount(): Promise<number> {
  const [row] = await db.select({ n: count() }).from(user)
  return Number(row?.n ?? 0)
}

describe('auth (FR-101, FR-103, AC-102, NFR-08)', () => {
  it('T-AUTH-01 POST /api/auth/sign-up/email is rejected (404) and creates nobody; auth.api.signUpEmail rejects too (AC-102)', async () => {
    await makeUser({ role: 'manager' })
    const before = await userCount()
    const res = await authRequest('/sign-up/email', {
      body: { email: 'new-person@example.com', password: 'Abcdef-123', name: 'New Person' },
    })
    expect(res.status).toBe(404)
    expect(await userCount()).toBe(before)

    const viaApi = auth.api.signUpEmail({
      body: { email: 'api-person@example.com', password: 'Abcdef-123', name: 'Api Person' },
    })
    await expect(viaApi).rejects.toSatisfy((e: unknown) => {
      const err = e as { statusCode?: number; body?: { code?: string } }
      return err.body?.code === 'EMAIL_PASSWORD_SIGN_UP_DISABLED' || err.statusCode === 404
    })
    expect(await userCount()).toBe(before)
  })

  it('T-AUTH-02 the login action trims and lowercases the email', async () => {
    await makeUser({ email: 'cindy@example.com' })
    const res = await login({ email: '  CINDY@example.com ', password: TEST_PASSWORD })
    expect(res).toEqual({ ok: true, redirectTo: '/home' })
  })

  it('T-AUTH-03 wrong password and unknown email give the same INVALID_CREDENTIALS result (no enumeration)', async () => {
    await makeUser({ email: 'cindy@example.com' })
    const wrong = await login({ email: 'cindy@example.com', password: 'Wrong-pass-123' })
    expect(wrong).toEqual({
      ok: false,
      code: 'INVALID_CREDENTIALS',
      message: th.auth.errors.INVALID_CREDENTIALS,
    })
    const unknown = await login({ email: 'nobody@example.com', password: 'Wrong-pass-123' })
    expect(unknown).toEqual(wrong)
  })

  it('T-AUTH-04 the session cookie is HttpOnly, SameSite=Lax, Path=/, Max-Age=604800 and not Secure (SECURE_COOKIES=false)', async () => {
    const u = await makeUser()
    const res = await signInHttp(u.email, TEST_PASSWORD)
    expect(res.status).toBe(200)
    const cookie = res.headers.getSetCookie().find((c) => c.startsWith('better-auth.session_token='))
    expect(cookie, res.headers.getSetCookie().join(' | ')).toBeDefined()
    const attrs = cookie!.split(';').map((s) => s.trim().toLowerCase())
    expect(attrs).toContain('httponly')
    expect(attrs).toContain('samesite=lax')
    expect(attrs).toContain('path=/')
    expect(attrs).toContain('max-age=604800')
    expect(attrs).not.toContain('secure')
  })

  describe('with SECURE_COOKIES=true', () => {
    // auth.ts reads SECURE_COOKIES at import: re-import it. The DB pool lives on globalThis, so no second pool opens.
    afterEach(() => {
      vi.resetModules()
    })

    it('T-AUTH-04b the cookie is __Secure-better-auth.session_token with Secure (NFR-08b)', async () => {
      const u = await makeUser()
      vi.resetModules()
      vi.stubEnv('SECURE_COOKIES', 'true')
      const { auth: secureAuth } = await import('@/server/auth')
      const res = await secureAuth.handler(
        new Request('http://localhost:3100/api/auth/sign-in/email', {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            origin: 'http://localhost:3100',
            'x-forwarded-for': '10.0.0.2',
          },
          body: JSON.stringify({ email: u.email, password: TEST_PASSWORD }),
        }),
      )
      expect(res.status).toBe(200)
      const cookie = res.headers
        .getSetCookie()
        .find((c) => c.startsWith('__Secure-better-auth.session_token='))
      expect(cookie, res.headers.getSetCookie().join(' | ')).toBeDefined()
      expect(cookie!.split(';').map((s) => s.trim().toLowerCase())).toContain('secure')
    })
  })

  it('T-AUTH-05 a new session expires 7 days after sign-in (FR-103)', async () => {
    const u = await makeUser()
    await db.delete(session).where(eq(session.userId, u.id)) // keep only the HTTP sign-in's session
    const res = await signInHttp(u.email, TEST_PASSWORD)
    expect(res.status).toBe(200)
    const rows = await db.select({ expiresAt: session.expiresAt }).from(session).where(eq(session.userId, u.id))
    expect(rows).toHaveLength(1)
    const delta = rows[0]!.expiresAt.getTime() - (Date.now() + 7 * DAY_MS)
    expect(Math.abs(delta)).toBeLessThan(60_000)
  })

  it('T-AUTH-06 an employee password is stored as Better Auth scrypt (salt:key hex) and verifies (NFR-08a)', async () => {
    const manager = await makeUser({ role: 'manager' })
    asUser(manager)
    const created = await createEmployee({
      name: 'Hash Check',
      email: 'hash-check@example.com',
      positionId: null,
      role: 'worker',
      password: 'Hash-check-123',
    })
    expect(created.ok).toBe(true)
    if (!created.ok) return
    const [acc] = await db
      .select({ password: account.password })
      .from(account)
      .where(eq(account.userId, created.userId))
    expect(acc?.password).toMatch(/^[0-9a-f]{32}:[0-9a-f]{128}$/)
    expect(await verifyPassword({ hash: acc!.password!, password: 'Hash-check-123' })).toBe(true)
    expect(await verifyPassword({ hash: acc!.password!, password: 'hash-check-123' })).toBe(false)
  })
})
