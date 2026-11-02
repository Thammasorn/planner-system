// tests/golden/milestones.int.test.ts — the SPEC App. A.2 milestones on the golden seed (SPEC §4.7, §5.9 BR-70/71/72,
// §11.3; plan/m08 S5.3, r8 §4.9 / §6.11). seedGolden + addMilestones (M8-D20), "today" = 2026-09-30 (X45/X90), as the
// manager. Expected statuses and lateness come from r8's table; BR-72 numbers from the golden JSON (`expected.F1`),
// never re-typed.
import { readFileSync } from 'node:fs'
import { and, eq, isNull } from 'drizzle-orm'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { weekRange } from '@/domain/dates'
import type { Cd, ISODate, LoadPair, MilestoneStatus } from '@/domain/types'
import type { MilestoneDTO } from '@/lib/contracts/milestones'
import { db } from '@/server/db/client'
import { tasks, user } from '@/server/db/schema'
import * as repo from '@/server/repo'
import * as services from '@/server/services'
import type { SessionUser } from '@/server/session'
import { addMilestones, DEMO_MILESTONES, GOLDEN_PATH, seedGolden } from '../../scripts/lib/fixtures'
import { asUser } from '../helpers/as-user'
import { GOLDEN_PROJECTS, goldenProjectId, goldenUser, type GoldenProject } from '../authz/_support/golden'

const TODAY: ISODate = '2026-09-30'
const FROM: ISODate = '2026-08-31'
const TO: ISODate = '2027-01-04'

interface GoldenJson {
  users: { nickname: string }[]
  expected: {
    F1: {
      totalCd: Cd
      committedCd: Cd
      byUserWeek: Record<string, Record<ISODate, { totalCd: Cd; committedCd: Cd }>>
    }
  }
}
const golden = JSON.parse(readFileSync(GOLDEN_PATH, 'utf8')) as GoldenJson
const F1 = golden.expected.F1
const NICKNAMES = golden.users.map((u) => u.nickname)

type DemoName = (typeof DEMO_MILESTONES)[number]['name']

/** r8 §4.9 / §6.11 — BR-70 on 2026-09-30. */
const STATUS: Record<DemoName, MilestoneStatus> = {
  'UAT sign-off': 'DUE_SOON', // 10-02: +2 days
  'Design freeze': 'UPCOMING', // 10-09: +9
  'Pipeline พร้อมใช้งาน': 'UPCOMING', // 10-23: +23
  'Data migration complete': 'UPCOMING', // 11-06: +37
  'Beta release': 'UPCOMING', // 11-13: +44
  'Dashboard v1 review': 'UPCOMING', // 12-11: +72
  'Go-live สาขาแรก': 'UPCOMING', // 12-21: +82
}

beforeEach(() => {
  vi.stubEnv('ALLOW_TEST_HOOKS', '1')
  vi.stubEnv('APP_NOW', '2026-09-30T10:00:00+07:00')
})

async function managerSession(): Promise<SessionUser> {
  return asUser(await goldenUser('Manager'))
}

/** Every live milestone of the five golden projects, by name. */
async function allMilestones(manager: SessionUser): Promise<Map<string, MilestoneDTO>> {
  const out = new Map<string, MilestoneDTO>()
  for (const project of GOLDEN_PROJECTS) {
    const projectId = await goldenProjectId(project)
    const res = await services.milestones.listProjectMilestones(db, manager, projectId, TODAY)
    expect(res).toMatchObject({ projectId, today: TODAY, canManage: true })
    const dates = res.milestones.map((m) => m.date)
    expect(dates, `${project} sorted by date`).toEqual([...dates].sort())
    for (const m of res.milestones) {
      expect(m.projectId).toBe(projectId)
      out.set(m.name, m)
    }
  }
  return out
}

async function taskIdOf(project: GoldenProject, name: string): Promise<string> {
  const projectId = await goldenProjectId(project)
  const [t] = await db
    .select({ id: tasks.id })
    .from(tasks)
    .where(and(eq(tasks.projectId, projectId), eq(tasks.name, name), isNull(tasks.deletedAt)))
  if (!t) throw new Error(`golden task ${project} › ${name} not seeded`)
  return t.id
}

