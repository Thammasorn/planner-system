// tests/helpers/factories.ts — test data inserted with plain Drizzle through the schema (M1-D19, X59, X91).
// Ids are real v4 UUIDs. Later milestones append makeTask, … here. Never through src/server/repo/** (M2-D13).
import { randomBytes, randomUUID } from 'node:crypto'
import { hashPassword } from 'better-auth/crypto'
import { and, asc, desc, eq, gt, isNull } from 'drizzle-orm'
import { generateKeyBetween } from 'fractional-indexing'
import { DEFAULT_STATUSES, type DefaultStatusKey } from '@/domain/status'
import type { Certainty, ISODate, TaskStatusCategory } from '@/domain/types'
import { th } from '@/i18n/th'
import { db } from '@/server/db/client'
import {
  account,
  clients,
  positions,
  projectMembers,
  projects,
  session,
  taskAssignments,
  taskBlockers,
  taskStatuses,
  tasks,
  user,
  workSchedules,
  type ClientRow,
  type ProjectRow,
} from '@/server/db/schema'
import type { TaskRow } from '@/server/repo/tasks'
import type { AssignmentRow } from '@/server/repo/task-assignments'
import type { TaskBlockerRow } from '@/server/repo/task-blockers'
import type { TaskStatusRow } from '@/server/repo/task-statuses'

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

// ---------------------------------------------------------------------------------------------------------------
// M3 — task statuses, tasks, assignments, blockers (plain Drizzle, X59 / X91; plan/m03 S0.15). Every task gets a
// status of its own project (X70); a DONE status ⇔ completedOn (BR-80 / R22 invariant).
// ---------------------------------------------------------------------------------------------------------------

/** Soft delete `daysAgo` days before now (DB timestamps; the 30-day restore window, M3-D12) under `batch`. */
export interface DeletedAs {
  batch: string
  daysAgo: number
}

const deletedAt = (d: DeletedAs | undefined): Date | null =>
  d ? new Date(Date.now() - d.daysAgo * 24 * 60 * 60 * 1000) : null

export type DefaultKey = DefaultStatusKey

async function lastLiveStatusPosition(projectId: string): Promise<string | null> {
  const [row] = await db
    .select({ position: taskStatuses.position })
    .from(taskStatuses)
    .where(and(eq(taskStatuses.projectId, projectId), isNull(taskStatuses.deletedAt)))
    .orderBy(desc(taskStatuses.position), desc(taskStatuses.id))
    .limit(1)
  return row?.position ?? null
}

/** The 5 FR-621 defaults (DEFAULT_STATUSES + th names, or `rename`), appended after the project's live statuses. */
export async function makeStatuses(o: {
  project: { id: string }
  rename?: Partial<Record<DefaultKey, string>>
}): Promise<Record<DefaultKey, TaskStatusRow>> {
  let last = await lastLiveStatusPosition(o.project.id)
  const out: Partial<Record<DefaultKey, TaskStatusRow>> = {}
  for (const d of DEFAULT_STATUSES) {
    last = generateKeyBetween(last, null)
    const [row] = await db
      .insert(taskStatuses)
      .values({
        projectId: o.project.id,
        name: o.rename?.[d.key] ?? th.tasks.status.defaults[d.key],
        category: d.category,
        color: d.color,
        position: last,
      })
      .returning()
    out[d.key] = row!
  }
  return out as Record<DefaultKey, TaskStatusRow>
}

/** One status: right after `afterId` (before its next live sibling) or appended at the end. */
export async function makeStatus(o: {
  project: { id: string }
  name: string
  category: TaskStatusCategory
  color?: string
  afterId?: string
  deleted?: DeletedAs
}): Promise<TaskStatusRow> {
  let position: string
  if (o.afterId) {
    const [after] = await db
      .select({ position: taskStatuses.position })
      .from(taskStatuses)
      .where(eq(taskStatuses.id, o.afterId))
    if (!after) throw new Error(`makeStatus: afterId ${o.afterId} not found`)
    const [next] = await db
      .select({ position: taskStatuses.position })
      .from(taskStatuses)
      .where(
        and(
          eq(taskStatuses.projectId, o.project.id),
          isNull(taskStatuses.deletedAt),
          gt(taskStatuses.position, after.position),
        ),
      )
      .orderBy(asc(taskStatuses.position), asc(taskStatuses.id))
      .limit(1)
    position = generateKeyBetween(after.position, next?.position ?? null)
  } else {
    position = generateKeyBetween(await lastLiveStatusPosition(o.project.id), null)
  }
  const [row] = await db
    .insert(taskStatuses)
    .values({
      projectId: o.project.id,
      name: o.name,
      category: o.category,
      color: o.color ?? '#94A3B8',
      position,
      deletedAt: deletedAt(o.deleted),
      deletedBatch: o.deleted?.batch ?? null,
    })
    .returning()
  return row!
}

