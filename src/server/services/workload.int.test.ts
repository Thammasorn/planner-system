// M9 S2.2–S2.4 — workload table, cell detail, badge, personCells (FR-1001…1007, X67, M9-D2…D11; golden unless noted).
import { eq, sql } from 'drizzle-orm'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { GET as getWorkload } from '@/app/api/workload/route'
import { GET as getCell } from '@/app/api/workload/cell/route'
import { GET as getBadge } from '@/app/api/workload/badge/route'
import type { ISODate } from '@/domain/types'
import { th } from '@/i18n/th'
import type { WorkloadCellDetail, WorkloadResponse } from '@/lib/contracts/workload'
import { applyFixture, seedGolden, type FixtureId } from '../../../scripts/lib/fixtures'
import { callRoute, okJson } from '../../../tests/authz/_support/http'
import { goldenProjectId, goldenUser, GOLDEN_VIEWERS, type GoldenViewer } from '../../../tests/authz/_support/golden'
import { asNobody, asUser, toSessionUser } from '../../../tests/helpers/as-user'
import { deactivateUser, makeMilestone } from '../../../tests/helpers/factories'
import { allNumbersInteger, containsAny } from '../../../tests/helpers/json'
import { createWorld } from '../../../tests/helpers/world'
import { db } from '../db/client'
import { positions, projects, tasks, user } from '../db/schema'
import { NotFoundError } from '../errors'
import type { SessionUser } from '../session'
import { badgeCount, buildTable, cellDetail, personCells } from './workload'

const TODAY: ISODate = '2026-09-30'
const WINDOW = { from: '2026-09-28', to: '2026-12-21' } as const

beforeEach(() => {
  vi.stubEnv('ALLOW_TEST_HOOKS', '1')
  vi.stubEnv('APP_NOW', '2026-09-30T10:00:00+07:00')
})

const as = async (n: GoldenViewer): Promise<SessionUser> => toSessionUser(await goldenUser(n))
const idOf = async (n: GoldenViewer): Promise<string> => (await goldenUser(n)).id
const table = (viewer: SessionUser, o: Partial<Parameters<typeof buildTable>[2]> = {}) =>
  buildTable(db, viewer, { window: WINDOW, ...o }, TODAY)
const names = (r: WorkloadResponse) => r.groups.flatMap((g) => g.people.map((p) => p.name))
const cellOf = (r: WorkloadResponse, name: string, w: ISODate) =>
  r.groups.flatMap((g) => g.people).find((p) => p.name === name)!.cells[w]!

async function seed(...fixtures: FixtureId[]): Promise<void> {
  await seedGolden(db)
  for (const f of fixtures) await applyFixture(db, f)
}

