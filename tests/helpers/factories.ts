// tests/helpers/factories.ts — test data inserted with plain Drizzle through the schema (M1-D19, X59, X91).
// Ids are real v4 UUIDs. Later milestones append makeTask, … here. Never through src/server/repo/** (M2-D13).
import { randomBytes, randomUUID } from 'node:crypto'
import { hashPassword } from 'better-auth/crypto'
import { asc, desc, eq } from 'drizzle-orm'
import { generateKeyBetween } from 'fractional-indexing'
import type { Certainty } from '@/domain/types'
import { db } from '@/server/db/client'
import {
  account,
  clients,
  positions,
  projectMembers,
  projects,
  session,
  user,
  workSchedules,
  type ClientRow,
  type ProjectRow,
} from '@/server/db/schema'

/** Password of every factory user. Hashed once per worker (scrypt is slow). */
export const TEST_PASSWORD = 'Test-pass-1234'

let hashPromise: Promise<string> | undefined
/** Lazily cached scrypt hash of TEST_PASSWORD. */
export function testPasswordHash(): Promise<string> {
  hashPromise ??= hashPassword(TEST_PASSWORD)
  return hashPromise
}

export interface TestUser {
  id: string
  email: string
  name: string
  nickname: string | null
  role: 'manager' | 'worker'
  positionId: string | null
  color: string | null
  mustChangePassword: boolean
  /** Always TEST_PASSWORD. */
  password: string
  /** '' for deactivated users (they have no session). */
  sessionId: string
  sessionToken: string
}

export interface MakeUserOptions {
  role?: 'manager' | 'worker'
  nickname?: string
  name?: string
  email?: string
  /** Finds or creates the position by name. */
  positionName?: string
  /** Default Mon–Fri '1.00'. */
  schedule?: Array<{ weekday: number; fraction: string }>
  /** Default false (tests opt in to the FR-104 gate). */
  mustChangePassword?: boolean
  color?: string | null
  /** banned=true, ban_reason='DEACTIVATED', deactivated_on = on; no session row. */
  deactivated?: { on: string }
}

const DEFAULT_SCHEDULE = [1, 2, 3, 4, 5].map((weekday) => ({ weekday, fraction: '1.00' }))
let seq = 0

/** user + credential account + schedule + (unless deactivated) one session row. */
export async function makeUser(o: MakeUserOptions = {}): Promise<TestUser> {
  seq += 1
  const id = randomUUID()
  const name = o.name ?? `Test User ${seq}`
  const email = (o.email ?? `user-${seq}-${id.slice(0, 8)}@example.com`).trim().toLowerCase()
  const role = o.role ?? 'worker'
  const nickname = o.nickname ?? null
  const mustChangePassword = o.mustChangePassword ?? false
  const color = o.color === undefined ? null : o.color
  const positionId = o.positionName ? (await findOrMakePosition(o.positionName)).id : null
  const passwordHash = await testPasswordHash()

  await db.insert(user).values({
    id,
    name,
    email,
    emailVerified: true,
    role,
    nickname,
    positionId,
    mustChangePassword,
    color,
    ...(o.deactivated
      ? { banned: true, banReason: 'DEACTIVATED', banExpires: null, deactivatedOn: o.deactivated.on }
      : { banned: false }),
  })
  await db
    .insert(account)
    .values({ id: randomUUID(), userId: id, accountId: id, providerId: 'credential', password: passwordHash })
  const days = o.schedule ?? DEFAULT_SCHEDULE
  if (days.length > 0) await db.insert(workSchedules).values(days.map((d) => ({ userId: id, ...d })))
  const s = o.deactivated ? { id: '', token: '' } : await makeSession(id)

  return {
    id,
    email,
    name,
    nickname,
    role,
    positionId,
    color,
    mustChangePassword,
    password: TEST_PASSWORD,
    sessionId: s.id,
    sessionToken: s.token,
  }
}

