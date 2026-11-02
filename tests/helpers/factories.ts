// tests/helpers/factories.ts — test data inserted with plain Drizzle through the schema (M1-D19, X59, X91).
// Ids are real v4 UUIDs. Later milestones append makeTask, … here. Never through src/server/repo/** (M2-D13).
import { randomBytes, randomUUID } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { hashPassword } from 'better-auth/crypto'
import { and, asc, desc, eq, gt, isNull, sql } from 'drizzle-orm'
import { generateKeyBetween } from 'fractional-indexing'
import { addDays, weekStart } from '@/domain/dates'
import { DEFAULT_STATUSES, type DefaultStatusKey } from '@/domain/status'
import type { Cd, Certainty, HalfDay, ISODate, TaskStatusCategory } from '@/domain/types'
import { cdToNumeric, numericToCd } from '@/domain/units'
import { th } from '@/i18n/th'
import type { PageSpace } from '@/lib/contracts/pages'
import { extractContentText } from '@/lib/editor/content-text'
import { db } from '@/server/db/client'
import {
  account,
  allocations,
  clients,
  files,
  holidays,
  leaveTypes,
  milestones,
  pages,
  planMarkers,
  positions,
  projectMembers,
  projects,
  session,
  taskAssignments,
  taskBlockers,
  taskStatuses,
  tasks,
  timeOff,
  user,
  workSchedules,
  type ClientRow,
  type FileRow,
  type HolidayRow,
  type LeaveTypeRow,
  type MilestoneDbRow,
  type PageRow,
  type PlanMarkerDbRow,
  type ProjectRow,
  type ProjectMemberRow,
  type TimeOffRow,
} from '@/server/db/schema'
import type { AllocRow } from '@/server/repo/allocations'
import type { TaskRow } from '@/server/repo/tasks'
import type { AssignmentRow } from '@/server/repo/task-assignments'
import type { TaskBlockerRow } from '@/server/repo/task-blockers'
import type { TaskStatusRow } from '@/server/repo/task-statuses'
import { pdfBytes, PNG_1X1 } from './files'

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

// ---------------------------------------------------------------------------------------------------------------
// M4 — pages and files (plain Drizzle + node:fs, X59 / X91; plan/m04 S0.15). No dependency on src/server/repo or
// src/server/storage.ts.
// ---------------------------------------------------------------------------------------------------------------

export interface MakePageOptions {
  /** Default: PROJECT when `project` is given, else the parent's space, else WORKSPACE. */
  space?: PageSpace
  project?: { id: string } | null
  parent?: PageRow | null
  /** Default 'Page <n>'. */
  title?: string
  createdBy: { id: string }
  locked?: boolean
  isCharter?: boolean
  icon?: string | null
  /** Default []. */
  content?: unknown[]
  /** Default extractContentText(content). */
  contentText?: string
  deleted?: DeletedAs
}

let pageSeq = 0

/** Appended after the last live sibling (generateKeyBetween(last, null)); depth = parent.depth + 1. */
export async function makePage(o: MakePageOptions): Promise<PageRow> {
  pageSeq += 1
  const projectId = o.project?.id ?? o.parent?.projectId ?? null
  const space: PageSpace = o.space ?? (o.project ? 'PROJECT' : (o.parent?.space ?? 'WORKSPACE'))
  const parentId = o.parent?.id ?? null
  const [last] = await db
    .select({ position: pages.position })
    .from(pages)
    .where(
      and(
        eq(pages.space, space),
        projectId ? eq(pages.projectId, projectId) : isNull(pages.projectId),
        parentId ? eq(pages.parentId, parentId) : isNull(pages.parentId),
        isNull(pages.deletedAt),
      ),
    )
    .orderBy(desc(pages.position), desc(pages.id))
    .limit(1)
  const content = o.content ?? []
  const [row] = await db
    .insert(pages)
    .values({
      space,
      projectId,
      parentId,
      depth: o.parent ? o.parent.depth + 1 : 0,
      title: o.title ?? `Page ${pageSeq}`,
      icon: o.icon ?? null,
      content,
      contentText: o.contentText ?? extractContentText(content),
      isCharter: o.isCharter ?? false,
      locked: o.locked ?? false,
      position: generateKeyBetween(last?.position ?? null, null),
      createdBy: o.createdBy.id,
      updatedBy: o.createdBy.id,
      deletedAt: deletedAt(o.deleted),
      deletedBatch: o.deleted?.batch ?? null,
    })
    .returning()
  return row!
}

