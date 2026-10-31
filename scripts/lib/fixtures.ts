// scripts/lib/fixtures.ts — golden seed (SPEC §11.3, X11, SEED-A1, PLAN.md §3.13). Builders go through the real
// services (audit with actor = null). M5 widens FixtureId to 'F2' | 'F3' | 'F4' and adds applyFixture; later
// milestones add stages. Reads docs/reference/golden-fixtures.json (never re-typed; seeds/tests only, never runtime).
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { hashPassword } from 'better-auth/crypto'
import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { defaultStatus } from '@/domain/status'
import { user } from '@/server/db/schema'
import type { DbOrTx } from '@/server/db/types'
import * as repo from '@/server/repo'
import * as services from '@/server/services'
import { ensureProjectCharters } from '@/server/services/charters'

/** Seed stages in order; `upTo` stops after the named stage. M1 'users': positions + users + schedules ·
 *  M2 'projects': clients + projects + memberships (+ M3's 5 default statuses per project, X70) ·
 *  M3 'tasks': tasks + assignments (X11 M3 part, M3-D20) · M4 'pages': one Project Charter per project through
 *  ensureProjectCharters (X11 M4 part, X25; one actor-null `page` audit row each, M4-D5). */
export type GoldenStage = 'users' | 'projects' | 'tasks' | 'pages'
const STAGES: readonly GoldenStage[] = ['users', 'projects', 'tasks', 'pages']

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
  /** M2: MEMBER rows = distinct assignees (X11) · M3: name + certainty override (allocations come in M6). */
  tasks: z.array(
    z.object({
      project: z.string(),
      name: z.string(),
      assignee: z.string().nullable(),
      certaintyOverride: z.enum(['CONFIRMED', 'TENTATIVE']).nullable(),
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