/** Appends a position (key after the current last one unless given). */
export async function makePosition(
  name: string,
  position?: string,
): Promise<{ id: string; name: string; position: string }> {
  let key = position
  if (key === undefined) {
    const [last] = await db
      .select({ position: positions.position })
      .from(positions)
      .orderBy(desc(positions.position), desc(positions.id))
      .limit(1)
    key = generateKeyBetween(last?.position ?? null, null)
  }
  const [row] = await db
    .insert(positions)
    .values({ name, position: key })
    .returning({ id: positions.id, name: positions.name, position: positions.position })
  return row!
}

async function findOrMakePosition(name: string): Promise<{ id: string; name: string; position: string }> {
  const [row] = await db
    .select({ id: positions.id, name: positions.name, position: positions.position })
    .from(positions)
    .where(eq(positions.name, name))
  return row ?? makePosition(name)
}

/** A raw session row (the token is NOT a signed cookie value; sign in over HTTP for real cookies). */
export async function makeSession(
  userId: string,
  o: { token?: string; expiresAt?: Date } = {},
): Promise<{ id: string; token: string }> {
  const id = randomUUID()
  const token = o.token ?? randomBytes(24).toString('base64url')
  await db.insert(session).values({
    id,
    token,
    userId,
    expiresAt: o.expiresAt ?? new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    ipAddress: '127.0.0.1',
    userAgent: 'vitest',
  })
  return { id, token }
}

// ---------------------------------------------------------------------------------------------------------------
// M2 — clients, projects, members (plain Drizzle, M2-D13 / X91)
// ---------------------------------------------------------------------------------------------------------------

let clientSeq = 0
let projectSeq = 0

export interface MakeClientOptions {
  /** Default 'Client <n>'. */
  name?: string
  code?: string
  color?: string
  /** archived_at = now() */
  archived?: boolean
}

export async function makeClient(o: MakeClientOptions = {}): Promise<ClientRow> {
  clientSeq += 1
  const [row] = await db
    .insert(clients)
    .values({
      name: o.name ?? `Client ${clientSeq}`,
      code: o.code ?? null,
      color: o.color ?? null,
      archivedAt: o.archived ? new Date() : null,
    })
    .returning()
  return row!
}

export interface MakeProjectOptions {
  /** LEAD row (none when null / omitted). */
  lead?: TestUser | null
  /** MEMBER rows. */
  members?: TestUser[]
  client?: ClientRow | null
  /** Default CONFIRMED (DB default). */
  certainty?: Certainty
  /** archived_at = now() */
  archived?: boolean
  /** Default 'Project <n>'. */
  name?: string
  /** Default: the first manager in the DB (oldest), else a new manager. Also `added_by` of the member rows. */
  createdBy?: TestUser
}

async function defaultCreatorId(): Promise<string> {
  const [m] = await db
    .select({ id: user.id })
    .from(user)
    .where(eq(user.role, 'manager'))
    .orderBy(asc(user.createdAt), asc(user.id))
    .limit(1)
  return m?.id ?? (await makeUser({ role: 'manager' })).id
}

export async function makeProject(o: MakeProjectOptions = {}): Promise<ProjectRow> {
  projectSeq += 1
  const createdBy = o.createdBy?.id ?? (await defaultCreatorId())
  const [row] = await db
    .insert(projects)
    .values({
      name: o.name ?? `Project ${projectSeq}`,
      clientId: o.client?.id ?? null,
      ...(o.certainty ? { certainty: o.certainty } : {}),
      archivedAt: o.archived ? new Date() : null,
      createdBy,
    })
    .returning()
  const project = row!
  const memberRows = [
    ...(o.lead ? [{ userId: o.lead.id, role: 'LEAD' as const }] : []),
    ...(o.members ?? []).map((m) => ({ userId: m.id, role: 'MEMBER' as const })),
  ]
  if (memberRows.length > 0) {
    await db
      .insert(projectMembers)
      .values(memberRows.map((m) => ({ projectId: project.id, ...m, addedBy: createdBy })))
  }
  return project
}