/** `services.milestones.linkTasks` in one transaction (the action's authz/audit are covered by the matrix). */
async function bind(manager: SessionUser, project: GoldenProject, taskName: string, milestoneId: string) {
  const projectId = await goldenProjectId(project)
  const taskId = await taskIdOf(project, taskName)
  const r = await db.transaction((tx) =>
    services.milestones.linkTasks(tx, manager, { taskIds: [taskId], milestoneId, projectId }),
  )
  expect(r.changed.map((c) => c.taskId), `${taskName} bound`).toEqual([taskId])
  return taskId
}

/** `lateForMilestone` of one task as the project's task list reports it (FR-706 on the task). */
async function lateForMilestone(manager: SessionUser, project: GoldenProject, taskId: string) {
  const res = await services.tasks.listProjectTasks(db, manager, await goldenProjectId(project))
  const t = res.tasks.find((x) => x.id === taskId)
  expect(t, `task ${taskId} listed`).toBeDefined()
  return t!
}

async function goldenUserIds(): Promise<Map<string, string>> {
  const rows = await db.select({ id: user.id, nickname: user.nickname }).from(user)
  const ids = new Map(rows.map((r) => [r.nickname ?? '', r.id]))
  for (const n of NICKNAMES) expect(ids.get(n), `golden user ${n}`).toBeDefined()
  return ids
}

/** Load (repo, BR-50/BR-37 counted) and capacity of all six golden users over [08-31, 01-04). */
async function loadsAndCapacity(ids: Map<string, string>) {
  const userIds = NICKNAMES.map((n) => ids.get(n)!)
  const load = await repo.allocations.loadByUserWeek(db, { userIds, range: { from: FROM, to: TO } })
  const capacity = await services.capacity.loadCapacity(db, userIds, { from: FROM, to: TO })
  return {
    load: JSON.parse(JSON.stringify(Object.fromEntries(load))) as Record<string, Record<ISODate, LoadPair>>,
    capacity: JSON.parse(JSON.stringify(Object.fromEntries(capacity))) as unknown,
  }
}