export interface MakeFileOptions {
  page: PageRow
  uploadedBy: { id: string }
  /** Default IMAGE. */
  kind?: 'IMAGE' | 'ATTACHMENT'
  /** Default 'image.png' / 'file.pdf'. */
  name?: string
  /** Default a 1×1 PNG / a minimal PDF. */
  bytes?: Uint8Array
  /** Default image/png / application/pdf. */
  mime?: string
}

/**
 * Writes the bytes with plain node:fs to `UPLOAD_DIR/2026/09/<uuid>.<ext>` (mkdir -p) and inserts the files row
 * (project_id = the page's project, null for wiki pages).
 */
export async function makeFile(o: MakeFileOptions): Promise<FileRow> {
  const kind = o.kind ?? 'IMAGE'
  const name = o.name ?? (kind === 'IMAGE' ? 'image.png' : 'file.pdf')
  const bytes = o.bytes ?? (kind === 'IMAGE' ? PNG_1X1 : pdfBytes())
  const mime = o.mime ?? (kind === 'IMAGE' ? 'image/png' : 'application/pdf')
  const dot = name.lastIndexOf('.')
  const ext =
    (dot >= 0 ? name.slice(dot + 1).toLowerCase() : '').replace(/[^a-z0-9]/g, '').slice(0, 5) || 'bin'
  const storageKey = `2026/09/${randomUUID()}.${ext}`
  const root = process.env.UPLOAD_DIR
  if (!root) throw new Error('makeFile: UPLOAD_DIR is not set (tests/setup/db-worker.ts sets it per worker)')
  const full = path.join(root, storageKey)
  await mkdir(path.dirname(full), { recursive: true })
  await writeFile(full, bytes)
  const [row] = await db
    .insert(files)
    .values({
      storageKey,
      originalName: name,
      mime,
      sizeBytes: bytes.length,
      kind,
      pageId: o.page.id,
      projectId: o.page.projectId,
      uploadedBy: o.uploadedBy.id,
    })
    .returning()
  return row!
}

// ---------------------------------------------------------------------------------------------------------------
// M6.1 — task bodies (plan/m06.1 S0.15): TASK pages inserted with plain Drizzle (never through src/server/repo/**).
// ---------------------------------------------------------------------------------------------------------------

export interface MakeTaskBodyOptions {
  task: {
    id: string
    projectId: string
    createdBy: string
    deletedAt?: Date | null
    deletedBatch?: string | null
  }
  /** Default [] (an empty body row, as ensureTaskBody creates it). A string = one paragraph. */
  content?: unknown[] | string
  fullWidth?: boolean
  /** Default: the task's created_by. */
  createdBy?: { id: string }
  /** Soft-deleted with this batch (e.g. the task delete batch, FR-689). */
  deleted?: DeletedAs
  version?: number
}

/** A TASK page for `task` (kind 'TASK', key 'a0', title '', space PROJECT, content_text via extractContentText). */
export async function makeTaskBody(o: MakeTaskBodyOptions): Promise<PageRow> {
  const content: unknown[] =
    typeof o.content === 'string' ? [{ type: 'paragraph', content: o.content }] : (o.content ?? [])
  const by = o.createdBy?.id ?? o.task.createdBy
  const [row] = await db
    .insert(pages)
    .values({
      space: 'PROJECT',
      projectId: o.task.projectId,
      kind: 'TASK',
      taskId: o.task.id,
      title: '',
      content,
      contentText: extractContentText(content),
      fullWidth: o.fullWidth ?? false,
      version: o.version ?? 1,
      position: 'a0',
      createdBy: by,
      updatedBy: by,
      deletedAt: deletedAt(o.deleted),
      deletedBatch: o.deleted?.batch ?? null,
    })
    .returning()
  return row!
}

// ---------------------------------------------------------------------------------------------------------------
// M5 — holidays, leave types, leave, extra memberships (plain Drizzle, X59 / X91; plan/m05 S0.15). Never through
// src/server/repo/**.
// ---------------------------------------------------------------------------------------------------------------

/** One more project_members row for an existing project (world parts that add people to P / Q). */
export async function makeMembership(o: {
  project: { id: string }
  user: { id: string }
  role?: 'LEAD' | 'MEMBER'
  addedBy: { id: string }
}): Promise<ProjectMemberRow> {
  const [row] = await db
    .insert(projectMembers)
    .values({ projectId: o.project.id, userId: o.user.id, role: o.role ?? 'MEMBER', addedBy: o.addedBy.id })
    .returning()
  return row!
}

