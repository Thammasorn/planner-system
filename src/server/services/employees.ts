// src/server/services/employees.ts — employee management (FR-201…FR-207, AC-104, M1-D8, M1-D13, M1-D16).
// Passwords arrive hashed (the action hashes before the tx; plaintext never reaches a service). Scripts (bootstrap,
// seedGolden) call these with actor = null. Every mutation ends with exactly one audit row in the caller's tx (M1-D5).
import { randomUUID } from 'node:crypto'
import type { ISODate } from '@/domain/types'
import { th } from '@/i18n/th'
import type { EmployeeRow, ScheduleDayDTO } from '@/lib/contracts/users'
import { displayName } from '@/lib/display-name'
import type { CreateEmployeeData, UpdateEmployeeData } from '@/lib/schemas/employees'
import { pickLeastUsedColor } from '@/lib/user-colors'
import * as audit from '../audit'
import type { DbOrTx } from '../db/types'
import { ConflictError, NotFoundError, pgErrorInfo, ValidationError } from '../errors'
import * as repo from '../repo'

export type Actor = { id: string } | null
export type CreateEmployeeServiceInput = Omit<CreateEmployeeData, 'password'> & { passwordHash: string }

const collator = new Intl.Collator('th')

function emailTaken(): ConflictError {
  return new ConflictError('CONFLICT', th.employees.emailTaken, {
    fieldErrors: { email: [th.employees.emailTaken] },
  })
}

function isEmailUniqueViolation(e: unknown): boolean {
  const { code, constraint } = pgErrorInfo(e)
  return code === '23505' && constraint === 'user_email_unique'
}

async function assertPositionExists(tx: DbOrTx, positionId: string | null): Promise<void> {
  if (positionId === null) return
  try {
    await repo.positions.getPositionOrNotFound(tx, positionId)
  } catch (e) {
    if (e instanceof NotFoundError) throw new ValidationError({ positionId: [th.errors.NOT_FOUND] })
    throw e
  }
}

type Day = Pick<ScheduleDayDTO, 'fractionCd'> & { weekday: number }

function sortDays<T extends Day>(days: ReadonlyArray<T>): T[] {
  return [...days].sort((a, b) => a.weekday - b.weekday)
}

function sameSchedule(a: ReadonlyArray<Day>, b: ReadonlyArray<Day>): boolean {
  const x = sortDays(a)
  const y = sortDays(b)
  return x.length === y.length && x.every((d, i) => d.weekday === y[i]!.weekday && d.fractionCd === y[i]!.fractionCd)
}

/** All employees (active and deactivated) with position name and schedule (cd); active first, then by display name. */
export async function listEmployees(tx: DbOrTx): Promise<EmployeeRow[]> {
  const rows = await repo.users.listEmployeeRows(tx)
  return rows.sort(
    (a, b) => Number(b.active) - Number(a.active) || collator.compare(a.displayName, b.displayName),
  )
}

/** user + credential account + schedule + audit in the caller's tx; email taken → ConflictError('CONFLICT', fieldErrors.email). */
export async function createEmployee(
  tx: DbOrTx,
  actor: Actor,
  input: CreateEmployeeServiceInput,
): Promise<{ userId: string }> {
  if (await repo.users.findUserIdByEmail(tx, input.email)) throw emailTaken()
  await assertPositionExists(tx, input.positionId)
  const id = randomUUID()
  const nickname = input.nickname?.trim() ? input.nickname.trim() : null
  const color = input.color ?? pickLeastUsedColor(await repo.users.colorCounts(tx))
  try {
    await repo.users.insertUser(tx, {
      id,
      name: input.name,
      email: input.email,
      emailVerified: true,
      role: input.role,
      nickname,
      positionId: input.positionId,
      mustChangePassword: input.mustChangePassword,
      color,
      banned: false,
    })
  } catch (e) {
    if (isEmailUniqueViolation(e)) throw emailTaken()
    throw e
  }
  await repo.accounts.insertCredentialAccount(tx, id, input.passwordHash)
  const schedule = sortDays(input.schedule)
  await repo.users.replaceSchedule(tx, id, schedule)
  await audit.log(tx, actor, {
    entity: 'user',
    entityId: id,
    action: 'create',
    summary: th.audit.employeeCreated(displayName({ name: input.name, nickname })),
    after: {
      name: input.name,
      nickname,
      email: input.email,
      role: input.role,
      positionId: input.positionId,
      color,
      mustChangePassword: input.mustChangePassword,
      schedule,
    },
  })
  return { userId: id }
}