describe('golden A.2 milestones (r8 §4.9, §6.11)', () => {
  it('addMilestones → seven milestones with r8’s BR-70 statuses; only UAT sign-off is bound and late (BR-71)', async () => {
    await seedGolden(db)
    await addMilestones(db)
    const manager = await managerSession()
    const all = await allMilestones(manager)
    expect([...all.keys()].sort()).toEqual(DEMO_MILESTONES.map((m) => m.name).sort())
    for (const demo of DEMO_MILESTONES) {
      const m = all.get(demo.name)!
      expect(m, demo.name).toMatchObject({
        date: demo.date,
        completedOn: null,
        status: STATUS[demo.name],
        projectId: await goldenProjectId(demo.project),
      })
      if (demo.name === 'UAT sign-off') {
        // "ทำ UAT + คู่มือหน้าร้าน" has WEEK 10-05 (125) > 10-02
        expect(m, demo.name).toMatchObject({ late: true, lateTaskCount: 1, progress: { done: 0, total: 1 } })
      } else {
        expect(m, demo.name).toMatchObject({ late: false, lateTaskCount: 0, progress: { done: 0, total: 0 } })
      }
    }
    const uatTask = await taskIdOf('POS Upgrade', 'ทำ UAT + คู่มือหน้าร้าน')
    expect(await lateForMilestone(manager, 'POS Upgrade', uatTask)).toMatchObject({
      milestoneId: all.get('UAT sign-off')!.id,
      lateForMilestone: true,
    })
  })

  it('bindings (BR-71, X66): Pipeline / Beta release / Data migration complete not late; Design freeze late', async () => {
    await seedGolden(db)
    const { ids } = await addMilestones(db)
    const manager = await managerSession()
    // DW "ย้าย pipeline ขึ้น BigQuery" plans end in week 10-19 ≤ Pipeline 10-23
    const pipeline = await bind(manager, 'Data Warehouse', 'ย้าย pipeline ขึ้น BigQuery', ids['Pipeline พร้อมใช้งาน']!)
    // Mobile "พัฒนา front-end" plans end in week 11-09 ≤ Beta release 11-13
    const frontEnd = await bind(manager, 'Mobile App Revamp', 'พัฒนา front-end', ids['Beta release']!)
    // Mobile "ออกแบบ flow ใหม่" plans to week 10-26 > Design freeze 10-09
    const flow = await bind(manager, 'Mobile App Revamp', 'ออกแบบ flow ใหม่', ids['Design freeze']!)
    // CRM "ย้ายข้อมูลลูกค้า" plans to week 11-02 = Data migration complete's own week (11-06): a WEEK row there never counts
    const crm = await bind(manager, 'CRM Migration', 'ย้ายข้อมูลลูกค้า', ids['Data migration complete']!)

    const all = await allMilestones(manager)
    const one = { done: 0, total: 1 }
    expect(all.get('Pipeline พร้อมใช้งาน')).toMatchObject({ late: false, lateTaskCount: 0, progress: one })
    expect(all.get('Beta release')).toMatchObject({ late: false, lateTaskCount: 0, progress: one })
    expect(all.get('Design freeze')).toMatchObject({ late: true, lateTaskCount: 1, progress: one })
    expect(all.get('Data migration complete')).toMatchObject({ late: false, lateTaskCount: 0, progress: one })
    // statuses do not depend on bindings
    for (const [name, m] of all) expect(m.status, name).toBe(STATUS[name as DemoName])

    expect(await lateForMilestone(manager, 'Data Warehouse', pipeline)).toMatchObject({ lateForMilestone: false })
    expect(await lateForMilestone(manager, 'Mobile App Revamp', frontEnd)).toMatchObject({ lateForMilestone: false })
    expect(await lateForMilestone(manager, 'Mobile App Revamp', flow)).toMatchObject({
      milestoneId: ids['Design freeze'],
      lateForMilestone: true,
    })
    expect(await lateForMilestone(manager, 'CRM Migration', crm)).toMatchObject({ lateForMilestone: false })
  })

  it('BR-72: milestones and bindings change no load and no capacity (F1 totals 19 500 / 11 625, every user × week cell)', async () => {
    await seedGolden(db)
    const userIds = await goldenUserIds()
    const before = await loadsAndCapacity(userIds)

    const { ids } = await addMilestones(db)
    const manager = await managerSession()
    await bind(manager, 'Data Warehouse', 'ย้าย pipeline ขึ้น BigQuery', ids['Pipeline พร้อมใช้งาน']!)
    await bind(manager, 'Mobile App Revamp', 'พัฒนา front-end', ids['Beta release']!)
    await bind(manager, 'Mobile App Revamp', 'ออกแบบ flow ใหม่', ids['Design freeze']!)
    await bind(manager, 'CRM Migration', 'ย้ายข้อมูลลูกค้า', ids['Data migration complete']!)
    const after = await loadsAndCapacity(userIds)

    expect(after.load).toEqual(before.load)
    expect(after.capacity).toEqual(before.capacity)

    let total = 0
    let committed = 0
    for (const cells of Object.values(after.load))
      for (const c of Object.values(cells)) {
        total += c.total
        committed += c.committed
      }
    expect({ total, committed }).toEqual({ total: F1.totalCd, committed: F1.committedCd })
    expect({ total, committed }).toEqual({ total: 19_500, committed: 11_625 })

    const weeks = new Set(weekRange(FROM, TO))
    for (const [nick, byWeek] of Object.entries(F1.byUserWeek)) {
      const got = after.load[userIds.get(nick)!] ?? {}
      for (const [week, cell] of Object.entries(byWeek)) {
        expect(weeks.has(week), `${week} in range`).toBe(true)
        expect(got[week] ?? { total: 0, committed: 0 }, `${nick} ${week}`).toEqual({
          total: cell.totalCd,
          committed: cell.committedCd,
        })
      }
    }
  })
})
