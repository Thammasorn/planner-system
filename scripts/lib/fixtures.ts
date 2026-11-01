// scripts/lib/fixtures.ts — golden seed (SPEC §11.3, X11, SEED-A1, PLAN.md §3.13). Builders go through the real
// services (audit with actor = null). M5 widens FixtureId to 'F2' | 'F3' | 'F4' and adds applyFixture; later
// milestones add stages. Reads docs/reference/golden-fixtures.json (never re-typed; seeds/tests only, never runtime).
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { hashPassword } from 'better-auth/crypto'
import { and, eq, inArray, isNull } from 'drizzle-orm'
import { z } from 'zod'
import { addWeeks, weekStart } from '@/domain/dates'
import { defaultStatus } from '@/domain/status'
import type { Cd, ISODate } from '@/domain/types'
import { cdToNumeric } from '@/domain/units'
import { th } from '@/i18n/th'
import {
  allocations,
  auditLog,
  type NewAllocation,
  projects,
  taskAssignments,
  tasks,
  user,
} from '@/server/db/schema'
import type { DbOrTx } from '@/server/db/types'
import * as repo from '@/server/repo'
import * as services from '@/server/services'
import { ALLOCATION_AUDIT_ENTITY } from '@/server/services/allocations'
import { ensureProjectCharters } from '@/server/services/charters'

/** Seed stages in order; `upTo` stops after the named stage. M1 'users': positions + users + schedules ·
 *  M2 'projects': clients + projects + memberships (+ M3's 5 default statuses per project, X70) ·
 *  M3 'tasks': tasks + assignments (X11 M3 part, M3-D20) · M4 'pages': one Project Charter per project through
 *  ensureProjectCharters (X11 M4 part, X25; one actor-null `page` audit row each, M4-D5) · M6 'allocations': the
 *  JSON's WEEK plans per assignment (X11 M6 part, M6-D23; one actor-null `allocation` audit row per assignment). */
export type GoldenStage = 'users' | 'projects' | 'tasks' | 'pages' | 'allocations'
const STAGES: readonly GoldenStage[] = ['users', 'projects', 'tasks', 'pages', 'allocations']

/** SPEC §11.3 fixtures beyond F1 (X11, X91): each = the golden seed (F1) + its own setup only (not cumulative).
 *  resetDb(fixture) in e2e and `pnpm seed:golden --fixture=F3` take one of these. */
export type FixtureId = 'F2' | 'F3' | 'F4'

const FractionCd = z.union([z.literal(25), z.literal(50), z.literal(75), z.literal(100)])

const FixtureSetup = z.object({
  setup: z.object({
    holidays: z.array(z.object({ date: z.iso.date(), name: z.string() })).optional(),
    timeOff: z
      .array(
        z.object({
          user: z.string(),
          startDate: z.iso.date(),
          endDate: z.iso.date(),
          half: z.enum(['AM', 'PM']).nullable(),
          type: z.string(),
        }),
      )
      .optional(),
  }),
})

const GoldenUsers = z.object({
  positions: z.array(z.string()),
  users: z.array(
    z.object({
      nickname: z.string(),
      name: z.string(),
      email: z.string(),
      position: z.string(),
      role: z.enum(['manager', 'worker']),
      devPassword: z.string(),
      scheduleCd: z.record(z.string(), FractionCd),
    }),
  ),
  clients: z.array(z.string()),
  projects: z.array(
    z.object({
      name: z.string(),
      client: z.string().nullable(),
      certainty: z.enum(['CONFIRMED', 'TENTATIVE']),
      lead: z.string().nullable(),
    }),
  ),
  /** M2: MEMBER rows = distinct assignees (X11) · M3: name + certainty override · M6: plans (cd per Monday). */
  tasks: z.array(
    z.object({
      project: z.string(),
      name: z.string(),
      assignee: z.string().nullable(),
      certaintyOverride: z.enum(['CONFIRMED', 'TENTATIVE']).nullable(),
      granularity: z.enum(['WEEK', 'DAY']),
      allocationsCd: z.record(z.iso.date(), z.number().int().positive()),
    }),
  ),
  /** M5 (X11): the own setup of each §11.3 fixture beyond F1 (`expected.<id>.setup`). */
  expected: z.object({ F2: FixtureSetup, F3: FixtureSetup, F4: FixtureSetup }),
})
export type Golden = z.infer<typeof GoldenUsers>

