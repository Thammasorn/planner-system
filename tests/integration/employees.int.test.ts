// FR-201…FR-207, AC-104, AC-201, AC-202, AC-203 (M1 part) — employee management end to end through the actions.
// plan/m01-auth-employees.md §5.S4 (S4.7).
import { asc, count, eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { th } from '@/i18n/th'
import { USER_COLORS } from '@/lib/user-colors'
import { login } from '@/server/actions/auth'
import {
  createEmployee,
  deactivateEmployee,
  reactivateEmployee,
  resetEmployeePassword,
  updateEmployee,
} from '@/server/actions/employees'
import { narrowRole } from '@/server/authz'
import { db } from '@/server/db/client'
import { account, auditLog, session, user, workSchedules } from '@/server/db/schema'
import { resetEnvCache } from '@/server/env'
import { pgErrorInfo } from '@/server/errors'
import * as services from '@/server/services'
import { listAssignableUsers } from '@/server/services/users'
import { proxy } from '@/proxy'
import { NextRequest } from 'next/server'
import { asUser } from '../helpers/as-user'
import { auditCount, auditRowsAfter } from '../helpers/audit'
import { getSessionByCookie, signInApi, signInCookie, signInHttp, cookieHeaderFrom } from '../helpers/auth-http'
import { makePosition, makeSession, makeUser, TEST_PASSWORD, type TestUser } from '../helpers/factories'
import { testCache } from '../helpers/request'

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
const INITIAL = 'Start-pass-99'

// BR-13 / X45: deactivated_on = serverToday() under APP_NOW. resetEnvCache() in case the clock reads getEnv().
beforeEach(() => {
  vi.stubEnv('ALLOW_TEST_HOOKS', '1')
  vi.stubEnv('APP_NOW', '2026-09-30T10:00:00+07:00')
  resetEnvCache()
})
afterEach(() => {
  resetEnvCache()
})

async function userRow(id: string) {
  const [row] = await db.select().from(user).where(eq(user.id, id))
  if (!row) throw new Error(`no user ${id}`)
  return row
}

async function scheduleOf(id: string): Promise<Array<{ weekday: number; fraction: string }>> {
  return db
    .select({ weekday: workSchedules.weekday, fraction: workSchedules.fraction })
    .from(workSchedules)
    .where(eq(workSchedules.userId, id))
    .orderBy(asc(workSchedules.weekday))
}

async function sessionCount(userId: string): Promise<number> {
  const [row] = await db.select({ n: count() }).from(session).where(eq(session.userId, userId))
  return Number(row?.n ?? 0)
}

/** Full updateEmployee input for `t` with overrides (the action replaces profile + role + schedule together). */
function editOf(t: TestUser, o: Partial<Parameters<typeof updateEmployee>[0]> = {}): Parameters<typeof updateEmployee>[0] {
  return {
    userId: t.id,
    name: t.name,
    nickname: t.nickname ?? '',
    email: t.email,
    positionId: t.positionId,
    role: t.role,
    schedule: [1, 2, 3, 4, 5].map((weekday) => ({ weekday, fractionCd: 100 as const })),
    ...o,
  }
}

const MON_FRI = [1, 2, 3, 4, 5].map((weekday) => ({ weekday, fraction: '1.00' }))

describe('employees (FR-201…FR-207)', () => {
  it('T-EMP-01 createEmployee stores user, credential account and Mon–Fri schedule; the worker signs in and must change (AC-201, AC-103)', async () => {
    asUser(await makeUser({ role: 'manager' }))
    const res = await createEmployee({
      name: 'Nok Test',
      nickname: 'Nok',
      email: '  Nok.Test@Example.com ',
      positionId: null,
      role: 'worker',
      password: INITIAL,
    })
    expect(res.ok, JSON.stringify(res)).toBe(true)
    if (!res.ok) return
    expect(res.userId).toMatch(UUID_V4)

    const row = await userRow(res.userId)
    expect(row).toMatchObject({
      email: 'nok.test@example.com',
      name: 'Nok Test',
      nickname: 'Nok',
      role: 'worker',
      mustChangePassword: true, // FR-203 default
    })
    expect(row.banned).not.toBe(true)
    expect(USER_COLORS).toContain(row.color)

    const accounts = await db.select().from(account).where(eq(account.userId, res.userId))
    expect(accounts).toHaveLength(1)
    expect(accounts[0]).toMatchObject({ providerId: 'credential', accountId: res.userId })
    expect(await scheduleOf(res.userId)).toEqual(MON_FRI)

    const signIn = await signInHttp('nok.test@example.com', INITIAL)
    expect(signIn.status).toBe(200)
    const s = await getSessionByCookie(cookieHeaderFrom(signIn))
    expect(s?.user.mustChangePassword).toBe(true)
  })

  it('T-EMP-01b mustChangePassword: false is stored as false (FR-203)', async () => {
    asUser(await makeUser({ role: 'manager' }))
    const res = await createEmployee({
      name: 'No Force',
      email: 'no-force@example.com',
      positionId: null,
      role: 'worker',
      password: INITIAL,
      mustChangePassword: false,
    })
    expect(res.ok, JSON.stringify(res)).toBe(true)
    if (!res.ok) return
    expect((await userRow(res.userId)).mustChangePassword).toBe(false)
  })

  it('T-EMP-02 the result is exactly { ok, userId }; no audit field holds the password; duplicate email (any case) → CONFLICT on email (AC-202)', async () => {
    asUser(await makeUser({ role: 'manager' }))
    const before = await auditCount()
    const res = await createEmployee({
      name: 'Ploy Test',
      email: 'ploy@example.com',
      positionId: null,
      role: 'worker',
      password: INITIAL,
    })
    expect(Object.keys(res).sort()).toEqual(['ok', 'userId'])
    expect(JSON.stringify(res).includes(INITIAL)).toBe(false)
    const rows = await auditRowsAfter(before)
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ entity: 'user', action: 'create' })
    const [hash] = await db.select({ p: account.password }).from(account).where(eq(account.userId, rows[0]!.entityId))
    const serialized = JSON.stringify(rows)
    expect(serialized.includes(INITIAL)).toBe(false)
    expect(serialized.includes(hash!.p!)).toBe(false)

    const dup = await createEmployee({
      name: 'Ploy Again',
      email: 'PLOY@example.com',
      positionId: null,
      role: 'worker',
      password: INITIAL,
    })
    expect(dup).toMatchObject({ ok: false, code: 'CONFLICT' })
    if (dup.ok) return
    expect(dup.fieldErrors?.email).toEqual([th.employees.emailTaken])
  })

  it('T-EMP-03 resetEmployeePassword ends all sessions, forces a change, swaps the password (FR-204)', async () => {
    asUser(await makeUser({ role: 'manager' }))
    const t = await makeUser()
    await makeSession(t.id)
    expect(await sessionCount(t.id)).toBe(2)
    const res = await resetEmployeePassword({ userId: t.id, password: 'Reset-pass-77' })
    expect(res.ok, JSON.stringify(res)).toBe(true)
    expect(await sessionCount(t.id)).toBe(0)
    expect((await userRow(t.id)).mustChangePassword).toBe(true)
    expect(await signInApi(t.email, TEST_PASSWORD)).toBe('401:INVALID_EMAIL_OR_PASSWORD')
    expect(await signInApi(t.email, 'Reset-pass-77')).toBe('200')
  })

  it('T-EMP-04 deactivate: banned, dated today, sessions gone, login refused, old cookie bounced; history kept (AC-104, FR-205)', async () => {
    asUser(await makeUser({ role: 'manager' }))
    const t = await makeUser({ positionName: 'Designer', schedule: [{ weekday: 2, fraction: '0.50' }] })
    const cookie = await signInCookie(t.email, TEST_PASSWORD)
    const scheduleBefore = await scheduleOf(t.id)

    const res = await deactivateEmployee({ userId: t.id })
    expect(res.ok, JSON.stringify(res)).toBe(true)
    const row = await userRow(t.id)
    expect(row).toMatchObject({
      banned: true,
      banReason: 'DEACTIVATED',
      banExpires: null,
      deactivatedOn: '2026-09-30',
      positionId: t.positionId,
    })
    expect(await sessionCount(t.id)).toBe(0)
    expect(await scheduleOf(t.id)).toEqual(scheduleBefore)

    expect(await signInApi(t.email, TEST_PASSWORD)).toBe('403:BANNED_USER')
    expect(await login({ email: t.email, password: TEST_PASSWORD })).toMatchObject({
      ok: false,
      code: 'ACCOUNT_DEACTIVATED',
    })
    const bounced = await proxy(
      new NextRequest('http://localhost:3100/home', { headers: new Headers({ cookie }) }),
    )
    expect(bounced.status).toBe(307)
    expect(new URL(bounced.headers.get('location') ?? '', 'http://localhost:3100').pathname).toBe('/login')
  })

  it('T-EMP-05 reactivate clears the ban fields and sign-in works again (FR-205)', async () => {
    asUser(await makeUser({ role: 'manager' }))
    const t = await makeUser({ deactivated: { on: '2026-09-01' } })
    const res = await reactivateEmployee({ userId: t.id })
    expect(res.ok, JSON.stringify(res)).toBe(true)
    expect(await userRow(t.id)).toMatchObject({
      banned: false,
      banReason: null,
      banExpires: null,
      deactivatedOn: null,
    })
    expect(await signInApi(t.email, TEST_PASSWORD)).toBe('200')
  })

  it('T-EMP-06 listAssignableUsers excludes a deactivated user and includes them again after reactivation (AC-203 M1 part)', async () => {
    asUser(await makeUser({ role: 'manager', nickname: 'Boss' }))
    const cindy = await makeUser({ name: 'Cindy', nickname: 'Cindy' })
    const ids = async () => (await listAssignableUsers(db)).map((u) => u.id)
    expect(await ids()).toContain(cindy.id)
    expect((await deactivateEmployee({ userId: cindy.id })).ok).toBe(true)
    expect(await ids()).not.toContain(cindy.id)
    expect((await reactivateEmployee({ userId: cindy.id })).ok).toBe(true)
    expect(await ids()).toContain(cindy.id)
  })

  it('T-EMP-07 a manager cannot deactivate themself, even with another active manager (FR-206)', async () => {
    const me = await makeUser({ role: 'manager' })
    await makeUser({ role: 'manager' })
    asUser(me)
    const res = await deactivateEmployee({ userId: me.id })
    expect(res).toMatchObject({ ok: false, code: 'SELF_DEACTIVATE' })
    expect((await userRow(me.id)).banned).not.toBe(true)
  })

  it('T-EMP-08 the only active manager cannot demote themself; with a second manager it is allowed (FR-206)', async () => {
    const me = await makeUser({ role: 'manager' })
    await makeUser({ role: 'manager', deactivated: { on: '2026-09-01' } }) // inactive managers do not count
    asUser(me)
    const alone = await updateEmployee(editOf(me, { role: 'worker' }))
    expect(alone).toMatchObject({ ok: false, code: 'LAST_MANAGER' })
    expect((await userRow(me.id)).role).toBe('manager')

    await makeUser({ role: 'manager' })
    const withSecond = await updateEmployee(editOf(me, { role: 'worker' }))
    expect(withSecond.ok, JSON.stringify(withSecond)).toBe(true)
    expect((await userRow(me.id)).role).toBe('worker')
  })

  it('T-EMP-09 two managers demoting/deactivating each other concurrently leave one active manager (FR-206 race)', async () => {
    const a = await makeUser({ role: 'manager', nickname: 'A' })
    const b = await makeUser({ role: 'manager', nickname: 'B' })
    const demote = (actor: TestUser, target: TestUser) =>
      db.transaction((tx) =>
        services.employees.updateEmployee(tx, actor, {
          ...editOf(target, { role: 'worker' }),
          nickname: target.nickname ?? undefined,
        }),
      )
    const settled = await Promise.allSettled([demote(a, b), demote(b, a)])
    expect(settled.filter((s) => s.status === 'fulfilled')).toHaveLength(1)
    const rejected = settled.filter((s) => s.status === 'rejected')
    expect(rejected).toHaveLength(1)
    expect((rejected[0] as PromiseRejectedResult).reason).toMatchObject({ code: 'LAST_MANAGER' })
    const activeManagers = async () =>
      (await db.select({ id: user.id, role: user.role, banned: user.banned }).from(user)).filter(
        (u) => u.role === 'manager' && u.banned !== true,
      ).length
    expect(await activeManagers()).toBe(1)

    // deactivation race: reset both to active managers first
    await db.update(user).set({ role: 'manager' }).where(eq(user.id, a.id))
    await db.update(user).set({ role: 'manager' }).where(eq(user.id, b.id))
    const deactivate = (actor: TestUser, target: TestUser) =>
      db.transaction((tx) =>
        services.employees.deactivateEmployee(tx, actor, { userId: target.id, today: '2026-09-30' }),
      )
    const settled2 = await Promise.allSettled([deactivate(a, b), deactivate(b, a)])
    expect(settled2.filter((s) => s.status === 'fulfilled')).toHaveLength(1)
    const rejected2 = settled2.filter((s) => s.status === 'rejected')
    expect(rejected2).toHaveLength(1)
    expect((rejected2[0] as PromiseRejectedResult).reason).toMatchObject({ code: 'LAST_MANAGER' })
    expect(await activeManagers()).toBe(1)
  })

  it('T-EMP-10 a role change applies on the next request without revoking sessions', async () => {
    const a = await makeUser({ role: 'manager' })
    const b = await makeUser({ role: 'manager' })
    const cookie = await signInCookie(b.email, TEST_PASSWORD)
    asUser(a)
    expect((await updateEmployee(editOf(b, { role: 'worker' }))).ok).toBe(true)

    const s = await getSessionByCookie(cookie)
    expect(s?.user.id).toBe(b.id)
    expect(s?.user.role).toBe('worker')
    asUser({ ...b, role: narrowRole(s?.user.role), sessionId: s!.session.id, sessionToken: s!.session.token })
    const res = await createEmployee({
      name: 'Should Fail',
      email: 'should-fail@example.com',
      positionId: null,
      role: 'worker',
      password: INITIAL,
    })
    expect(res).toMatchObject({ ok: false, code: 'FORBIDDEN' })
  })

  it('T-EMP-11 the schedule is replaced exactly; an empty schedule is rejected (FR-207)', async () => {
    asUser(await makeUser({ role: 'manager' }))
    const t = await makeUser()
    const res = await updateEmployee(
      editOf(t, {
        schedule: [
          { weekday: 1, fractionCd: 100 },
          { weekday: 3, fractionCd: 50 },
          { weekday: 5, fractionCd: 100 },
        ],
      }),
    )
    expect(res.ok, JSON.stringify(res)).toBe(true)
    expect(await scheduleOf(t.id)).toEqual([
      { weekday: 1, fraction: '1.00' },
      { weekday: 3, fraction: '0.50' },
      { weekday: 5, fraction: '1.00' },
    ])
    const empty = await updateEmployee(editOf(t, { schedule: [] }))
    expect(empty).toMatchObject({ ok: false, code: 'VALIDATION' })
    expect(await scheduleOf(t.id)).toHaveLength(3)
  })

  it('T-EMP-12 each employee action calls refresh() once on success and never on failure', async () => {
    const me = await makeUser({ role: 'manager' })
    asUser(me)
    const t = await makeUser()
    const cases: Array<[string, () => Promise<{ ok: boolean }>, () => Promise<{ ok: boolean }>]> = [
      [
        'createEmployee',
        () =>
          createEmployee({ name: 'R One', email: 'r-one@example.com', positionId: null, role: 'worker', password: INITIAL }),
        () =>
          createEmployee({ name: 'R Dup', email: 'r-one@example.com', positionId: null, role: 'worker', password: INITIAL }),
      ],
      [
        'updateEmployee',
        () => updateEmployee(editOf(t, { name: 'Renamed' })),
        () => updateEmployee(editOf(me, { role: 'worker' })), // LAST_MANAGER
      ],
      [
        'deactivateEmployee',
        () => deactivateEmployee({ userId: t.id }),
        () => deactivateEmployee({ userId: me.id }), // SELF_DEACTIVATE
      ],
      [
        'reactivateEmployee',
        () => reactivateEmployee({ userId: t.id }),
        () => reactivateEmployee({ userId: '00000000-0000-4000-8000-000000000000' }), // NOT_FOUND
      ],
      [
        'resetEmployeePassword',
        () => resetEmployeePassword({ userId: t.id, password: 'Reset-pass-77' }),
        () => resetEmployeePassword({ userId: t.id, password: t.email }), // EQUALS_EMAIL
      ],
    ]
    for (const [name, ok, fail] of cases) {
      testCache.refresh.mockClear()
      expect((await ok()).ok, `${name} success`).toBe(true)
      expect(testCache.refresh, `${name} success`).toHaveBeenCalledTimes(1)
      testCache.refresh.mockClear()
      expect((await fail()).ok, `${name} failure`).toBe(false)
      expect(testCache.refresh, `${name} failure`).not.toHaveBeenCalled()
    }
  })

  it('T-EMP-13 createEmployee is one transaction: a failing schedule insert leaves no user, account, schedule or audit row (ACT-3)', async () => {
    const err = await db
      .transaction((tx) =>
        services.employees.createEmployee(tx, null, {
          name: 'Broken Schedule',
          email: 'broken@example.com',
          positionId: null,
          role: 'worker',
          mustChangePassword: true,
          schedule: [{ weekday: 8, fractionCd: 100 }], // bypasses zod; the CHECK constraint rejects it
          passwordHash: 'not-a-real-hash',
        }),
      )
      .then(
        () => null,
        (e: unknown) => e,
      )
    expect(err, 'the transaction must fail').not.toBeNull()
    expect(pgErrorInfo(err).code).toBe('23514')
    for (const table of [user, account, workSchedules, auditLog]) {
      expect(await db.select({ n: count() }).from(table)).toEqual([{ n: 0 }])
    }
  })

  it('T-EMP-14 a position can be assigned on create and shows up in listEmployees', async () => {
    asUser(await makeUser({ role: 'manager' }))
    const designer = await makePosition('Designer')
    const res = await createEmployee({
      name: 'Jack Test',
      nickname: 'Jack',
      email: 'jack-test@example.com',
      positionId: designer.id,
      role: 'worker',
      password: INITIAL,
    })
    expect(res.ok, JSON.stringify(res)).toBe(true)
    if (!res.ok) return
    const rows = await services.employees.listEmployees(db)
    const jack = rows.find((r) => r.id === res.userId)
    expect(jack).toMatchObject({
      displayName: 'Jack',
      positionId: designer.id,
      positionName: 'Designer',
      active: true,
      mustChangePassword: true,
    })
    expect(JSON.stringify(rows).includes(INITIAL)).toBe(false)
  })
})