describe('buildTable — population / groups (FR-1001, M9-D3)', () => {
  it('F1: groups in positions order, Manager absent, 12 Mondays, every person 12 cells', async () => {
    await seed()
    const r = await table(await as('Manager'))
    expect(r.groups.map((g) => [g.name, g.people.map((p) => p.name)])).toEqual([
      ['Project Manager', ['Cindy']],
      ['Developer', ['Mint']],
      ['Designer', ['Jack']],
      ['QA', ['Ivy']],
      ['Data', ['Peter']],
    ])
    expect(r.weeks).toHaveLength(12)
    expect(r.weeks[0]).toBe('2026-09-28')
    expect(r.weeks.at(-1)).toBe('2026-12-14')
    for (const g of r.groups) for (const p of g.people) expect(Object.keys(p.cells)).toEqual(r.weeks)
    expect(cellOf(r, 'Ivy', '2026-10-05')).toMatchObject({
      total: 125,
      committed: 125,
      capacity: 500,
      standard: 500,
      level: 'OK',
      excess: 0,
      cause: null,
    })
    expect(r.positions.length).toBeGreaterThanOrEqual(5)
    expect(r.today).toBe(TODAY)
  })

  it('users without a position go to th.workload.noPosition last', async () => {
    await seed()
    await db.update(user).set({ positionId: null }).where(eq(user.nickname, 'Ivy'))
    const r = await table(await as('Manager'))
    expect(r.groups.at(-1)).toMatchObject({ positionId: null, name: th.workload.noPosition })
    expect(r.groups.at(-1)!.people.map((p) => p.name)).toEqual(['Ivy'])
  })

  it('deactivated: Ivy deactivated 2026-10-01 stays (load > 0) with cap 0 → OVER 125; without load/memberships → absent', async () => {
    await seed()
    await deactivateUser({ id: await idOf('Ivy') }, '2026-10-01')
    const r = await table(await as('Manager'))
    const ivy = r.groups.flatMap((g) => g.people).find((p) => p.name === 'Ivy')!
    expect(ivy).toMatchObject({ active: false, deactivatedOn: '2026-10-01' })
    expect(ivy.cells['2026-10-05']).toMatchObject({ capacity: 0, level: 'OVER', excess: 125 })
    // Peter: deactivated and no load in a far window, but still a member → absent (not active)
    await deactivateUser({ id: await idOf('Peter') }, '2026-10-01')
    const later = await buildTable(db, await as('Manager'), { window: { from: '2027-03-01', to: '2027-03-08' } }, TODAY)
    expect(names(later)).not.toContain('Peter')
    expect(names(later)).not.toContain('Ivy')
  })

  it('viewer Ivy: only Cindy, Ivy, Mint; Mint’s Mobile part masked; no Mobile name/id/task anywhere', async () => {
    await seed()
    const r = await table(await as('Ivy'))
    expect(names(r)).toEqual(['Cindy', 'Mint', 'Ivy'])
    expect(cellOf(r, 'Mint', '2026-10-05').byProject).toEqual([{ projectId: null, total: 500, committed: 500 }])
    const mobile = await goldenProjectId('Mobile App Revamp')
    expect(containsAny(r, ['Mobile App Revamp', 'พัฒนา front-end', mobile])).toEqual([])
    const pos = await goldenProjectId('POS Upgrade')
    const crm = await goldenProjectId('CRM Migration')
    expect(Object.keys(r.projects).sort()).toEqual([pos, crm].sort())
  })

  it('filters: positionId, projectId, invisible projectId → 404, onlyOver', async () => {
    await seed()
    const manager = await as('Manager')
    const [data] = await db.select().from(positions).where(eq(positions.name, 'Data'))
    expect(names(await table(manager, { positionId: data!.id }))).toEqual(['Peter'])
    const mobile = await goldenProjectId('Mobile App Revamp')
    expect(names(await table(manager, { projectId: mobile }))).toEqual(['Mint', 'Jack'])
    const dw = await goldenProjectId('Data Warehouse')
    await expect(table(await as('Ivy'), { projectId: dw })).rejects.toBeInstanceOf(NotFoundError)
    expect((await table(manager, { onlyOver: true })).groups).toEqual([])
  })

  it('onlyOver on F2 + F3 → Jack, Mint, Peter; overloads list (M9-D10)', async () => {
    await seed('F2', 'F3')
    const manager = await as('Manager')
    const r = await table(manager, { onlyOver: true })
    expect(names(r).sort()).toEqual(['Jack', 'Mint', 'Peter'])
    const all = await table(manager)
    const [peter, jack, mint] = [await idOf('Peter'), await idOf('Jack'), await idOf('Mint')]
    expect(
      all.overloads.map((o) => [o.name, o.week, o.level, o.excess, o.cause, o.total, o.committed, o.capacity, o.href]),
    ).toEqual([
      ['Peter', '2026-10-05', 'OVER', 200, 'CAPACITY', 500, 500, 300, `/people/${peter}/plan?week=2026-10-05`],
      ['Jack', '2026-10-19', 'OVER', 100, 'CAPACITY', 500, 500, 400, `/people/${jack}/plan?week=2026-10-19`],
      ['Mint', '2026-10-19', 'OVER', 100, 'CAPACITY', 500, 500, 400, `/people/${mint}/plan?week=2026-10-19`],
    ])
  })

  it('F4 → one RISK line Cindy 2026-10-12 +50 CAPACITY (250/0/200)', async () => {
    await seed('F4')
    const r = await table(await as('Manager'))
    expect(r.overloads.map((o) => [o.name, o.week, o.level, o.excess, o.cause, o.total, o.committed, o.capacity])).toEqual(
      [['Cindy', '2026-10-12', 'RISK', 50, 'CAPACITY', 250, 0, 200]],
    )
  })

  it('FR-405: CRM → CONFIRMED moves Cindy 2026-10-05 committed 0 → 250', async () => {
    await seed()
    const manager = await as('Manager')
    expect(cellOf(await table(manager), 'Cindy', '2026-10-05').committed).toBe(0)
    await db.update(projects).set({ certainty: 'CONFIRMED' }).where(eq(projects.name, 'CRM Migration'))
    expect(cellOf(await table(manager), 'Cindy', '2026-10-05').committed).toBe(250)
  })

  it('WAITING status and milestones never change load (BR-87, BR-72)', async () => {
    await seed()
    const manager = await as('Manager')
    const before = await table(manager)
    const [t] = await db.select().from(tasks).where(eq(tasks.name, 'ย้ายข้อมูลลูกค้า'))
    await db.execute(sql`update tasks set status_id = (select id from task_statuses s where s.project_id = ${t!.projectId}
      and s.category <> 'DONE' and s.id <> ${t!.statusId} and s.deleted_at is null limit 1) where id = ${t!.id}`)
    const [mgr] = await db.select().from(user).where(eq(user.role, 'manager'))
    await makeMilestone({ project: { id: t!.projectId }, date: '2026-10-14', createdBy: mgr! })
    const after = await table(manager)
    expect(after.groups).toEqual(before.groups)
  })

  it('integers only (BR-03)', async () => {
    await seed('F2', 'F3')
    expect(allNumbersInteger(await table(await as('Ivy')))).toBe(true)
    expect(allNumbersInteger(await table(await as('Manager')))).toBe(true)
  })

  it('userIds (M10 embed): Manager outside the population; invisible ids dropped; [] = nobody', async () => {
    await seed()
    const [cindy, mgr, jack, mint] = [await idOf('Cindy'), await idOf('Manager'), await idOf('Jack'), await idOf('Mint')]
    expect(names(await table(await as('Manager'), { userIds: [cindy, mgr] }))).toEqual(['Cindy'])
    const ivy = await table(await as('Ivy'), { userIds: [jack, mint] })
    expect(names(ivy)).toEqual(['Mint'])
    expect(cellOf(ivy, 'Mint', '2026-10-05').byProject).toEqual([{ projectId: null, total: 500, committed: 500 }])
    expect((await table(await as('Manager'), { userIds: [] })).groups).toEqual([])
    expect(names(await table(await as('Manager')))).toHaveLength(5)
  })

  it('route: bad range → 400; no session → 401; body equals the service result', async () => {
    await seed()
    asUser(await goldenUser('Manager'))
    expect((await callRoute(getWorkload, '/api/workload?from=2026-09-29&to=2026-12-21')).status).toBe(400)
    const body = await okJson<WorkloadResponse>(await callRoute(getWorkload, '/api/workload'))
    expect(body).toEqual(await table(await as('Manager')))
    asNobody()
    expect((await callRoute(getWorkload, '/api/workload')).status).toBe(401)
  })
})