export const GOLDEN_PATH = path.join(process.cwd(), 'docs/reference/golden-fixtures.json')

let cached: Golden | undefined
/** The parts of the golden JSON the seed uses so far (positions, users, clients, projects, task assignees). */
export function loadGolden(): Golden {
  cached ??= GoldenUsers.parse(JSON.parse(readFileSync(GOLDEN_PATH, 'utf8')))
  return cached
}

/** Ids the later stages need: users by nickname, the golden manager (creator / added_by of seeded rows). */
interface SeedCtx {
  userIds: Map<string, string>
  managerId: string
}

const reached = (upTo: GoldenStage | undefined, stage: GoldenStage): boolean =>
  upTo === undefined || STAGES.indexOf(stage) <= STAGES.indexOf(upTo)

/** Inserts the golden data stage by stage (`upTo` stops after the named stage). Users go through the services (audit
 *  with actor = null); clients / projects / members through repo inserts without audit rows (M2-D12). */
export async function seedGolden(db: DbOrTx, opts: { upTo?: GoldenStage } = {}): Promise<void> {
  const ctx = await seedUsers(db)
  if (!reached(opts.upTo, 'projects')) return
  await seedClientsProjects(db, ctx)
  await services.taskStatuses.ensureAllProjectStatuses(db) // X70: 5 defaults per project
  if (!reached(opts.upTo, 'tasks')) return
  await seedTasks(db, ctx)
  if (!reached(opts.upTo, 'pages')) return
  await ensureProjectCharters(db) // X11 / X25: the 5 golden charters (FR-402)
  if (!reached(opts.upTo, 'allocations')) return
  await seedAllocations(db)
}

async function seedUsers(db: DbOrTx): Promise<SeedCtx> {
  const g = loadGolden()
  const positionIds = new Map<string, string>()
  for (const name of g.positions) {
    const { id } = await services.positions.createPosition(db, null, { name })
    positionIds.set(name, id)
  }
  // M5-D12: the 4 default leave types right after positions (actor-null audit rows), so applyFixture finds them.
  await services.leaveTypes.ensureDefaultLeaveTypes(db, null)
  const hashes = new Map<string, string>()
  for (const pw of new Set(g.users.map((u) => u.devPassword))) hashes.set(pw, await hashPassword(pw))
  const userIds = new Map<string, string>()
  let managerId: string | undefined
  for (const u of g.users) {
    const positionId =
      positionIds.get(u.position) ?? (await repo.positions.findPositionIdByName(db, u.position))
    const { userId } = await services.employees.createEmployee(db, null, {
      name: u.name,
      nickname: u.nickname,
      email: u.email.trim().toLowerCase(),
      role: u.role,
      positionId,
      mustChangePassword: false,
      schedule: Object.entries(u.scheduleCd)
        .map(([weekday, fractionCd]) => ({ weekday: Number(weekday), fractionCd }))
        .sort((a, b) => a.weekday - b.weekday),
      passwordHash: hashes.get(u.devPassword)!,
    })
    userIds.set(u.nickname, userId)
    if (u.role === 'manager') managerId ??= userId
  }
  if (!managerId) throw new Error('golden fixtures have no manager')
  return { userIds, managerId }
}

/**
 * M2 (X11, M2-D12): clients and projects in JSON order (clients carry only names; projects the default colour and
 * created_by = the golden manager); LEAD = `projects[].lead`, MEMBER = distinct task assignees of the project minus
 * its LEAD, in task order; added_by = the manager. No audit rows (seeding is not a user operation).
 */
