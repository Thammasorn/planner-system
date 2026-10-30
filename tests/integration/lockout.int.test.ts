// FR-106 — 5 wrong passwords in 15 minutes per IP + email → temporary rejection with a Thai message (M1-D11).
// plan/m01-auth-employees.md §5.S4 (S4.3). Attempts go through auth.api.signInEmail (the login action's path); the
// same hooks guard the HTTP router.
import { and, count, eq, sql } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import { th } from '@/i18n/th'
import { login } from '@/server/actions/auth'
import { db } from '@/server/db/client'
import { authLoginFailures } from '@/server/db/schema'
import { signInApi, signInApiOutcome, signInHttp } from '../helpers/auth-http'
import { makeUser, TEST_PASSWORD } from '../helpers/factories'
import { setTestHeaders } from '../helpers/request'

const IP = '10.0.0.9'
const WRONG = 'Wrong-pass-123'

async function failures(email?: string, ip?: string): Promise<number> {
  const conds = [email ? eq(authLoginFailures.email, email) : undefined, ip ? eq(authLoginFailures.ip, ip) : undefined]
  const [row] = await db
    .select({ n: count() })
    .from(authLoginFailures)
    .where(and(...conds.filter((c) => c !== undefined)))
  return Number(row?.n ?? 0)
}

/** Five wrong passwords from `ip`; asserts each is a plain 401. */
async function failFiveTimes(email: string, ip = IP): Promise<void> {
  for (let i = 1; i <= 5; i++) expect(await signInApi(email, `${WRONG}-${i}`, ip), `attempt ${i}`).toBe('401:INVALID_EMAIL_OR_PASSWORD')
}

describe('lockout (FR-106)', () => {
  it('T-LOCK-01 five wrong passwords each fail with 401 and are recorded per IP + email', async () => {
    const u = await makeUser()
    await failFiveTimes(u.email)
    expect(await failures(u.email, IP)).toBe(5)
  })

  it('T-LOCK-02 the 6th attempt, even with the correct password, is LOGIN_LOCKED (429) with the Thai message', async () => {
    const u = await makeUser()
    await failFiveTimes(u.email)
    const o = await signInApiOutcome(u.email, TEST_PASSWORD, IP)
    expect(o).toMatchObject({ status: 429, code: 'LOGIN_LOCKED', message: th.auth.errors.LOGIN_LOCKED })
    // attempts while locked are not recorded (the lock ends 15 min after the 5th failure)
    expect(await failures(u.email, IP)).toBe(5)
  })

  it('T-LOCK-03 the same email from another IP is not locked', async () => {
    const u = await makeUser()
    await failFiveTimes(u.email)
    expect(await signInApi(u.email, TEST_PASSWORD, '10.0.0.10')).toBe('200')
  })

  it('T-LOCK-04 another email from the locked IP is not locked', async () => {
    const u = await makeUser()
    const other = await makeUser()
    await failFiveTimes(u.email)
    expect(await signInApi(other.email, TEST_PASSWORD, IP)).toBe('200')
  })

  it('T-LOCK-05 after 15 minutes the lock lifts; a success clears that key', async () => {
    const u = await makeUser()
    const other = await makeUser()
    await failFiveTimes(u.email)
    expect(await signInApi(other.email, 'Wrong-pass-other', IP)).toBe('401:INVALID_EMAIL_OR_PASSWORD')
    await db.execute(sql`update auth_login_failures set created_at = created_at - interval '16 minutes'`)
    expect(await signInApi(u.email, TEST_PASSWORD, IP)).toBe('200')
    expect(await failures(u.email, IP)).toBe(0)
    expect(await failures(other.email, IP)).toBe(1) // other keys are untouched
  })

  it('T-LOCK-06 the login server action is locked too (LOGIN_LOCKED)', async () => {
    const u = await makeUser()
    await failFiveTimes(u.email)
    setTestHeaders({ 'x-forwarded-for': IP })
    const res = await login({ email: u.email, password: TEST_PASSWORD })
    expect(res).toMatchObject({ ok: false, code: 'LOGIN_LOCKED', message: th.auth.errors.LOGIN_LOCKED })
  })

  it('T-LOCK-07 an unknown email accumulates failures and locks the same way (no enumeration)', async () => {
    const email = 'ghost@example.com'
    await failFiveTimes(email)
    expect(await failures(email, IP)).toBe(5)
    expect(await signInApi(email, WRONG, IP)).toBe('429:LOGIN_LOCKED')
  })

  it('T-LOCK-08 a deactivated user with the correct password gets ACCOUNT_DEACTIVATED and no failure is recorded', async () => {
    const u = await makeUser({ deactivated: { on: '2026-09-01' } })
    expect(await signInApi(u.email, TEST_PASSWORD, IP)).toBe('403:BANNED_USER')
    setTestHeaders({ 'x-forwarded-for': IP })
    const res = await login({ email: u.email, password: TEST_PASSWORD })
    expect(res).toMatchObject({
      ok: false,
      code: 'ACCOUNT_DEACTIVATED',
      message: th.auth.errors.ACCOUNT_DEACTIVATED,
    })
    expect(await failures(u.email)).toBe(0)
  })

  it('T-LOCK-01b the HTTP sign-in route is guarded by the same lock', async () => {
    const u = await makeUser()
    await failFiveTimes(u.email)
    const res = await signInHttp(u.email, TEST_PASSWORD, IP)
    expect(res.status).toBe(429)
    expect(((await res.json()) as { code?: string }).code).toBe('LOGIN_LOCKED')
  })
})
