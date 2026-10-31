// src/server/repo/users.ts — typed queries on Better Auth's `user` table + app columns, and work_schedules.
// numeric(3,2) ↔ cd conversion happens only here (BR-02, X02). "Active" = banned IS NOT TRUE (M1-D2).
import { and, asc, count, eq, inArray, isNotNull, sql } from 'drizzle-orm'
import type { Cd, Schedule, Weekday } from '@/domain/types'
import { cdToNumeric, numericToCd } from '@/domain/units'
import type { EmployeeRow, ScheduleDayDTO } from '@/lib/contracts/users'
import { displayName } from '@/lib/display-name'
import { positions, user, workSchedules } from '../db/schema'
import type { DbOrTx } from '../db/types'
import { NotFoundError } from '../errors'
import { narrowRole, type SystemRole } from '../authz'

/** SQL predicate for active (not deactivated) users. */
export const activeUser = sql`${user.banned} is not true`

export interface UserRecord {
  id: string
  name: string
  nickname: string | null
  email: string
  role: SystemRole
  positionId: string | null
  color: string | null
  active: boolean
  deactivatedOn: string | null
  mustChangePassword: boolean
}

const userColumns = {
  id: user.id,
  name: user.name,
  nickname: user.nickname,
  email: user.email,
  role: user.role,
  positionId: user.positionId,
  color: user.color,
  banned: user.banned,
  deactivatedOn: user.deactivatedOn,
  mustChangePassword: user.mustChangePassword,
}

type UserSelect = { [K in keyof typeof userColumns]: (typeof userColumns)[K]['_']['data'] | null }

function toRecord(r: UserSelect): UserRecord {
  return {
    id: r.id!,
    name: r.name!,
    nickname: r.nickname,
    email: r.email!,
    role: narrowRole(r.role),
    positionId: r.positionId,
    color: r.color,
    active: r.banned !== true,
    deactivatedOn: r.deactivatedOn,
    mustChangePassword: r.mustChangePassword === true,
  }
}

export async function getUser(tx: DbOrTx, id: string): Promise<UserRecord | null> {
  const [row] = await tx.select(userColumns).from(user).where(eq(user.id, id))
  return row ? toRecord(row) : null
}

export async function getUserOrNotFound(tx: DbOrTx, id: string): Promise<UserRecord> {
  const row = await getUser(tx, id)
  if (!row) throw new NotFoundError()
  return row
}

/** `email` must already be lower(trim()) (zod emailField). */
export async function findUserIdByEmail(tx: DbOrTx, email: string): Promise<string | null> {
  const [row] = await tx.select({ id: user.id }).from(user).where(eq(user.email, email))
  return row?.id ?? null
}

export async function countUsers(tx: DbOrTx): Promise<number> {
  const [row] = await tx.select({ n: count() }).from(user)
  return Number(row?.n ?? 0)
}

export type UserInsert = typeof user.$inferInsert
export type UserUpdate = Partial<Omit<UserInsert, 'id' | 'createdAt'>>

export async function insertUser(tx: DbOrTx, values: UserInsert): Promise<void> {
  await tx.insert(user).values(values)
}

export async function updateUser(tx: DbOrTx, id: string, values: UserUpdate): Promise<void> {
  await tx.update(user).set(values).where(eq(user.id, id))
}

/**
 * FR-206 guard: locks every active manager row (in id order, so concurrent callers cannot deadlock) until the
 * transaction ends and returns their ids. A concurrent demotion/deactivation that committed first is re-evaluated
 * by Postgres and drops out of the result.
 */
export async function lockActiveManagers(tx: DbOrTx): Promise<string[]> {
  const rows = await tx
    .select({ id: user.id })
    .from(user)
    .where(and(eq(user.role, 'manager'), activeUser))
    .orderBy(asc(user.id))
    .for('update')
  return rows.map((r) => r.id)
}

/** Number of users per stored colour (active or not) — input of pickLeastUsedColor. */
export async function colorCounts(tx: DbOrTx): Promise<Map<string, number>> {
  const rows = await tx
    .select({ color: user.color, n: count() })
    .from(user)
    .where(isNotNull(user.color))
    .groupBy(user.color)
  return new Map(rows.map((r) => [r.color!, Number(r.n)]))
}

/** Users referencing a position, active or deactivated (FR-208 delete guard). */
export async function countUsersWithPosition(tx: DbOrTx, positionId: string): Promise<number> {
  const [row] = await tx.select({ n: count() }).from(user).where(eq(user.positionId, positionId))
  return Number(row?.n ?? 0)
}

// --- schedules (FR-207) -------------------------------------------------------------------------------------------

function toWeekday(n: number): Weekday {
  if (!Number.isInteger(n) || n < 1 || n > 7) throw new RangeError(`Invalid weekday: ${n}`)
  return n as Weekday
}

export async function getSchedule(tx: DbOrTx, userId: string): Promise<Schedule> {
  const rows = await tx
    .select({ weekday: workSchedules.weekday, fraction: workSchedules.fraction })
    .from(workSchedules)
    .where(eq(workSchedules.userId, userId))
  const out: Schedule = {}
  for (const r of rows) out[toWeekday(r.weekday)] = numericToCd(r.fraction)
  return out
}

