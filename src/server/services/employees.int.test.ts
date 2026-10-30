import { eq } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import { DEFAULT_SCHEDULE } from '@/lib/schemas/employees'
import { USER_COLORS } from '@/lib/user-colors'
import { db } from '@/server/db/client'
import { auditLog, user, workSchedules } from '@/server/db/schema'
import * as repo from '@/server/repo'
import { createEmployee, listEmployees, updateEmployee } from './employees'

const HASH = 'a'.repeat(32) + ':' + 'b'.repeat(128) // shape of a scrypt hash; never checked here

function input(i: number) {
  return {
    name: `Person ${i}`,
    nickname: `P${i}`,
    email: `p${i}@example.com`,
    role: 'worker' as const,
    positionId: null,
    mustChangePassword: true,
    schedule: DEFAULT_SCHEDULE,
    passwordHash: HASH,
  }
}

describe('employees service mechanics', () => {
  it('T-EMPS-01 colours go to the least-used palette entry; the 13th user wraps to the first', async () => {
    const colors: string[] = []
    for (let i = 1; i <= 13; i++) {
      const { userId } = await db.transaction((tx) => createEmployee(tx, null, input(i)))
      const [row] = await db.select({ color: user.color }).from(user).where(eq(user.id, userId))
      colors.push(row!.color!)
    }
    expect(colors.slice(0, 12)).toEqual([...USER_COLORS])
    expect(colors[12]).toBe(USER_COLORS[0])
  })

  it('T-EMPS-02 replaceSchedule stores 50 cd as 0.50 and reads it back as 50', async () => {
    const { userId } = await db.transaction((tx) => createEmployee(tx, null, input(1)))
    await repo.users.replaceSchedule(db, userId, [
      { weekday: 1, fractionCd: 100 },
      { weekday: 3, fractionCd: 50 },
    ])
    const rows = await db
      .select({ weekday: workSchedules.weekday, fraction: workSchedules.fraction })
      .from(workSchedules)
      .where(eq(workSchedules.userId, userId))
      .orderBy(workSchedules.weekday)
    expect(rows).toEqual([
      { weekday: 1, fraction: '1.00' },
      { weekday: 3, fraction: '0.50' },
    ])
    expect(await repo.users.getSchedule(db, userId)).toEqual({ 1: 100, 3: 50 })
    const [emp] = await listEmployees(db)
    expect(emp!.schedule).toEqual([
      { weekday: 1, fractionCd: 100 },
      { weekday: 3, fractionCd: 50 },
    ])
  })

  it('T-EMPS-03 audit before/after never contain a password or hash', async () => {
    const { userId } = await db.transaction((tx) => createEmployee(tx, null, input(1)))
    await db.transaction((tx) =>
      updateEmployee(tx, null, {
        userId,
        name: 'Renamed',
        nickname: '',
        email: 'renamed@example.com',
        positionId: null,
        role: 'manager',
        schedule: [{ weekday: 2, fractionCd: 75 }],
      }),
    )
    const rows = await db.select().from(auditLog)
    expect(rows).toHaveLength(2)
    const json = JSON.stringify(rows)
    expect(json).not.toContain(HASH)
    expect(json.toLowerCase()).not.toMatch(/"(password|passwordhash|hash)"/)
    const upd = rows.find((r) => r.action === 'update')!
    expect(upd.before).toMatchObject({ name: 'Person 1', nickname: 'P1', role: 'worker' })
    expect(upd.after).toMatchObject({
      name: 'Renamed',
      nickname: null,
      role: 'manager',
      schedule: [{ weekday: 2, fractionCd: 75 }],
    })
    expect(upd.after).not.toHaveProperty('positionId') // unchanged fields are not logged
  })
})