export async function seedClientsProjects(db: DbOrTx, ctx: SeedCtx): Promise<void> {
  const g = loadGolden()
  const userId = (nickname: string): string => {
    const id = ctx.userIds.get(nickname)
    if (!id) throw new Error(`golden user ${nickname} not found`)
    return id
  }
  const clientIds = new Map<string, string>()
  for (const name of g.clients) clientIds.set(name, (await repo.clients.insertClient(db, { name })).id)
  for (const p of g.projects) {
    const clientId = p.client === null ? null : clientIds.get(p.client)
    if (clientId === undefined) throw new Error(`golden client ${p.client} not found`)
    const project = await repo.projects.insertProject(db, {
      name: p.name,
      clientId,
      certainty: p.certainty,
      createdBy: ctx.managerId,
    })
    const members: Array<{ nickname: string; role: 'LEAD' | 'MEMBER' }> = p.lead
      ? [{ nickname: p.lead, role: 'LEAD' }]
      : []
    for (const t of g.tasks) {
      if (t.project !== p.name || !t.assignee) continue
      if (!members.some((m) => m.nickname === t.assignee))
        members.push({ nickname: t.assignee, role: 'MEMBER' })
    }
    for (const m of members) {
      await repo.members.insertMember(db, {
        projectId: project.id,
        userId: userId(m.nickname),
        role: m.role,
        addedBy: ctx.managerId,
      })
    }
  }
}

/**
 * M3 (X11, M3-D20): per project, the JSON `tasks[]` of that project in file order — positions from
 * generateNKeysBetween(null, null, n), all depth 0 on the project's default status (BR-81), created_by = the golden
 * manager — and one assignment per task. No audit rows (seeding is not a user operation); no allocations (M6).
 */
export async function seedTasks(db: DbOrTx, ctx: SeedCtx): Promise<void> {
  const g = loadGolden()
  const projectIds = new Map(
    (await repo.projects.listProjects(db, { ids: 'ALL' })).map((p) => [p.name, p.id]),
  )
  for (const p of g.projects) {
    const projectId = projectIds.get(p.name)
    if (!projectId) throw new Error(`golden project ${p.name} not found`)
    const mine = g.tasks.filter((t) => t.project === p.name)
    if (mine.length === 0) continue
    const status = defaultStatus(await repo.statuses.listLiveStatuses(db, projectId))
    const keys = repo.order.rekey(mine.length)
    for (const [i, t] of mine.entries()) {
      const task = await repo.tasks.insertTask(db, {
        projectId,
        name: t.name,
        depth: 0,
        position: keys[i]!,
        certaintyOverride: t.certaintyOverride,
        createdBy: ctx.managerId,
        statusId: status.id,
      })
      if (!t.assignee) continue
      const userId = ctx.userIds.get(t.assignee)
      if (!userId) throw new Error(`golden user ${t.assignee} not found`)
      await repo.assignments.insertAssignment(db, { taskId: task.id, userId })
    }
  }
}

// ---------------------------------------------------------------------------------------------------------------
// M6 — golden plans + the synthetic perf grid (X11, X92, M6-D22/D23; plan/m06 S0.10)
// ---------------------------------------------------------------------------------------------------------------

/**
 * M6 (X11, M6-D23): for each JSON task with an assignee, its `allocationsCd` weeks as rows of `granularity` (WEEK in
 * F1: period_start = week_start = the Monday) via plain Drizzle (X59; the assignments are new in this transaction, so
 * no lock is needed), then one actor-null `allocation` audit row per assignment (`th.audit.allocationsSeeded(n)`).
 */
export async function seedAllocations(db: DbOrTx): Promise<void> {
  const g = loadGolden()
  const live = await db
    .select({ id: taskAssignments.id, project: projects.name, projectId: projects.id, task: tasks.name })
    .from(taskAssignments)
    .innerJoin(tasks, eq(tasks.id, taskAssignments.taskId))
    .innerJoin(projects, eq(projects.id, tasks.projectId))
  const byTask = new Map(live.map((a) => [`${a.project}\u0000${a.task}`, a]))
  for (const t of g.tasks) {
    const weeks = Object.entries(t.allocationsCd).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    if (!t.assignee || weeks.length === 0) continue
    const a = byTask.get(`${t.project}\u0000${t.name}`)
    if (!a) throw new Error(`golden assignment for ${t.project} / ${t.name} not found`)
    const rows: NewAllocation[] = weeks.map(([week, cd]) => ({
      taskAssignmentId: a.id,
      granularity: t.granularity,
      periodStart: week,
      weekStart: week,
      personDays: cdToNumeric(cd),
    }))
    await db.insert(allocations).values(rows)
    // Plain insert like the rows above: same columns audit.log writes (actor null), entity = M6-D29's.
    await db.insert(auditLog).values({
      actorId: null,
      entity: ALLOCATION_AUDIT_ENTITY,
      entityId: a.id,
      action: 'create',
      projectId: a.projectId,
      summary: th.audit.allocationsSeeded(weeks.length),
      before: null,
      after: {
        weeks: Object.fromEntries(weeks.map(([week, cd]) => [week, { cd, resolution: t.granularity }])),
      },
    })
  }
}