/** Batched `getSchedule` for the capacity loader (M5 S2.5): every id that has schedule rows → its schedule in cd.
 *  Ids without rows are absent (an empty schedule). */
export async function listSchedules(tx: DbOrTx, ids: readonly string[]): Promise<Map<string, Schedule>> {
  const out = new Map<string, Schedule>()
  if (ids.length === 0) return out
  const rows = await tx
    .select({
      userId: workSchedules.userId,
      weekday: workSchedules.weekday,
      fraction: workSchedules.fraction,
    })
    .from(workSchedules)
    .where(inArray(workSchedules.userId, [...ids]))
  for (const r of rows) {
    const s = out.get(r.userId) ?? {}
    s[toWeekday(r.weekday)] = numericToCd(r.fraction)
    out.set(r.userId, s)
  }
  return out
}

/** `deactivated_on` of each existing user among `ids` (unknown ids are absent). */
export async function listDeactivatedOn(
  tx: DbOrTx,
  ids: readonly string[],
): Promise<Map<string, string | null>> {
  if (ids.length === 0) return new Map()
  const rows = await tx
    .select({ id: user.id, deactivatedOn: user.deactivatedOn })
    .from(user)
    .where(inArray(user.id, [...ids]))
  return new Map(rows.map((r) => [r.id, r.deactivatedOn]))
}

/** The schedule as an ordered day list (weekday ascending). */
export async function getScheduleDays(tx: DbOrTx, userId: string): Promise<ScheduleDayDTO[]> {
  return scheduleToDays(await getSchedule(tx, userId))
}

export function scheduleToDays(s: Schedule): ScheduleDayDTO[] {
  const out: ScheduleDayDTO[] = []
  for (let d = 1; d <= 7; d++) {
    const cd: Cd | undefined = s[d as Weekday]
    if (cd !== undefined) out.push({ weekday: d as Weekday, fractionCd: cd })
  }
  return out
}

/** DELETE then INSERT (no effective dating, X60). */
export async function replaceSchedule(
  tx: DbOrTx,
  userId: string,
  days: ReadonlyArray<{ weekday: number; fractionCd: Cd }>,
): Promise<void> {
  await tx.delete(workSchedules).where(eq(workSchedules.userId, userId))
  if (days.length === 0) return
  await tx
    .insert(workSchedules)
    .values(days.map((d) => ({ userId, weekday: d.weekday, fraction: cdToNumeric(d.fractionCd) })))
}

// --- lists ----------------------------------------------------------------------------------------------------------

/** Every employee (active and deactivated) with position name and schedule; unordered (the service sorts). */
export async function listEmployeeRows(tx: DbOrTx): Promise<EmployeeRow[]> {
  const rows = await tx
    .select({ ...userColumns, positionName: positions.name })
    .from(user)
    .leftJoin(positions, eq(positions.id, user.positionId))
  const schedules = await tx
    .select({
      userId: workSchedules.userId,
      weekday: workSchedules.weekday,
      fraction: workSchedules.fraction,
    })
    .from(workSchedules)
    .orderBy(asc(workSchedules.userId), asc(workSchedules.weekday))
  const byUser = new Map<string, ScheduleDayDTO[]>()
  for (const s of schedules) {
    const list = byUser.get(s.userId) ?? []
    list.push({ weekday: toWeekday(s.weekday), fractionCd: numericToCd(s.fraction) })
    byUser.set(s.userId, list)
  }
  return rows.map((r) => {
    const rec = toRecord(r)
    return {
      id: rec.id,
      name: rec.name,
      nickname: rec.nickname,
      displayName: displayName(rec),
      email: rec.email,
      role: rec.role,
      positionId: rec.positionId,
      positionName: r.positionName,
      color: rec.color,
      active: rec.active,
      deactivatedOn: rec.deactivatedOn,
      mustChangePassword: rec.mustChangePassword,
      schedule: byUser.get(rec.id) ?? [],
    }
  })
}

export interface AssignableUserRow {
  id: string
  name: string
  nickname: string | null
  color: string | null
  positionName: string | null
}

/** Active users only (AC-203 M1 part, X12); unordered. */
export async function listActiveUsers(tx: DbOrTx): Promise<AssignableUserRow[]> {
  return tx
    .select({
      id: user.id,
      name: user.name,
      nickname: user.nickname,
      color: user.color,
      positionName: positions.name,
    })
    .from(user)
    .leftJoin(positions, eq(positions.id, user.positionId))
    .where(activeUser)
}

export interface CalendarPersonRow {
  id: string
  name: string
  nickname: string | null
  positionName: string | null
  color: string | null
  active: boolean
}

/** M5 calendar `people` (FR-907): the users whose leave is shown, active and deactivated alike; unordered. No email.
 *  `active` = the M2-D16 people flag (not banned and no deactivated_on). */
export async function listCalendarPeople(tx: DbOrTx, ids: readonly string[]): Promise<CalendarPersonRow[]> {
  if (ids.length === 0) return []
  return tx
    .select({
      id: user.id,
      name: user.name,
      nickname: user.nickname,
      positionName: positions.name,
      color: user.color,
      active: sql<boolean>`(${user.banned} is not true and ${user.deactivatedOn} is null)`,
    })
    .from(user)
    .leftJoin(positions, eq(positions.id, user.positionId))
    .where(inArray(user.id, [...ids]))
}
