// X11 / SEED-A1 (M1 stage) — seedGolden inserts docs/reference/golden-fixtures.json positions, users and schedules
// through the services. plan/m01-auth-employees.md §5.S4 (S4.9, second part) and §7.4.
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { asc, count, countDistinct, eq, sql } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import { db } from '@/server/db/client'
import { account, auditLog, positions, user, workSchedules } from '@/server/db/schema'
import { truncateAll } from '../../scripts/lib/db'
import { seedGolden } from '../../scripts/lib/fixtures'
import { signInApi } from '../helpers/auth-http'

interface GoldenUser {
  nickname: string
  name: string
  email: string
  position: string
  role: 'manager' | 'worker'
  devPassword: string
  scheduleCd: Record<string, number>
}
const golden = JSON.parse(
  readFileSync(path.resolve(process.cwd(), 'docs/reference/golden-fixtures.json'), 'utf8'),
) as { positions: string[]; users: GoldenUser[] }

/** 100 → '1.00', 50 → '0.50' (integer arithmetic only, BR-01). */
const cdToFraction = (cd: number) => `${Math.trunc(cd / 100)}.${String(cd % 100).padStart(2, '0')}`

async function counts() {
  const one = async (t: typeof user | typeof account | typeof positions | typeof workSchedules | typeof auditLog) =>
    Number((await db.select({ n: count() }).from(t))[0]?.n ?? 0)
  return {
    positions: await one(positions),
    users: await one(user),
    accounts: await one(account),
    schedules: await one(workSchedules),
    audit: await one(auditLog),
  }
}

describe('seedGolden — M1 stage (X11)', () => {
  it('T-SEED-01 positions in JSON order, 6 users with credential accounts and Mon–Fri schedules, no forced change', async () => {
    await seedGolden(db)
    const pos = await db
      .select({ id: positions.id, name: positions.name })
      .from(positions)
      .orderBy(asc(positions.position), asc(positions.id))
    expect(pos.map((p) => p.name)).toEqual(golden.positions)
    const posName = new Map(pos.map((p) => [p.id, p.name]))

    const users = await db.select().from(user)
    expect(users).toHaveLength(golden.users.length)
    for (const g of golden.users) {
      const u = users.find((x) => x.email === g.email)
      expect(u, g.email).toBeDefined()
      expect(u).toMatchObject({ name: g.name, nickname: g.nickname, role: g.role, mustChangePassword: false })
      expect(posName.get(u!.positionId ?? '')).toBe(g.position)
      const days = await db
        .select({ weekday: workSchedules.weekday, fraction: workSchedules.fraction })
        .from(workSchedules)
        .where(eq(workSchedules.userId, u!.id))
        .orderBy(asc(workSchedules.weekday))
      expect(days).toEqual(
        Object.entries(g.scheduleCd).map(([d, cd]) => ({ weekday: Number(d), fraction: cdToFraction(cd) })),
      )
    }
    expect(users.find((u) => u.email === 'manager@example.com')).toMatchObject({
      name: 'Demo Manager',
      nickname: 'Manager',
      role: 'manager',
    })
    expect(users.filter((u) => u.role === 'worker')).toHaveLength(golden.users.length - 1)

    const accs = await db.select().from(account)
    expect(accs).toHaveLength(golden.users.length)
    for (const a of accs) expect(a).toMatchObject({ providerId: 'credential', accountId: a.userId })
    expect((await counts()).schedules).toBe(30)
  })

  it('T-SEED-02 every golden user signs in with demo1234; all share one hash', async () => {
    await seedGolden(db)
    for (const g of golden.users) expect(await signInApi(g.email, g.devPassword), g.email).toBe('200')
    const [row] = await db.select({ n: countDistinct(account.password) }).from(account)
    expect(Number(row?.n)).toBe(1)
  })

  it('T-SEED-03 truncate + seed twice gives identical counts; users are audited as created by nobody', async () => {
    await seedGolden(db)
    const first = await counts()
    await db.transaction(async (tx) => {
      await truncateAll(tx)
      await seedGolden(tx)
    })
    expect(await counts()).toEqual(first)
    const audits = await db
      .select({ action: auditLog.action, actorId: auditLog.actorId })
      .from(auditLog)
      .where(eq(auditLog.entity, 'user'))
    expect(audits).toHaveLength(6)
    for (const a of audits) expect(a).toEqual({ action: 'create', actorId: null })
    // the shared hash never reaches the audit log
    const [hash] = await db.select({ p: account.password }).from(account).limit(1)
    const [hit] = await db.execute<{ n: number }>(
      sql`select count(*)::int as n from audit_log where position(${hash!.p!} in coalesce(after::text, '')) > 0`,
    )
    expect(hit?.n).toBe(0)
  })
})