/** Golden assignees of the synthetic perf grid, in round-robin order (LEAD first). */
const SYNTHETIC_PEOPLE = ['Cindy', 'Ivy', 'Mint'] as const
const SYNTHETIC_PARENTS = 20
const INSERT_CHUNK = 1000

/**
 * M6-D22 perf smoke (needs `seedGolden` first): project "Perf grid" without client (LEAD Cindy, MEMBER Ivy/Mint, the 5
 * default statuses, X70), `o.tasks` leaf tasks spread over 20 depth-0 parents (depth 1), assigned Cindy, Ivy, Mint in
 * turn, each with WEEK 100 in every week of [from, from + weeks). Plain Drizzle; **no audit rows** (X92).
 */
export async function addSyntheticGridProject(
  db: DbOrTx,
  o: { tasks: number; weeks: number; from: ISODate },
): Promise<{ projectId: string }> {
  const people = await db
    .select({ id: user.id, nickname: user.nickname })
    .from(user)
    .where(inArray(user.nickname, [...SYNTHETIC_PEOPLE]))
  const idOf = (nickname: string): string => {
    const hit = people.find((p) => p.nickname === nickname)
    if (!hit) throw new Error(`golden user ${nickname} not found (seedGolden first)`)
    return hit.id
  }
  const [manager] = await db.select({ id: user.id }).from(user).where(eq(user.role, 'manager')).limit(1)
  if (!manager) throw new Error('no manager (seedGolden first)')
  const [project] = await db
    .insert(projects)
    .values({ name: 'Perf grid', clientId: null, createdBy: manager.id })
    .returning({ id: projects.id })
  const projectId = project!.id
  for (const [i, nickname] of SYNTHETIC_PEOPLE.entries()) {
    await repo.members.insertMember(db, {
      projectId,
      userId: idOf(nickname),
      role: i === 0 ? 'LEAD' : 'MEMBER',
      addedBy: manager.id,
    })
  }
  await services.taskStatuses.ensureProjectStatuses(db, projectId)
  const status = defaultStatus(await repo.statuses.listLiveStatuses(db, projectId))
  const parentKeys = repo.order.rekey(SYNTHETIC_PARENTS)
  const parents = await db
    .insert(tasks)
    .values(
      parentKeys.map((position, i) => ({
        projectId,
        depth: 0,
        name: `Perf parent ${String(i + 1).padStart(2, '0')}`,
        position,
        statusId: status.id,
        createdBy: manager.id,
      })),
    )
    .returning({ id: tasks.id })
  const perParent = Math.ceil(o.tasks / SYNTHETIC_PARENTS)
  const childKeys = repo.order.rekey(perParent)
  const leafValues = Array.from({ length: o.tasks }, (_, i) => ({
    projectId,
    parentId: parents[i % SYNTHETIC_PARENTS]!.id,
    depth: 1,
    name: `Perf task ${String(i + 1).padStart(3, '0')}`,
    position: childKeys[Math.floor(i / SYNTHETIC_PARENTS)]!,
    statusId: status.id,
    createdBy: manager.id,
  }))
  const leaves = leafValues.length
    ? await db.insert(tasks).values(leafValues).returning({ id: tasks.id })
    : []
  const assignments = leaves.length
    ? await db
        .insert(taskAssignments)
        .values(
          leaves.map((t, i) => ({
            taskId: t.id,
            userId: idOf(SYNTHETIC_PEOPLE[i % SYNTHETIC_PEOPLE.length]!),
          })),
        )
        .returning({ id: taskAssignments.id })
    : []
  const weeks = Array.from({ length: o.weeks }, (_, i) => addWeeks(o.from, i))
  const rows: NewAllocation[] = assignments.flatMap((a) =>
    weeks.map((week) => ({
      taskAssignmentId: a.id,
      granularity: 'WEEK' as const,
      periodStart: week,
      weekStart: week,
      personDays: cdToNumeric(100),
    })),
  )
  for (let i = 0; i < rows.length; i += INSERT_CHUNK)
    await db.insert(allocations).values(rows.slice(i, i + INSERT_CHUNK))
  return { projectId }
}