describe('personCells (M10 home)', () => {
  it('Manager → own 8 empty cells; Ivy → Mint masked; Ivy → Jack → 404', async () => {
    await seed()
    const manager = await as('Manager')
    const own = await personCells(db, manager, manager.id, { from: '2026-09-28', to: '2026-11-23' })
    expect(Object.keys(own)).toHaveLength(8)
    expect(own['2026-09-28']).toEqual({
      total: 0,
      committed: 0,
      capacity: 500,
      standard: 500,
      level: 'OK',
      excess: 0,
      cause: null,
      byProject: [],
    })
    const ivy = await as('Ivy')
    const mint = await personCells(db, ivy, await idOf('Mint'), { from: '2026-09-28', to: '2026-11-23' })
    expect(mint['2026-10-05']!.byProject).toEqual([{ projectId: null, total: 500, committed: 500 }])
    await expect(personCells(db, ivy, await idOf('Jack'), WINDOW)).rejects.toBeInstanceOf(NotFoundError)
  })
})

describe('cellDetail (FR-1005, M9-D9)', () => {
  it('F3 manager → Peter 2026-10-05: one DW item 500/500 with href, cell OVER', async () => {
    await seed('F3')
    const peter = await idOf('Peter')
    const r = await cellDetail(db, await as('Manager'), { userId: peter, week: '2026-10-05' }, TODAY)
    const dw = await goldenProjectId('Data Warehouse')
    const [t] = await db.select().from(tasks).where(eq(tasks.name, 'ย้าย pipeline ขึ้น BigQuery'))
    expect(r.items).toEqual([
      {
        kind: 'task',
        taskId: t!.id,
        taskName: 'ย้าย pipeline ขึ้น BigQuery',
        parentPath: [],
        projectId: dw,
        projectName: 'Data Warehouse',
        projectColor: expect.any(String) as string,
        load: { total: 500, committed: 500 },
        certainty: 'CONFIRMED',
        completed: false,
        href: `/projects/${dw}/plan?task=${t!.id}`,
      },
    ])
    expect(r.cell.level).toBe('OVER')
    expect(r.name).toBe('Peter')
  })

  it('Ivy → Mint: one masked item, no Mobile string/id; Ivy → Jack → 404; route 404 + 400', async () => {
    await seed()
    const ivy = await as('Ivy')
    const r = await cellDetail(db, ivy, { userId: await idOf('Mint'), week: '2026-10-05' }, TODAY)
    expect(r.items).toEqual([{ kind: 'masked', label: th.masking.otherProjects, load: { total: 500, committed: 500 } }])
    expect(containsAny(r, ['Mobile App Revamp', 'พัฒนา front-end', await goldenProjectId('Mobile App Revamp')])).toEqual([])
    await expect(cellDetail(db, ivy, { userId: await idOf('Jack'), week: '2026-10-05' }, TODAY)).rejects.toBeInstanceOf(
      NotFoundError,
    )
    asUser(await goldenUser('Ivy'))
    const jack = await idOf('Jack')
    expect((await callRoute(getCell, `/api/workload/cell?userId=${jack}&week=2026-10-05`)).status).toBe(404)
    expect((await callRoute(getCell, '/api/workload/cell?userId=nobody&week=2026-10-05')).status).toBe(404)
    expect((await callRoute(getCell, `/api/workload/cell?userId=${jack}&week=2026-10-06`)).status).toBe(400)
    const ok = await okJson<WorkloadCellDetail>(
      await callRoute(getCell, `/api/workload/cell?userId=${await idOf('Mint')}&week=2026-10-05`),
    )
    expect(ok.items).toHaveLength(1)
  })

  it('world: member → coworker 2026-10-05 = P item 100 + masked 300; nothing of Q', async () => {
    const w = await createWorld({ with: ['allocations'] })
    const r = await cellDetail(db, asUser(w.member), { userId: w.users.coworker!.id, week: '2026-10-05' }, TODAY)
    expect(r.items).toEqual([
      expect.objectContaining({ kind: 'task', taskName: 'งานร่วม P-ลับ03', load: { total: 100, committed: 100 } }),
      { kind: 'masked', label: th.masking.otherProjects, load: { total: 300, committed: 300 } },
    ])
    expect(containsAny(r, ['งาน Q-ลับ02', w.Q.id, w.tasks.qTask.id, w.assignments.qTaskCoworker.id])).toEqual([])
  })
})

