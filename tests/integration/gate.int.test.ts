// FR-104, AC-103, ACT-1 — while a password change is due, only leaving and changing the password work.
// plan/m01-auth-employees.md §5.S4 (S4.5).
import { readdirSync } from 'node:fs'
import path from 'node:path'
import { eq } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import type { ActionResult } from '@/lib/action-result'
import { changeOwnPassword } from '@/server/actions/auth'
import { db } from '@/server/db/client'
import { session, user } from '@/server/db/schema'
import { asUser } from '../helpers/as-user'
import { getSessionByCookie, sessionTokenFromCookie, signInCookie } from '../helpers/auth-http'
import { makeSession, makeUser, TEST_PASSWORD } from '../helpers/factories'

/** M1-D6: the only actions open to a mustChangePassword user (login is public). */
const OPEN_WHILE_MUST_CHANGE = new Set(['login', 'logout', 'changeOwnPassword', 'signOutEverywhere'])
const ACTIONS_DIR = path.resolve(process.cwd(), 'src/server/actions')

type AnyAction = (input: unknown) => Promise<ActionResult<object>>

async function gatedActions(): Promise<Array<[string, AnyAction]>> {
  const out: Array<[string, AnyAction]> = []
  for (const file of readdirSync(ACTIONS_DIR).filter((f) => f.endsWith('.ts') && !f.includes('.test.'))) {
    const mod = (await import(path.join(ACTIONS_DIR, file))) as Record<string, unknown>
    for (const [name, fn] of Object.entries(mod)) {
      if (typeof fn === 'function' && !OPEN_WHILE_MUST_CHANGE.has(name)) out.push([name, fn as AnyAction])
    }
  }
  return out.sort(([a], [b]) => a.localeCompare(b))
}

describe('must-change-password gate (FR-104, AC-103)', () => {
  it('T-GATE-10 every other M1 action answers MUST_CHANGE_PASSWORD for a mustChangePassword worker', async () => {
    const actions = await gatedActions()
    expect(actions.map(([n]) => n)).toEqual(
      expect.arrayContaining(['createEmployee', 'createPosition', 'setPreference', 'updateEmployee']),
    )
    const u = await makeUser({ mustChangePassword: true })
    asUser(u)
    for (const [name, fn] of actions) {
      const res = await fn({})
      expect(res, name).toMatchObject({ ok: false, code: 'MUST_CHANGE_PASSWORD' })
    }
  })

  it('T-GATE-11 changeOwnPassword clears the flag, keeps the current session and ends the others', async () => {
    const u = await makeUser({ mustChangePassword: true }) // + one raw session (the "other device")
    const other = await makeSession(u.id)
    const cookie = await signInCookie(u.email, TEST_PASSWORD)
    const token = sessionTokenFromCookie(cookie)
    const [current] = await db.select({ id: session.id }).from(session).where(eq(session.token, token))
    expect((await getSessionByCookie(cookie))?.user.mustChangePassword).toBe(true)

    asUser({ ...u, sessionId: current!.id, sessionToken: token })
    const res = await changeOwnPassword({
      currentPassword: TEST_PASSWORD,
      newPassword: 'Fresh-pass-2026',
      confirmPassword: 'Fresh-pass-2026',
    })
    expect(res.ok, JSON.stringify(res)).toBe(true)

    const [row] = await db
      .select({ must: user.mustChangePassword })
      .from(user)
      .where(eq(user.id, u.id))
    expect(row?.must).toBe(false)
    const left = await db.select({ token: session.token }).from(session).where(eq(session.userId, u.id))
    expect(left.map((s) => s.token)).toEqual([token])
    expect(left.map((s) => s.token)).not.toContain(other.token)
    expect((await getSessionByCookie(cookie))?.user.mustChangePassword).toBe(false)
  })
})