// ---------------------------------------------------------------------------------------------------------------
// M7 — SPEC Appendix A.2 day example (PLAN §3.13, X11, M7-D16; plan/m07 S0.7)
// ---------------------------------------------------------------------------------------------------------------

/** SPEC Appendix A.2 "Task หลายคน + รายวัน". Not in golden-fixtures.json, hence constants (M7-D16 — the only
 *  re-typed seed data). */
export const DAY_EXAMPLE = {
  project: 'Mobile App Revamp',
  task: 'Kickoff workshop',
  assignees: ['Jack', 'Mint'] as const,
  day: '2026-09-07' as ISODate,
  cd: 50 as Cd,
} as const

type DayExampleAssignee = (typeof DAY_EXAMPLE.assignees)[number]

/**
 * Requires seedGolden(db) at the M6 level. Idempotent (no-op when the live task exists → returns its ids). Plain
 * Drizzle / repo inserts inside the caller's transaction: the depth-0 task after Mobile's last live root task (no
 * override, Mobile's default status per BR-81/X70, created_by = the golden manager), one assignment per A.2 assignee
 * (version 1) and one DAY row of 0.50 on 2026-09-07 each (the assignments are new rows of this transaction, so they
 * are already locked). Audit actor = null (X59): M3's task-create row + one allocation row per assignment (M6-D23).
 * Fixed A.2 dates: it takes no `today` (X90 covers services; M12 composes it as-is in seed:demo).
 */
export async function addDayExample(
  db: DbOrTx,
): Promise<{ taskId: string; assignmentIds: Record<DayExampleAssignee, string> }> {
  const [project] = await db
    .select({ id: projects.id })
    .from(projects)
    .where(eq(projects.name, DAY_EXAMPLE.project))
  if (!project) throw new Error(`golden project ${DAY_EXAMPLE.project} not found (seedGolden first)`)
  const people = await db
    .select({ id: user.id, nickname: user.nickname })
    .from(user)
    .where(inArray(user.nickname, [...DAY_EXAMPLE.assignees]))
  const userIdOf = (nickname: DayExampleAssignee): string => {
    const hit = people.find((p) => p.nickname === nickname)
    if (!hit) throw new Error(`golden user ${nickname} not found (seedGolden first)`)
    return hit.id
  }

  const [existing] = await db
    .select({ id: tasks.id })
    .from(tasks)
    .where(and(eq(tasks.projectId, project.id), eq(tasks.name, DAY_EXAMPLE.task), isNull(tasks.deletedAt)))
  if (existing) {
    const rows = await db
      .select({ id: taskAssignments.id, userId: taskAssignments.userId })
      .from(taskAssignments)
      .where(and(eq(taskAssignments.taskId, existing.id), isNull(taskAssignments.deletedAt)))
    const idFor = (nickname: DayExampleAssignee): string => {
      const hit = rows.find((r) => r.userId === userIdOf(nickname))
      if (!hit) throw new Error(`${DAY_EXAMPLE.task}: assignment of ${nickname} not found`)
      return hit.id
    }
    return { taskId: existing.id, assignmentIds: { Jack: idFor('Jack'), Mint: idFor('Mint') } }
  }

  const [manager] = await db.select({ id: user.id }).from(user).where(eq(user.role, 'manager')).limit(1)
  if (!manager) throw new Error('no manager (seedGolden first)')
  const status = defaultStatus(await repo.statuses.listLiveStatuses(db, project.id))
  const position = repo.order.keyAfter(await repo.tasks.lastChildPosition(db, project.id, null))
  const task = await repo.tasks.insertTask(db, {
    projectId: project.id,
    name: DAY_EXAMPLE.task,
    depth: 0,
    position,
    createdBy: manager.id,
    statusId: status.id,
  })
  await db.insert(auditLog).values({
    actorId: null,
    entity: 'task',
    entityId: task.id,
    action: 'create',
    projectId: project.id,
    summary: th.audit.taskCreated(task.name),
    before: null,
    after: { parentId: null, statusId: status.id },
  })

  const week = weekStart(DAY_EXAMPLE.day)
  const assignmentIds = {} as Record<DayExampleAssignee, string>
  for (const nickname of DAY_EXAMPLE.assignees) {
    const a = await repo.assignments.insertAssignment(db, { taskId: task.id, userId: userIdOf(nickname) })
    assignmentIds[nickname] = a.id
    await db.insert(allocations).values({
      taskAssignmentId: a.id,
      granularity: 'DAY',
      periodStart: DAY_EXAMPLE.day,
      weekStart: week,
      personDays: cdToNumeric(DAY_EXAMPLE.cd),
    })
    await db.insert(auditLog).values({
      actorId: null,
      entity: ALLOCATION_AUDIT_ENTITY,
      entityId: a.id,
      action: 'create',
      projectId: project.id,
      summary: th.audit.allocationsSeeded(1),
      before: null,
      after: {
        weeks: {
          [week]: { cd: DAY_EXAMPLE.cd, resolution: 'DAY', days: { [DAY_EXAMPLE.day]: DAY_EXAMPLE.cd } },
        },
      },
    })
  }
  return { taskId: task.id, assignmentIds }
}