/** Profile + role + schedule in one tx, one audit row (M1-D8); demoting the last active manager → LAST_MANAGER. */
export async function updateEmployee(tx: DbOrTx, actor: Actor, input: UpdateEmployeeData): Promise<void> {
  const cur = await repo.users.getUserOrNotFound(tx, input.userId)
  const next = {
    name: input.name,
    nickname: input.nickname?.trim() ? input.nickname.trim() : null,
    email: input.email,
    positionId: input.positionId,
    role: input.role,
    ...(input.color ? { color: input.color } : {}),
  }
  if (next.email !== cur.email && (await repo.users.findUserIdByEmail(tx, next.email))) throw emailTaken()
  if (next.positionId !== cur.positionId) await assertPositionExists(tx, next.positionId)
  if (cur.role === 'manager' && next.role !== 'manager') {
    const managers = await repo.users.lockActiveManagers(tx)
    if (managers.includes(cur.id) && managers.length <= 1) throw new ConflictError('LAST_MANAGER')
  }

  const before: Record<string, unknown> = {}
  const after: Record<string, unknown> = {}
  const changes: repo.users.UserUpdate = {}
  for (const key of Object.keys(next) as Array<keyof typeof next>) {
    const value = next[key]
    if (value !== cur[key]) {
      before[key] = cur[key]
      after[key] = value
      Object.assign(changes, { [key]: value })
    }
  }
  if (Object.keys(changes).length > 0) {
    try {
      await repo.users.updateUser(tx, cur.id, changes)
    } catch (e) {
      if (isEmailUniqueViolation(e)) throw emailTaken()
      throw e
    }
  }
  const schedule = sortDays(input.schedule)
  const curSchedule = await repo.users.getScheduleDays(tx, cur.id)
  if (!sameSchedule(curSchedule, schedule)) {
    await repo.users.replaceSchedule(tx, cur.id, schedule)
    before.schedule = curSchedule
    after.schedule = schedule
  }
  await audit.log(tx, actor, {
    entity: 'user',
    entityId: cur.id,
    action: 'update',
    summary: th.audit.employeeUpdated(displayName({ name: next.name, nickname: next.nickname })),
    before,
    after,
  })
}

/**
 * banned=true, ban_reason='DEACTIVATED', ban_expires=null, deactivated_on=today, sessions deleted (AC-104, M1-D13).
 * Self → SELF_DEACTIVATE; last active manager → LAST_MANAGER. Already deactivated → no change, no audit row.
 */
export async function deactivateEmployee(
  tx: DbOrTx,
  actor: { id: string },
  input: { userId: string; today: ISODate },
): Promise<{ name: string }> {
  if (actor.id === input.userId) throw new ConflictError('SELF_DEACTIVATE')
  const cur = await repo.users.getUserOrNotFound(tx, input.userId)
  const name = displayName(cur)
  if (!cur.active) return { name }
  if (cur.role === 'manager') {
    const managers = await repo.users.lockActiveManagers(tx)
    if (managers.includes(cur.id) && managers.length <= 1) throw new ConflictError('LAST_MANAGER')
  }
  await repo.users.updateUser(tx, cur.id, {
    banned: true,
    banReason: 'DEACTIVATED',
    banExpires: null,
    deactivatedOn: input.today,
  })
  await repo.sessions.deleteAllSessions(tx, cur.id)
  await audit.log(tx, actor, {
    entity: 'user',
    entityId: cur.id,
    action: 'update',
    summary: th.audit.employeeDeactivated(name),
    before: { deactivatedOn: null },
    after: { deactivatedOn: input.today },
  })
  return { name }
}

/** Clears banned, ban_reason, ban_expires, deactivated_on (FR-205). Already active → no change, no audit row. */
export async function reactivateEmployee(
  tx: DbOrTx,
  actor: Actor,
  input: { userId: string },
): Promise<{ name: string }> {
  const cur = await repo.users.getUserOrNotFound(tx, input.userId)
  const name = displayName(cur)
  if (cur.active) return { name }
  await repo.users.updateUser(tx, cur.id, {
    banned: false,
    banReason: null,
    banExpires: null,
    deactivatedOn: null,
  })
  await audit.log(tx, actor, {
    entity: 'user',
    entityId: cur.id,
    action: 'update',
    summary: th.audit.employeeReactivated(name),
    before: { deactivatedOn: cur.deactivatedOn },
    after: { deactivatedOn: null },
  })
  return { name }
}

/** setCredentialHash; must_change_password=true; all sessions deleted (FR-204). */
export async function resetEmployeePassword(
  tx: DbOrTx,
  actor: Actor,
  input: { userId: string; passwordHash: string },
): Promise<{ name: string }> {
  const cur = await repo.users.getUserOrNotFound(tx, input.userId)
  await repo.accounts.setCredentialHash(tx, cur.id, input.passwordHash)
  await repo.users.updateUser(tx, cur.id, { mustChangePassword: true })
  await repo.sessions.deleteAllSessions(tx, cur.id)
  const name = displayName(cur)
  await audit.log(tx, actor, {
    entity: 'user',
    entityId: cur.id,
    action: 'update',
    summary: th.audit.employeePasswordReset(name),
    after: { passwordChanged: true, mustChangePassword: true },
  })
  return { name }
}
