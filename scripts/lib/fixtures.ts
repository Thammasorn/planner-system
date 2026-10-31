// scripts/lib/fixtures.ts — golden seed (SPEC §11.3, X11, SEED-A1, PLAN.md §3.13). Builders go through the real
// services (audit with actor = null). M5 widens FixtureId to 'F2' | 'F3' | 'F4' and adds applyFixture; later
// milestones add stages. Reads docs/reference/golden-fixtures.json (never re-typed; seeds/tests only, never runtime).
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { hashPassword } from 'better-auth/crypto'
import { z } from 'zod'
import type { DbOrTx } from '@/server/db/types'
import * as repo from '@/server/repo'
import * as services from '@/server/services'

/** Seed stages in order; `upTo` stops after the named stage. M1 'users': positions + users + schedules ·
 *  M2 'projects': clients + projects + memberships. */
export type GoldenStage = 'users' | 'projects'
const STAGES: readonly GoldenStage[] = ['users', 'projects']

/** Placeholder for resetDb's first parameter (only `resetDb()` / `resetDb(undefined, { extras })` type-check in M1). */
export type FixtureId = never

const FractionCd = z.union([z.literal(25), z.literal(50), z.literal(75), z.literal(100)])

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
  /** Only the fields the M2 stage needs (MEMBER rows = distinct assignees, X11); later stages widen this. */
  tasks: z.array(z.object({ project: z.string(), assignee: z.string().nullable() })),
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
}

async function seedUsers(db: DbOrTx): Promise<SeedCtx> {
  const g = loadGolden()
  const positionIds = new Map<string, string>()
  for (const name of g.positions) {
    const { id } = await services.positions.createPosition(db, null, { name })
    positionIds.set(name, id)
  }
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