let holidaySeq = 0

/** Default date 2027-01-01 + (n − 1) days, name 'วันหยุดทดสอบ n'. */
export async function makeHoliday(o: { date?: ISODate; name?: string } = {}): Promise<HolidayRow> {
  holidaySeq += 1
  const [row] = await db
    .insert(holidays)
    .values({
      date: o.date ?? addDays('2027-01-01', holidaySeq - 1),
      name: o.name ?? `วันหยุดทดสอบ ${holidaySeq}`,
    })
    .returning()
  return row!
}

let leaveTypeSeq = 0

/** Appended after the last type (generateKeyBetween(last by position, id, null)); `archived` → archived_at = now(). */
export async function makeLeaveType(
  o: { name?: string; color?: string; archived?: boolean } = {},
): Promise<LeaveTypeRow> {
  leaveTypeSeq += 1
  const [last] = await db
    .select({ position: leaveTypes.position })
    .from(leaveTypes)
    .orderBy(desc(leaveTypes.position), desc(leaveTypes.id))
    .limit(1)
  const [row] = await db
    .insert(leaveTypes)
    .values({
      name: o.name ?? `ประเภทลาทดสอบ ${leaveTypeSeq}`,
      color: o.color ?? '#94A3B8',
      position: generateKeyBetween(last?.position ?? null, null),
      archivedAt: o.archived ? new Date() : null,
    })
    .returning()
  return row!
}

export interface MakeTimeOffOptions {
  user: { id: string }
  leaveType: { id: string }
  startDate: ISODate
  /** Default startDate. */
  endDate?: ISODate
  /** Default null (full day). */
  half?: HalfDay | null
  note?: string | null
  /** Default the owner (self-recorded). */
  createdBy?: { id: string }
  /** deleted_at = now() − daysAgo days (DB clock, the 30-day restore window), deleted_batch = batch. */
  deleted?: DeletedAs
}

export async function makeTimeOff(o: MakeTimeOffOptions): Promise<TimeOffRow> {
  const [row] = await db
    .insert(timeOff)
    .values({
      userId: o.user.id,
      leaveTypeId: o.leaveType.id,
      startDate: o.startDate,
      endDate: o.endDate ?? o.startDate,
      half: o.half ?? null,
      note: o.note ?? null,
      createdBy: (o.createdBy ?? o.user).id,
      deletedAt: o.deleted ? sql`now() - make_interval(days => ${o.deleted.daysAgo})` : null,
      deletedBatch: o.deleted?.batch ?? null,
    })
    .returning()
  return row!
}

// ---------------------------------------------------------------------------------------------------------------
// M6 — allocations (plan/m06 S0.11, PLAN §4.3). Plain Drizzle (X59): no lock / version bump; tests that need
// BR-20b behaviour go through services.allocations. numeric ↔ cd with the domain converters only.
// ---------------------------------------------------------------------------------------------------------------

/** One allocation row: WEEK (default) on the Monday of `period`, or DAY on `period`; weekStart = weekStart(period). */
export async function makeAllocation(o: {
  assignment: { id: string }
  period: ISODate
  cd: Cd
  granularity?: 'WEEK' | 'DAY'
}): Promise<AllocRow> {
  const granularity = o.granularity ?? 'WEEK'
  const week = weekStart(o.period)
  const [row] = await db
    .insert(allocations)
    .values({
      taskAssignmentId: o.assignment.id,
      granularity,
      periodStart: granularity === 'WEEK' ? week : o.period,
      weekStart: week,
      personDays: cdToNumeric(o.cd),
    })
    .returning()
  return {
    taskAssignmentId: row!.taskAssignmentId,
    granularity: row!.granularity,
    periodStart: row!.periodStart,
    weekStart: row!.weekStart,
    cd: numericToCd(row!.personDays),
  }
}

/** The rows of one (assignment, week) — bounded by `week_start = week` (SPEC §6.5) — sorted by granularity, period. */
export async function allocationRows(
  assignmentId: string,
  week: ISODate,
): Promise<{ granularity: 'WEEK' | 'DAY'; periodStart: ISODate; cd: Cd }[]> {
  const rows = await db
    .select({
      granularity: allocations.granularity,
      periodStart: allocations.periodStart,
      personDays: allocations.personDays,
    })
    .from(allocations)
    .where(and(eq(allocations.taskAssignmentId, assignmentId), eq(allocations.weekStart, week)))
    .orderBy(asc(allocations.granularity), asc(allocations.periodStart))
  return rows.map((r) => ({
    granularity: r.granularity,
    periodStart: r.periodStart,
    cd: numericToCd(r.personDays),
  }))
}