describe('badgeCount (FR-1007, r8 §4.6)', () => {
  const table4: [FixtureId[], number[]][] = [
    [[], [0, 0, 0, 0, 0, 0]],
    [['F2'], [2, 2, 1, 2, 2, 2]],
    [['F3'], [1, 1, 0, 1, 1, 0]],
    [['F4'], [0, 0, 0, 0, 0, 0]],
    [['F2', 'F3'], [3, 3, 1, 3, 3, 2]],
  ]
  for (const [fixtures, expected] of table4) {
    it(`F1${fixtures.map((f) => ' + ' + f).join('')}: ${expected.join('/')} for ${GOLDEN_VIEWERS.join('/')}`, async () => {
      await seed(...fixtures)
      const got: number[] = []
      for (const v of GOLDEN_VIEWERS) got.push((await badgeCount(db, await as(v), TODAY)).overCount)
      expect(got).toEqual(expected)
    })
  }

  it('a deactivated user’s remaining OVER counts; route shape', async () => {
    await seed()
    await deactivateUser({ id: await idOf('Ivy') }, '2026-10-01')
    const r = await badgeCount(db, await as('Manager'), TODAY)
    expect(r).toEqual({ overCount: 1, from: '2026-09-28', to: '2026-10-26' }) // Ivy 2026-10-05 125 / cap 0
    asUser(await goldenUser('Manager'))
    expect(await okJson(await callRoute(getBadge, '/api/workload/badge'))).toEqual(r)
  })
})
