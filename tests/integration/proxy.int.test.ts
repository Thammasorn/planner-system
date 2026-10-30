// FR-103, AC-101, AC-103, R18 — the DB-validating proxy session gate with sliding renewal.
// plan/m01-auth-employees.md §5.S4 (S4.4). Calls proxy() directly with real signed cookies.
import { eq, sql } from 'drizzle-orm'
import { NextRequest } from 'next/server'
import { describe, expect, it } from 'vitest'
import { db } from '@/server/db/client'
import { session } from '@/server/db/schema'
import { proxy } from '@/proxy'
import { sessionTokenFromCookie, signInCookie } from '../helpers/auth-http'
import { makeUser, TEST_PASSWORD } from '../helpers/factories'

const BASE = 'http://localhost:3100'
const DAY_MS = 24 * 60 * 60 * 1000

async function visit(pathAndQuery: string, cookie?: string): Promise<Response> {
  const headers = new Headers({ accept: 'text/html' })
  if (cookie) headers.set('cookie', cookie)
  return proxy(new NextRequest(new URL(pathAndQuery, BASE), { headers }))
}

function location(res: Response): string | null {
  const loc = res.headers.get('location')
  if (!loc) return null
  const u = new URL(loc, BASE)
  return u.pathname + u.search
}

function sessionCookies(res: Response): string[] {
  return res.headers.getSetCookie().filter((c) => c.startsWith('better-auth.session_token='))
}

async function expiresAt(token: string): Promise<Date> {
  const [row] = await db.select({ e: session.expiresAt }).from(session).where(eq(session.token, token))
  if (!row) throw new Error('session row missing')
  return row.e
}

/** A real sign-in with only the HTTP session left for the user. */
async function signedIn(o: { mustChangePassword?: boolean } = {}) {
  const u = await makeUser(o)
  await db.delete(session).where(eq(session.userId, u.id))
  const cookie = await signInCookie(u.email, TEST_PASSWORD)
  return { user: u, cookie, token: sessionTokenFromCookie(cookie) }
}

describe('proxy session gate (FR-103, AC-101, AC-103)', () => {
  it('T-SESS-01 without a session: / and /home → /login, deeper pages → /login?next=…', async () => {
    const root = await visit('/')
    expect(root.status).toBe(307)
    expect(location(root)).toBe('/login')
    const home = await visit('/home')
    expect(home.status).toBe(307)
    expect(location(home)).toBe('/login')
    const employees = await visit('/settings/employees')
    expect(employees.status).toBe(307)
    expect(location(employees)).toBe('/login?next=%2Fsettings%2Femployees')
  })

  it('T-SESS-02 a valid cookie passes with the CSP header; /login is public', async () => {
    const { cookie } = await signedIn()
    const res = await visit('/home', cookie)
    expect(res.status).not.toBe(307)
    expect(res.headers.get('location')).toBeNull()
    expect(res.headers.get('content-security-policy')).toContain("'nonce-")
    const loginPage = await visit('/login')
    expect(loginPage.headers.get('location')).toBeNull()
    expect(loginPage.headers.get('content-security-policy')).toContain("'nonce-")
  })

  it('T-SESS-03 mustChangePassword: every page except /account/password → /account/password (AC-103)', async () => {
    const { cookie } = await signedIn({ mustChangePassword: true })
    const deep = await visit('/settings/employees', cookie)
    expect(deep.status).toBe(307)
    expect(location(deep)).toBe('/account/password?next=%2Fsettings%2Femployees')
    const home = await visit('/home', cookie)
    expect(home.status).toBe(307)
    expect(location(home)).toBe('/account/password')
    const own = await visit('/account/password', cookie)
    expect(own.headers.get('location')).toBeNull()
  })

  it('T-SESS-04 a session last renewed 2 days ago is extended to now + 7 d and the cookie is re-sent (FR-103)', async () => {
    const { cookie, token } = await signedIn()
    await db.execute(sql`update session set expires_at = now() + interval '5 days' where token = ${token}`)
    const res = await visit('/home', cookie)
    expect(res.headers.get('location')).toBeNull()
    const sent = sessionCookies(res)
    expect(sent, res.headers.getSetCookie().join(' | ')).toHaveLength(1)
    expect(sent[0]!.toLowerCase()).toContain('max-age=604800')
    const delta = (await expiresAt(token)).getTime() - (Date.now() + 7 * DAY_MS)
    expect(Math.abs(delta)).toBeLessThan(60_000)
  })

  it('T-SESS-05 a session renewed 12 h ago is left alone (no Set-Cookie, expires_at unchanged)', async () => {
    const { cookie, token } = await signedIn()
    await db.execute(
      sql`update session set expires_at = now() + interval '6 days 12 hours' where token = ${token}`,
    )
    const before = await expiresAt(token)
    const res = await visit('/home', cookie)
    expect(res.headers.get('location')).toBeNull()
    expect(sessionCookies(res)).toEqual([])
    expect((await expiresAt(token)).getTime()).toBe(before.getTime())
  })

  it('T-SESS-06 a deleted session row → /login and the session cookie is cleared (Max-Age=0)', async () => {
    const { cookie, user } = await signedIn()
    await db.delete(session).where(eq(session.userId, user.id))
    const res = await visit('/home', cookie)
    expect(res.status).toBe(307)
    expect(location(res)).toBe('/login')
    const cleared = sessionCookies(res)
    expect(cleared, res.headers.getSetCookie().join(' | ')).toHaveLength(1)
    expect(cleared[0]!.toLowerCase()).toContain('max-age=0')
  })
})
