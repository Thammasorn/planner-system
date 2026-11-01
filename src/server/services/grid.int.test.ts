// M6 S2.2 — grid chunk service + route (FR-805–809, X28/X29/X42/X65/X76/X86, M6-D2/D7/D8/D12/D20; golden F1 unless noted).
import { eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { GET as getGrid } from '@/app/api/grid/project/[projectId]/route'
import type { ISODate } from '@/domain/types'
import type { GridAssigneeRow, GridResponse, GridTaskRow } from '@/lib/contracts/grid'
import { applyFixture, seedGolden } from '../../../scripts/lib/fixtures'
import { callRoute } from '../../../tests/authz/_support/http'
import { goldenProjectId, goldenUser, type GoldenProject, type GoldenViewer } from '../../../tests/authz/_support/golden'
import { asUser, toSessionUser } from '../../../tests/helpers/as-user'
import { makeTask } from '../../../tests/helpers/factories'
import { createWorld } from '../../../tests/helpers/world'
import { db } from '../db/client'
import { tasks as tasksTable } from '../db/schema'
import type { SessionUser } from '../session'
import * as repo from '../repo'
import { buildChunk, type ChunkParams } from './grid'
import { deactivateEmployee } from './employees'
import { setProjectArchived } from './projects'
import { addTaskBlocker } from './taskBlockers'
import { moveTask } from './tasks'
import { setStatus } from './taskStatus'

const TODAY: ISODate = '2026-09-30'
const chunk = (from: ISODate, to: ISODate, includeOthers = false): ChunkParams => ({
  from,
  to,
  expand: [],
  zoom: 'week',
  includeOthers,
})

beforeEach(() => {
  vi.stubEnv('ALLOW_TEST_HOOKS', '1')
  vi.stubEnv('APP_NOW', '2026-09-30T10:00:00+07:00')
})

async function golden(nick: GoldenViewer): Promise<SessionUser> {
  return toSessionUser(await goldenUser(nick))
}

async function taskId(name: string): Promise<string> {
  const [t] = await db.select({ id: tasksTable.id }).from(tasksTable).where(eq(tasksTable.name, name))
  if (!t) throw new Error(`task ${name} not found`)
  return t.id
}

async function grid(user: SessionUser, project: GoldenProject, p = chunk('2026-09-28', '2026-11-23')): Promise<GridResponse> {
  return buildChunk(db, user, { kind: 'project', id: await goldenProjectId(project) }, p, TODAY)
}

const taskRows = (g: GridResponse) => g.rows.filter((r): r is GridTaskRow => r.kind === 'task')
const assigneeRows = (g: GridResponse) => g.rows.filter((r): r is GridAssigneeRow => r.kind === 'assignee')
const taskNamed = (g: GridResponse, name: string) => taskRows(g).find((t) => t.name === name)!
const rowOf = (g: GridResponse, userId: string) => assigneeRows(g).find((r) => r.userId === userId)!

describe('buildChunk — golden F1', () => {
  it('shape: POS as cindy — 8 periods; 3 task rows each followed by its assignee row in JSON order; X28/X76 defaults', async () => {
    await seedGolden(db)
    const cindy = await golden('Cindy')
    const g = await grid(cindy, 'POS Upgrade')
    expect(g.periods.map((p) => p.key)).toEqual([
      'W:2026-09-28',
      'W:2026-10-05',
      'W:2026-10-12',
      'W:2026-10-19',
      'W:2026-10-26',
      'W:2026-11-02',
      'W:2026-11-09',
      'W:2026-11-16',
    ])
    expect(g.periods[0]).toEqual({ key: 'W:2026-09-28', kind: 'WEEK', weekStart: '2026-09-28', date: '2026-09-28' })
    expect(g.rows.map((r) => r.kind)).toEqual(['task', 'assignee', 'task', 'assignee', 'task', 'assignee'])
    expect(taskRows(g).map((t) => t.name)).toEqual(['ปรับปรุงระบบ POS หน้าร้าน', 'ทำ UAT + คู่มือหน้าร้าน', 'Rollout สาขา'])
    expect((g.rows[1] as GridAssigneeRow).taskId).toBe((g.rows[0] as GridTaskRow).id)
    expect(rowOf(g, cindy.id).cells['W:2026-09-28']).toEqual({ cd: 250, resolution: 'WEEK', derived: false })
    expect(rowOf(g, cindy.id)).toMatchObject({ version: 1, editable: true })
    expect(taskNamed(g, 'Rollout สาขา')).toMatchObject({
      certainty: 'TENTATIVE',
      certaintySource: 'task',
      certaintySourceName: 'Rollout สาขา',
    })
    expect(taskNamed(g, 'ทำ UAT + คู่มือหน้าร้าน')).toMatchObject({ certainty: 'CONFIRMED', certaintySource: 'project' })
    expect(g.milestones).toEqual([])
    for (const t of taskRows(g)) {
      expect(t).toMatchObject({ lateForMilestone: false, milestoneId: null, blockers: { open: 0, total: 0 } })
      expect(t).toMatchObject({ depth: 0, hasChildren: false, assigneeCount: 1, completed: false, completedWeek: null })
    }
    expect(g.context).toMatchObject({ kind: 'project', name: 'POS Upgrade', archived: false, canEdit: true })
    expect(g.window).toEqual({ from: '2026-09-28', to: '2026-11-23', expand: [], zoom: 'week', includeOthers: false })
    expect(g.today).toBe(TODAY)
  })

  it('rowTotal (r8 §4.5, M6-D7): all-time, independent of the chunk', async () => {
    await seedGolden(db)
    const [cindy, ivy, mint] = await Promise.all([golden('Cindy'), golden('Ivy'), golden('Mint')])
    const g = await grid(cindy, 'POS Upgrade', chunk('2027-03-01', '2027-03-15'))
    expect(rowOf(g, cindy.id).rowTotal).toEqual({ total: 1875, committed: 1875 })
    expect(rowOf(g, ivy.id).rowTotal).toEqual({ total: 875, committed: 875 })
    expect(rowOf(g, mint.id).rowTotal).toEqual({ total: 1875, committed: 0 })
    expect(rowOf(g, cindy.id).cells).toEqual({})
  })

  it('footer data: POS people = Cindy, Ivy, Mint with capacity 500 in 10-19; F2 (holiday 10-23) → 400', async () => {
    await seedGolden(db)
    const cindy = await golden('Cindy')
    const ids = await Promise.all((['Cindy', 'Ivy', 'Mint'] as const).map(async (n) => (await golden(n)).id))
    const g = await grid(cindy, 'POS Upgrade')
    expect(Object.keys(g.people).sort()).toEqual([...ids].sort())
    for (const id of ids) {
      expect(g.people[id]!.capacity['W:2026-10-19']).toBe(500)
      expect(g.people[id]!.standard['W:2026-10-19']).toBe(500)
      expect(g.people[id]).toMatchObject({ active: true, deactivatedOn: null, timeOff: [] })
    }
    expect(g.people[cindy.id]!.name).toBe('Cindy')
    expect(g.people[cindy.id]!.otherProjects).toBeUndefined()
    await applyFixture(db, 'F2')
    const f2 = await grid(cindy, 'POS Upgrade')
    for (const id of ids) expect(f2.people[id]!.capacity['W:2026-10-19']).toBe(400)
    expect(f2.holidays).toHaveLength(1)
  })

  it('blockers (X76): Rollout blocked by UAT → { 1, 1 }; UAT done via setStatus → { 0, 1 }', async () => {
    await seedGolden(db)
    const cindy = await golden('Cindy')
    const rollout = await taskId('Rollout สาขา')
    const uat = await taskId('ทำ UAT + คู่มือหน้าร้าน')
    await db.transaction((tx) => addTaskBlocker(tx, cindy, { taskId: rollout, blockerTaskId: uat }))
    expect(taskNamed(await grid(cindy, 'POS Upgrade'), 'Rollout สาขา').blockers).toEqual({ open: 1, total: 1 })
    const posId = await goldenProjectId('POS Upgrade')
    const done = (await repo.statuses.listLiveStatuses(db, posId)).find((s) => s.category === 'DONE')!
    await db.transaction((tx) =>
      setStatus(tx, cindy, { projectId: posId, taskIds: [uat], statusId: done.id, withChildren: false }, TODAY),
    )
    const g = await grid(cindy, 'POS Upgrade')
    expect(taskNamed(g, 'Rollout สาขา').blockers).toEqual({ open: 0, total: 1 })
    // BR-50: UAT completed in week 09-28 → its 10-05 cell is still sent, but its totals stop at 09-28
    const uatRow = taskNamed(g, 'ทำ UAT + คู่มือหน้าร้าน')
    expect(uatRow).toMatchObject({ completed: true, completedWeek: '2026-09-28' })
    expect(uatRow.totals['W:2026-10-05']).toBeUndefined()
    expect(uatRow.totals['W:2026-09-28']).toEqual({ total: 250, committed: 250 })
    const ivy = await golden('Ivy')
    expect(rowOf(g, ivy.id).cells['W:2026-10-05']).toMatchObject({ cd: 125 })
    expect(rowOf(g, ivy.id).rowTotal).toEqual({ total: 750, committed: 750 })
  })

  it('WAITING counts (FR-628 / BR-87): Cindy’s POS task in "รอข้อมูล" keeps its totals', async () => {
    await seedGolden(db)
    const cindy = await golden('Cindy')
    const before = taskNamed(await grid(cindy, 'POS Upgrade', chunk('2026-08-31', '2026-10-12')), 'ปรับปรุงระบบ POS หน้าร้าน')
    const posId = await goldenProjectId('POS Upgrade')
    const waiting = (await repo.statuses.listLiveStatuses(db, posId)).find((s) => s.category === 'WAITING')!
    const id = await taskId('ปรับปรุงระบบ POS หน้าร้าน')
    await db.transaction((tx) =>
      setStatus(tx, cindy, { projectId: posId, taskIds: [id], statusId: waiting.id, withChildren: false }, TODAY),
    )
    const after = taskNamed(await grid(cindy, 'POS Upgrade', chunk('2026-08-31', '2026-10-12')), 'ปรับปรุงระบบ POS หน้าร้าน')
    expect(after.totals).toEqual(before.totals)
    expect(after.totals['W:2026-08-31']).toEqual({ total: 500, committed: 500 })
  })

  it('parents: two POS leaves nested under a new parent → parent totals = Σ children, hasChildren, no assignee rows under it', async () => {
    await seedGolden(db)
    const cindy = await golden('Cindy')
    const manager = await golden('Manager')
    const posId = await goldenProjectId('POS Upgrade')
    const parent = await makeTask({ project: { id: posId }, name: 'แม่ทดสอบ', createdBy: manager })
    const a = await taskId('ปรับปรุงระบบ POS หน้าร้าน')
    const b = await taskId('ทำ UAT + คู่มือหน้าร้าน')
    await db.transaction(async (tx) => {
      await moveTask(tx, manager, { taskId: a, parentId: parent.id, afterId: null })
      await moveTask(tx, manager, { taskId: b, parentId: parent.id, afterId: a })
    })
    const g = await grid(cindy, 'POS Upgrade', chunk('2026-09-14', '2026-10-12'))
    const p = taskNamed(g, 'แม่ทดสอบ')
    expect(p).toMatchObject({ hasChildren: true, assigneeCount: 0, depth: 0 })
    expect(p.totals).toEqual({
      'W:2026-09-14': { total: 625, committed: 625 },
      'W:2026-09-21': { total: 500, committed: 500 },
      'W:2026-09-28': { total: 500, committed: 500 },
      'W:2026-10-05': { total: 125, committed: 125 },
    })
    const idx = g.rows.findIndex((r) => r.kind === 'task' && r.id === parent.id)
    expect(g.rows[idx + 1]).toMatchObject({ kind: 'task', id: a, depth: 1, parentId: parent.id })
    expect(g.rows[idx + 2]).toMatchObject({ kind: 'assignee', taskId: a })
    expect(g.rows[idx + 3]).toMatchObject({ kind: 'task', id: b, depth: 1 })
  })

  it('AC-203 (X12): deactivated Cindy keeps POS row and cells; active false, deactivatedOn, capacity 0 from that week', async () => {
    await seedGolden(db)
    const manager = await golden('Manager')
    const cindy = await golden('Cindy')
    await db.transaction((tx) => deactivateEmployee(tx, manager, { userId: cindy.id, today: TODAY }))
    const g = await grid(manager, 'POS Upgrade', chunk('2026-08-31', '2026-10-12'))
    const row = rowOf(g, cindy.id)
    expect(row.cells['W:2026-08-31']).toMatchObject({ cd: 500 })
    expect(row.editable).toBe(true)
    expect(g.people[cindy.id]).toMatchObject({ active: false, deactivatedOn: '2026-09-30' })
    expect(g.people[cindy.id]!.capacity['W:2026-10-05']).toBe(0)
    expect(g.people[cindy.id]!.capacity['W:2026-09-28']).toBe(200) // Mon + Tue before 09-30
  })

  it('archived (X42): GET as cindy → context.archived, canEdit false, every editable false', async () => {
    await seedGolden(db)
    const posId = await goldenProjectId('POS Upgrade')
    await db.transaction((tx) => setProjectArchived(tx, posId, true))
    asUser(await goldenUser('Cindy'))
    const res = await callRoute(getGrid, `/api/grid/project/${posId}?from=2026-09-28&to=2026-11-23`, { projectId: posId })
    expect(res.status).toBe(200)
    const g = (await res.json()) as GridResponse
    expect(g.context).toMatchObject({ archived: true, canEdit: false })
    expect(assigneeRows(g).length).toBe(3)
    for (const r of assigneeRows(g)) expect(r.editable).toBe(false)
  })

  it('includeOthers (X29, BR-44): other-project numbers only; archived CRM drops out', async () => {
    await seedGolden(db)
    const manager = await golden('Manager')
    const [cindy, mint] = await Promise.all([golden('Cindy'), golden('Mint')])
    const g = await grid(manager, 'POS Upgrade', chunk('2026-09-28', '2026-11-23', true))
    expect(g.people[cindy.id]!.otherProjects?.['W:2026-10-05']).toEqual({ total: 250, committed: 0 })
    expect(g.people[mint.id]!.otherProjects?.['W:2026-09-28']).toEqual({ total: 250, committed: 250 })
    const json = JSON.stringify(g)
    for (const n of ['CRM Migration', 'Mobile App Revamp', 'ย้ายข้อมูลลูกค้า', 'พัฒนา front-end'])
      expect(json).not.toContain(n)
    for (const p of ['CRM Migration', 'Mobile App Revamp'] as const) expect(json).not.toContain(await goldenProjectId(p))
    await db.transaction(async (tx) => setProjectArchived(tx, await goldenProjectId('CRM Migration'), true))
    const after = await grid(manager, 'POS Upgrade', chunk('2026-09-28', '2026-11-23', true))
    expect(after.people[cindy.id]!.otherProjects?.['W:2026-10-05']).toBeUndefined()
    expect(after.people[mint.id]!.otherProjects?.['W:2026-09-28']).toEqual({ total: 250, committed: 250 })
  })

  it('route: bad query 400, invisible 404, malformed id 404 NOT_FOUND, default window, body = service, no-store', async () => {
    await seedGolden(db)
    const posId = await goldenProjectId('POS Upgrade')
    const call = (id: string, qs: string) => callRoute(getGrid, `/api/grid/project/${id}${qs}`, { projectId: id })
    asUser(await goldenUser('Cindy'))
    expect((await call(posId, '?from=2026-09-29&to=2026-10-26')).status).toBe(400)
    const bad = await call('not-a-uuid', '?from=2026-09-28&to=2026-10-26')
    expect(bad.status).toBe(404)
    expect(await bad.json()).toMatchObject({ code: 'NOT_FOUND' })
    const def = await call(posId, '')
    expect(def.status).toBe(200)
    expect(def.headers.get('Cache-Control')).toBe('private, no-store')
    const body = (await def.json()) as GridResponse
    expect(body.window).toMatchObject({ from: '2026-08-31', to: '2026-12-21' })
    expect(body.periods).toHaveLength(16)
    const service = await buildChunk(
      db,
      toSessionUser(await goldenUser('Cindy')),
      { kind: 'project', id: posId },
      chunk('2026-08-31', '2026-12-21'),
      TODAY,
    )
    expect(body).toEqual(JSON.parse(JSON.stringify(service)))
    asUser(await goldenUser('Peter'))
    const hidden = await call(posId, '?from=2026-09-28&to=2026-10-26')
    expect(hidden.status).toBe(404)
    expect(JSON.stringify(await hidden.json())).not.toContain('POS')
  })
})

describe('buildChunk — world', () => {
  it('BR-50: pDoneMember’s W:10-05 = 200 is sent but not in task totals; rowTotal 100', async () => {
    const w = await createWorld({ with: ['allocations'] })
    const g = await buildChunk(db, toSessionUser(w.member), { kind: 'project', id: w.P.id }, chunk('2026-09-28', '2026-10-19'), TODAY)
    const row = assigneeRows(g).find((r) => r.taskAssignmentId === w.assignments.pDoneMember.id)!
    expect(row.cells['W:2026-10-05']).toEqual({ cd: 200, resolution: 'WEEK', derived: false })
    expect(row.rowTotal).toEqual({ total: 100, committed: 100 })
    const t = taskRows(g).find((x) => x.id === w.tasks.pDone.id)!
    expect(t).toMatchObject({ completed: true, completedWeek: '2026-09-28' })
    expect(t.totals['W:2026-10-05']).toBeUndefined()
    expect(t.totals['W:2026-09-28']).toEqual({ total: 100, committed: 100 })
  })

  it('DAY week (BR-20a): pChildAMember W:10-12 = Σ days with the day values; parent sums it; parent rows not editable', async () => {
    const w = await createWorld({ with: ['allocations'] })
    const g = await buildChunk(db, toSessionUser(w.lead), { kind: 'project', id: w.P.id }, chunk('2026-10-12', '2026-10-19'), TODAY)
    const row = assigneeRows(g).find((r) => r.taskAssignmentId === w.assignments.pChildAMember.id)!
    expect(row.cells['W:2026-10-12']).toEqual({
      cd: 100,
      resolution: 'DAY',
      derived: false,
      days: { '2026-10-12': 50, '2026-10-13': 50 },
    })
    expect(row.editable).toBe(true)
    const parent = taskRows(g).find((x) => x.id === w.tasks.pParent.id)!
    expect(parent).toMatchObject({ hasChildren: true, assigneeCount: 0 })
    expect(parent.totals['W:2026-10-12']).toEqual({ total: 100, committed: 100 })
    // depth-first: parent, child A + its assignee, child B (the deleted assignment is gone)
    const i = g.rows.findIndex((r) => r.kind === 'task' && r.id === w.tasks.pParent.id)
    expect(g.rows.slice(i, i + 4).map((r) => (r.kind === 'task' ? r.id : r.taskAssignmentId))).toEqual([
      w.tasks.pParent.id,
      w.tasks.pChildA.id,
      w.assignments.pChildAMember.id,
      w.tasks.pChildB.id,
    ])
    // archived A through the service: readable, nothing editable
    const a = await buildChunk(db, toSessionUser(w.member), { kind: 'project', id: w.A.id }, chunk('2026-10-05', '2026-10-12'), TODAY)
    expect(a.context).toMatchObject({ archived: true, canEdit: false })
    expect(assigneeRows(a).every((r) => !r.editable)).toBe(true)
  })

  it('outsider → NOT_FOUND from the service itself (authz first)', async () => {
    const w = await createWorld({ with: ['allocations'] })
    await expect(
      buildChunk(db, toSessionUser(w.outsider), { kind: 'project', id: w.P.id }, chunk('2026-10-12', '2026-10-19'), TODAY),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' })
  })
})