/** M7: DAY rows of one week (all dates in the same Monday-week; week_start = weekStart(date)); zero values skipped.
 *  Plain Drizzle (X59); the caller makes sure the week has no WEEK row (the M6 trigger rejects mixing). */
export async function makeDayAllocations(o: {
  assignment: { id: string }
  days: Record<ISODate, Cd>
}): Promise<void> {
  const entries = Object.entries(o.days).filter(([, cd]) => cd > 0)
  if (entries.length === 0) return
  const week = weekStart(entries[0]![0])
  for (const [date] of entries)
    if (weekStart(date) !== week) throw new Error(`makeDayAllocations: ${date} is not in the week of ${week}`)
  await db.insert(allocations).values(
    entries.map(([date, cd]) => ({
      taskAssignmentId: o.assignment.id,
      granularity: 'DAY' as const,
      periodStart: date,
      weekStart: week,
      personDays: cdToNumeric(cd),
    })),
  )
}

/** Current `task_assignments.version` (BR-20b optimistic concurrency). */
export async function assignmentVersion(assignmentId: string): Promise<number> {
  const [row] = await db
    .select({ version: taskAssignments.version })
    .from(taskAssignments)
    .where(eq(taskAssignments.id, assignmentId))
  if (!row) throw new Error(`assignmentVersion: assignment ${assignmentId} not found`)
  return row.version
}

// ---------------------------------------------------------------------------------------------------------------
// M7.1 — plan markers (plan/m07.1 S0.11). Plain Drizzle (X59); `deleted` = soft-deleted with that batch.
// ---------------------------------------------------------------------------------------------------------------

export async function makePlanMarker(o: {
  projectId: string
  date: ISODate
  color?: 'RED' | 'YELLOW' | 'GREEN'
  label?: string | null
  createdBy: string | { id: string }
  deleted?: { daysAgo: number; batch: string }
}): Promise<PlanMarkerDbRow> {
  const [row] = await db
    .insert(planMarkers)
    .values({
      projectId: o.projectId,
      date: o.date,
      color: o.color ?? 'RED',
      label: o.label ?? null,
      createdBy: typeof o.createdBy === 'string' ? o.createdBy : o.createdBy.id,
      deletedAt: o.deleted ? sql`now() - make_interval(days => ${o.deleted.daysAgo})` : null,
      deletedBatch: o.deleted?.batch ?? null,
    })
    .returning()
  return row!
}

// ── M8 (plan/m08 S0.10, X59/X70) ────────────────────────────────────────────────────────────────────────────────────

/** A milestone (plain Drizzle). `deleted` soft-deletes it `daysAgo` days before now() with that batch. Never inserts
 *  tasks (X70): bind existing ones with bindTask. */
export async function makeMilestone(o: {
  project: { id: string }
  name?: string
  date: ISODate
  createdBy: { id: string }
  completedOn?: ISODate | null
  description?: string | null
  deleted?: { batch: string; daysAgo: number }
}): Promise<MilestoneDbRow> {
  const [row] = await db
    .insert(milestones)
    .values({
      projectId: o.project.id,
      name: o.name ?? 'Milestone',
      date: o.date,
      description: o.description ?? null,
      completedOn: o.completedOn ?? null,
      createdBy: o.createdBy.id,
      deletedAt: o.deleted ? sql`now() - make_interval(days => ${o.deleted.daysAgo})` : null,
      deletedBatch: o.deleted?.batch ?? null,
    })
    .returning()
  return row!
}

/** UPDATE tasks SET milestone_id (raw column; null unbinds). Same-project is not checked here (the service does). */
export async function bindTask(task: { id: string }, milestone: { id: string } | null): Promise<void> {
  await db
    .update(tasks)
    .set({ milestoneId: milestone?.id ?? null })
    .where(eq(tasks.id, task.id))
}

/** M9 (plan/m09 S0.11, X64): deactivate an existing user from `on` — banned = true, ban_reason 'DEACTIVATED',
 *  deactivated_on = on (same columns as makeUser({ deactivated })); their sessions are removed. Plain Drizzle. */
export async function deactivateUser(u: { id: string }, on: ISODate): Promise<void> {
  await db
    .update(user)
    .set({ banned: true, banReason: 'DEACTIVATED', banExpires: null, deactivatedOn: on })
    .where(eq(user.id, u.id))
  await db.delete(session).where(eq(session.userId, u.id))
}