/** BR-81 / BR-82 for factories: the live status of `category` with the smallest position (makes defaults if none). */
async function firstLiveStatus(projectId: string, category: 'TODO' | 'DONE'): Promise<TaskStatusRow> {
  const pick = async () => {
    const [row] = await db
      .select()
      .from(taskStatuses)
      .where(
        and(
          eq(taskStatuses.projectId, projectId),
          isNull(taskStatuses.deletedAt),
          eq(taskStatuses.category, category),
        ),
      )
      .orderBy(asc(taskStatuses.position), asc(taskStatuses.id))
      .limit(1)
    return row
  }
  const found = await pick()
  if (found) return found
  await makeStatuses({ project: { id: projectId } })
  return (await pick())!
}

export interface MakeTaskOptions {
  project: { id: string }
  parent?: { id: string; depth: number } | null
  /** Default 'Task <n>'. */
  name?: string
  createdBy: { id: string }
  certaintyOverride?: Certainty | null
  /** Requires a DONE status (default: the project's first DONE status). */
  completedOn?: ISODate | null
  startDate?: ISODate | null
  dueDate?: ISODate | null
  notes?: string | null
  /** Default: the project's default TODO status (BR-81), or its first DONE status when completedOn is set. */
  status?: { id: string }
  deleted?: DeletedAs
}

let taskSeq = 0

/** Appended after the last live sibling (generateKeyBetween(last, null)); depth = parent.depth + 1. */
export async function makeTask(o: MakeTaskOptions): Promise<TaskRow> {
  taskSeq += 1
  const completedOn = o.completedOn ?? null
  let statusId: string
  if (o.status) {
    const [s] = await db
      .select({ category: taskStatuses.category, projectId: taskStatuses.projectId })
      .from(taskStatuses)
      .where(eq(taskStatuses.id, o.status.id))
    if (!s) throw new Error(`makeTask: status ${o.status.id} not found`)
    if ((s.category === 'DONE') !== (completedOn !== null)) {
      throw new Error('makeTask: a DONE status requires completedOn and vice versa (BR-80)')
    }
    statusId = o.status.id
  } else {
    statusId = (await firstLiveStatus(o.project.id, completedOn ? 'DONE' : 'TODO')).id
  }
  const parentId = o.parent?.id ?? null
  const [last] = await db
    .select({ position: tasks.position })
    .from(tasks)
    .where(
      and(
        eq(tasks.projectId, o.project.id),
        parentId ? eq(tasks.parentId, parentId) : isNull(tasks.parentId),
        isNull(tasks.deletedAt),
      ),
    )
    .orderBy(desc(tasks.position), desc(tasks.id))
    .limit(1)
  const depth = o.parent ? o.parent.depth + 1 : 0
  if (depth > 2) throw new Error('makeTask: depth > 2 (BR-30)')
  const [row] = await db
    .insert(tasks)
    .values({
      projectId: o.project.id,
      parentId,
      depth,
      name: o.name ?? `Task ${taskSeq}`,
      notes: o.notes ?? null,
      startDate: o.startDate ?? null,
      dueDate: o.dueDate ?? null,
      certaintyOverride: o.certaintyOverride ?? null,
      statusId,
      completedOn,
      completedBy: completedOn ? o.createdBy.id : null,
      position: generateKeyBetween(last?.position ?? null, null),
      createdBy: o.createdBy.id,
      deletedAt: deletedAt(o.deleted),
      deletedBatch: o.deleted?.batch ?? null,
    })
    .returning()
  return row!
}

export async function makeAssignment(o: {
  task: { id: string }
  user: { id: string }
  deleted?: DeletedAs
}): Promise<AssignmentRow> {
  const [row] = await db
    .insert(taskAssignments)
    .values({
      taskId: o.task.id,
      userId: o.user.id,
      deletedAt: deletedAt(o.deleted),
      deletedBatch: o.deleted?.batch ?? null,
    })
    .returning()
  return row!
}

/** `task` is blocked by `blocker` (same project, FK-enforced). */
export async function makeBlocker(o: {
  task: { id: string; projectId: string }
  blocker: { id: string }
  createdBy: { id: string }
  deleted?: DeletedAs
}): Promise<TaskBlockerRow> {
  const [row] = await db
    .insert(taskBlockers)
    .values({
      projectId: o.task.projectId,
      taskId: o.task.id,
      blockerTaskId: o.blocker.id,
      createdBy: o.createdBy.id,
      deletedAt: deletedAt(o.deleted),
      deletedBatch: o.deleted?.batch ?? null,
    })
    .returning()
  return row!
}