// ---------------------------------------------------------------------------------------------------------------
// M5 — §11.3 F2/F3/F4 setups (X11, plan/m05 S2.10)
// ---------------------------------------------------------------------------------------------------------------

/** Applies `id`'s own setup on top of an already seeded F1 (golden-fixtures.json `expected.<id>.setup`) through the
 *  real services (actor null → one audit row each; leave is self-recorded). Not cumulative: F3 never adds F2's
 *  holiday. Runs in one transaction (a savepoint when `db` already is one). */
export async function applyFixture(db: DbOrTx, id: FixtureId): Promise<void> {
  const { setup } = loadGolden().expected[id]
  await db.transaction(async (tx) => {
    for (const h of setup.holidays ?? []) await services.holidays.createHoliday(tx, null, h)
    for (const t of setup.timeOff ?? []) {
      const [u] = await tx.select({ id: user.id }).from(user).where(eq(user.nickname, t.user))
      if (!u) throw new Error(`golden user ${t.user} not found`)
      const leaveTypeId = await repo.leaveTypes.findIdByName(tx, t.type)
      if (!leaveTypeId) throw new Error(`leave type ${t.type} not found (seedGolden first)`)
      await services.timeOff.createTimeOff(tx, null, {
        userId: u.id,
        leaveTypeId,
        startDate: t.startDate,
        endDate: t.endDate,
        half: t.half,
        note: null,
      })
    }
  })
}

const FIXTURE_IDS: readonly FixtureId[] = ['F2', 'F3', 'F4']

function toFixtureId(v: string | undefined): FixtureId {
  const hit = FIXTURE_IDS.find((f) => f === v)
  if (!hit)
    throw new Error(`--fixture must be one of ${FIXTURE_IDS.join(', ')} (got ${JSON.stringify(v ?? '')})`)
  return hit
}

/** `--fixture=F3` (or `--fixture F3`) from argv → 'F3'; absent → null; an unknown or missing id throws. */
export function parseFixtureArg(argv: readonly string[]): FixtureId | null {
  for (const [i, a] of argv.entries()) {
    if (a.startsWith('--fixture=')) return toFixtureId(a.slice('--fixture='.length))
    if (a === '--fixture') return toFixtureId(argv[i + 1])
  }
  return null
}
