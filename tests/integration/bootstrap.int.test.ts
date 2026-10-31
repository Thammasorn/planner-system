// FR-102, SPEC §10.4 steps 1 + 3 — first manager from INITIAL_MANAGER_* and default positions; idempotent; never
// prints the password. plan/m01-auth-employees.md §5.S4 (S4.9). M5 (plan/m05 S4.6, DEP-09 / DEP-11, M5-D12): step 2
// seeds the 4 default leave types only when the table is empty; step 4 never seeds holidays.
import { asc, count, eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest'
import { db } from '@/server/db/client'
import { th } from '@/i18n/th'
import { account, auditLog, holidays, leaveTypes, positions, user, workSchedules } from '@/server/db/schema'
import { DEFAULT_POSITIONS, runBootstrap } from '../../scripts/lib/bootstrap'
import { signInApi } from '../helpers/auth-http'
import { makeLeaveType, makeUser } from '../helpers/factories'

const PASSWORD = 'Initial-pass-1'
const ENV = {
  NODE_ENV: 'development',
  INITIAL_MANAGER_EMAIL: 'boss@example.com',
  INITIAL_MANAGER_NAME: 'Boss',
  INITIAL_MANAGER_PASSWORD: PASSWORD,
} as const

type Log = Pick<Console, 'info' | 'warn' | 'error'>
let log: { info: MockInstance; warn: MockInstance; error: MockInstance }
let consoleSpies: MockInstance[]
/** Every password a case passed in; none may appear in any log call. */
let secrets: Set<string>

beforeEach(() => {
  secrets = new Set([PASSWORD])
  log = { info: vi.fn(), warn: vi.fn(), error: vi.fn() }
  consoleSpies = (['log', 'info', 'warn', 'error', 'debug'] as const).map((m) =>
    vi.spyOn(console, m).mockImplementation(() => {}),
  )
})

afterEach(() => {
  // the password never reaches any log line (all cases)
  const printed = JSON.stringify([
    ...[log.info, log.warn, log.error].flatMap((m) => m.mock.calls),
    ...consoleSpies.flatMap((s) => s.mock.calls),
  ])
  for (const secret of secrets) expect(printed.includes(secret), 'password printed').toBe(false)
})

const run = (env: NodeJS.ProcessEnv) => runBootstrap(db, env, log as unknown as Log)
const n = async (
  table: typeof user | typeof positions | typeof account | typeof leaveTypes | typeof holidays,
) =>
  Number((await db.select({ n: count() }).from(table))[0]?.n ?? 0)

describe('bootstrap (FR-102, §10.4)', () => {
  it('T-BOOT-01 empty DB + INITIAL_MANAGER_* → one manager who must change the password and can sign in', async () => {
    const res = await run({ ...ENV })
    expect(res.fatal).toBeUndefined()
    expect(res.createdManager).toBe(true)
    const users = await db.select().from(user)
    expect(users).toHaveLength(1)
    expect(users[0]).toMatchObject({ email: 'boss@example.com', name: 'Boss', role: 'manager', mustChangePassword: true })
    const days = await db
      .select({ weekday: workSchedules.weekday, fraction: workSchedules.fraction })
      .from(workSchedules)
      .where(eq(workSchedules.userId, users[0]!.id))
      .orderBy(asc(workSchedules.weekday))
    expect(days).toEqual([1, 2, 3, 4, 5].map((weekday) => ({ weekday, fraction: '1.00' })))
    expect(await signInApi('boss@example.com', PASSWORD)).toBe('200')
  })

  it('T-BOOT-02 seeds the 6 default positions in order', async () => {
    const res = await run({ ...ENV })
    expect(res.seededPositions).toBe(6)
    const rows = await db
      .select({ name: positions.name })
      .from(positions)
      .orderBy(asc(positions.position), asc(positions.id))
    expect(rows.map((r) => r.name)).toEqual([...DEFAULT_POSITIONS])
  })

  it('T-BOOT-03 a second run adds nothing and never touches the password', async () => {
    await run({ ...ENV })
    const [before] = await db.select({ p: account.password }).from(account)
    const second = await run({ ...ENV, INITIAL_MANAGER_PASSWORD: 'Other-pass-2' })
    secrets.add('Other-pass-2')
    expect(second).toMatchObject({ createdManager: false, seededPositions: 0 })
    expect(second.fatal).toBeUndefined()
    expect(await n(user)).toBe(1)
    expect(await n(positions)).toBe(6)
    const [after] = await db.select({ p: account.password }).from(account)
    expect(after?.p).toBe(before?.p)
  })

  it('T-BOOT-04 when users already exist the manager is not created', async () => {
    await makeUser({ role: 'worker', email: 'someone@example.com' })
    const res = await run({ ...ENV, INITIAL_MANAGER_EMAIL: 'other-boss@example.com' })
    expect(res.createdManager).toBe(false)
    expect(res.fatal).toBeUndefined()
    expect(await n(user)).toBe(1)
    expect(await db.select().from(user).where(eq(user.email, 'other-boss@example.com'))).toEqual([])
  })

  it('T-BOOT-05 missing INITIAL_MANAGER_*: a warning in development, fatal in production', async () => {
    const dev = await run({ NODE_ENV: 'development' })
    expect(dev.fatal).toBeUndefined()
    expect(dev.createdManager).toBe(false)
    expect(dev.warnings.length).toBeGreaterThan(0)
    expect(await n(user)).toBe(0)

    const prod = await run({ NODE_ENV: 'production' })
    expect(prod.fatal).toEqual(expect.any(String))
    expect(prod.createdManager).toBe(false)
    expect(await n(user)).toBe(0)
  })

  it('T-BOOT-06 a policy-violating INITIAL_MANAGER_PASSWORD is fatal and creates nobody', async () => {
    // equals the email's local part (EQUALS_EMAIL); mixed case so a printed email cannot be mistaken for it
    const bad = 'LongBoss'
    secrets.add(bad)
    const res = await run({ ...ENV, INITIAL_MANAGER_EMAIL: 'longboss@example.com', INITIAL_MANAGER_PASSWORD: bad })
    expect(res.fatal).toEqual(expect.any(String))
    expect(res.fatal).not.toContain(bad)
    expect(res.createdManager).toBe(false)
    expect(await n(user)).toBe(0)
  })
})

describe('bootstrap — M5 leave types and holidays (§10.4 steps 2 + 4, M5-D12)', () => {
  const orderedTypes = () =>
    db
      .select({ name: leaveTypes.name, color: leaveTypes.color, position: leaveTypes.position, archivedAt: leaveTypes.archivedAt })
      .from(leaveTypes)
      .orderBy(asc(leaveTypes.position), asc(leaveTypes.id))

  it('T-BOOT-LT-01 empty DB → the 4 default leave types in order (names/colours from th), audited by nobody', async () => {
    const res = await run({ ...ENV })
    expect(res.fatal).toBeUndefined()
    expect(res).toMatchObject({ seededLeaveTypes: 4 })
    const types = await orderedTypes()
    expect(types.map(({ name, color }) => ({ name, color }))).toEqual(
      th.leaveTypes.defaults.map(({ name, color }) => ({ name, color })),
    )
    for (const t of types) expect(t.archivedAt).toBeNull()
    for (let i = 1; i < types.length; i++) expect(types[i - 1]!.position < types[i]!.position).toBe(true)
    const audits = await db
      .select({ action: auditLog.action, actorId: auditLog.actorId, projectId: auditLog.projectId })
      .from(auditLog)
      .where(eq(auditLog.entity, 'leave_type'))
    expect(audits).toHaveLength(4)
    for (const a of audits) expect(a).toEqual({ action: 'create', actorId: null, projectId: null })
  })

  it('T-BOOT-LT-02 a second run adds no leave type (idempotent)', async () => {
    await run({ ...ENV })
    const second = await run({ ...ENV })
    expect(second.fatal).toBeUndefined()
    expect(second).toMatchObject({ seededLeaveTypes: 0 })
    expect(await n(leaveTypes)).toBe(4)
  })

  it('T-BOOT-LT-03 a DB that already has one custom leave type gets nothing added', async () => {
    const custom = await makeLeaveType({ name: 'ลาบวช', color: '#0F766E' })
    const res = await run({ ...ENV })
    expect(res).toMatchObject({ seededLeaveTypes: 0 })
    expect(await db.select({ id: leaveTypes.id }).from(leaveTypes)).toEqual([{ id: custom.id }])
  })

  it('T-BOOT-HOL-01 bootstrap never seeds holidays (DEP-11: official Thai holidays are imported, X64)', async () => {
    await run({ ...ENV })
    expect(await n(holidays)).toBe(0)
    await run({ ...ENV })
    expect(await n(holidays)).toBe(0)
  })
})
