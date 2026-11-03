// M9 S2.5 — person grid chunk (GET /api/grid/person/[userId], FR-1008, SPEC §7.4, X28/X67/X76, M9-D12/D29; golden).
import { randomUUID } from 'node:crypto'
import { and, eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { GET as getPersonGrid } from '@/app/api/grid/person/[userId]/route'
import { addLoad } from '@/domain/certainty'
import type { ISODate, LoadPair, PeriodKey } from '@/domain/types'
import { th } from '@/i18n/th'
import type {
  GridAssigneeRow,
  GridMaskedRow,
  GridProjectRow,
  GridResponse,
  GridTaskRow,
} from '@/lib/contracts/grid'
import { saveAllocations } from '@/server/actions/allocations'
import { addMilestones, seedGolden } from '../../../scripts/lib/fixtures'
import { callRoute, okJson } from '../../../tests/authz/_support/http'
import {
  GOLDEN_VIEWERS,
  goldenProjectId,
  goldenTaskNames,
  goldenUser,
  type GoldenViewer,
} from '../../../tests/authz/_support/golden'
import { asUser, toSessionUser } from '../../../tests/helpers/as-user'
import { makeAllocation, makeAssignment, makeTask } from '../../../tests/helpers/factories'
import { allNumbersInteger, containsAny } from '../../../tests/helpers/json'
import { db } from '../db/client'
import { projects, taskAssignments, tasks } from '../db/schema'
import { NotFoundError } from '../errors'
import type { SessionUser } from '../session'
import { buildChunk, type ChunkParams } from './grid'
import { buildTable } from './workload'

const TODAY: ISODate = '2026-09-30'

beforeEach(() => {
  vi.stubEnv('ALLOW_TEST_HOOKS', '1')
  vi.stubEnv('APP_NOW', '2026-09-30T10:00:00+07:00')
})

const chunk = (from: ISODate, to: ISODate, zoom: 'week' | 'day' = 'week'): ChunkParams => ({
  from,
  to,
  expand: [],
  zoom,
  includeOthers: false,
})
const as = async (n: GoldenViewer): Promise<SessionUser> => toSessionUser(await goldenUser(n))
const idOf = async (n: GoldenViewer) => (await goldenUser(n)).id
const person = async (viewer: GoldenViewer, target: GoldenViewer, p = chunk('2026-09-14', '2026-11-09')) =>
  buildChunk(db, await as(viewer), { kind: 'person', id: await idOf(target) }, p, TODAY)
const masked = (g: GridResponse) => g.rows.find((r): r is GridMaskedRow => r.kind === 'masked')
const taskRows = (g: GridResponse) => g.rows.filter((r): r is GridTaskRow => r.kind === 'task')
const projectRows = (g: GridResponse) => g.rows.filter((r): r is GridProjectRow => r.kind === 'project')
const label = (r: GridResponse['rows'][number]) =>
  r.kind === 'project' ? `project ${r.name}` : r.kind === 'task' ? `task ${r.name}` : r.kind

async function idsOfProjects(names: string[]): Promise<string[]> {
  const out: string[] = []
  for (const n of names) {
    const [p] = await db.select({ id: projects.id }).from(projects).where(eq(projects.name, n))
    out.push(p!.id)
    for (const t of await db.select({ id: tasks.id }).from(tasks).where(eq(tasks.projectId, p!.id))) {
      out.push(t.id)
      for (const a of await db.select({ id: taskAssignments.id }).from(taskAssignments).where(eq(taskAssignments.taskId, t.id)))
        out.push(a.id)
    }
  }
  return out
}

describe('buildPersonChunk', () => {
  it('shape: manager → Ivy: CRM then POS project rows, each task followed by Ivy’s assignee row; no masked row', async () => {
    await seedGolden(db)
    const g = await person('Manager', 'Ivy')
    expect(g.rows.map(label)).toEqual([
      'project CRM Migration',
      'task ตั้งค่า automation',
      'assignee',
      'project POS Upgrade',
      'task ทำ UAT + คู่มือหน้าร้าน',
      'assignee',
    ])
    const pos = projectRows(g).find((r) => r.name === 'POS Upgrade')!
    expect(pos.totals['W:2026-09-28']).toEqual({ total: 250, committed: 250 })
    expect(pos).toMatchObject({ canEdit: true, certainty: 'CONFIRMED' })
    expect(Object.keys(g.people)).toEqual([await idOf('Ivy')])
    expect(g.context).toMatchObject({ kind: 'person', id: await idOf('Ivy'), name: 'Ivy', canEdit: true, canManage: false })
    const uat = taskRows(g).find((t) => t.name === 'ทำ UAT + คู่มือหน้าร้าน')!
    expect(uat).toMatchObject({ depth: 0, projectId: pos.id, breadcrumb: [], assigneeCount: 1, hasChildren: false })
    expect(g.rows.filter((r): r is GridAssigneeRow => r.kind === 'assignee').every((r) => r.editable)).toBe(true)
    expect(g.window.includeOthers).toBe(false)
    expect(allNumbersInteger(g)).toBe(true)
  })

  it('masking Cindy → Peter: only the masked row (r8 §6.4); no DW/Store names or ids', async () => {
    await seedGolden(db)
    const g = await person('Cindy', 'Peter')
    expect(g.rows.map((r) => r.kind)).toEqual(['masked'])
    const m = masked(g)!
    expect(m.label).toBe(th.masking.otherProjects)
    expect(m.totals['W:2026-09-28']).toEqual({ total: 500, committed: 500 })
    expect(m.totals['W:2026-10-05']?.total).toBe(500)
    expect(m.totals['W:2026-10-19']?.total).toBe(250)
    expect(g.milestones).toEqual([])
    const secrets = [
      'Data Warehouse',
      'Store Analytics Dashboard',
      ...goldenTaskNames(['Data Warehouse', 'Store Analytics Dashboard']),
      ...(await idsOfProjects(['Data Warehouse', 'Store Analytics Dashboard'])),
    ]
    expect(containsAny(g, secrets)).toEqual([])
    expect(g.context.canEdit).toBe(false)
  })

  it('masking Ivy → Mint: POS rows visible; masked W:09-28 250, 10-05 500, 11-02 375; no Mobile', async () => {
    await seedGolden(db)
    const g = await person('Ivy', 'Mint', chunk('2026-09-14', '2026-12-21'))
    expect(g.rows.map(label)).toEqual(['project POS Upgrade', 'task Rollout สาขา', 'assignee', 'masked'])
    const m = masked(g)!
    expect(m.totals['W:2026-09-28']?.total).toBe(250)
    expect(m.totals['W:2026-10-05']?.total).toBe(500)
    expect(m.totals['W:2026-11-02']?.total).toBe(375)
    const secrets = ['Mobile App Revamp', ...goldenTaskNames(['Mobile App Revamp']), ...(await idsOfProjects(['Mobile App Revamp']))]
    expect(containsAny(g, secrets)).toEqual([])
  })

  it('404: invisible pairs (r8) and unknown ids; route 404 + 400', async () => {
    await seedGolden(db)
    const pairs: [GoldenViewer, GoldenViewer][] = [
      ['Ivy', 'Jack'],
      ['Ivy', 'Peter'],
      ['Ivy', 'Manager'],
      ['Mint', 'Manager'],
      ['Mint', 'Peter'],
    ]
    for (const [v, t] of pairs) await expect(person(v, t)).rejects.toBeInstanceOf(NotFoundError)
    const manager = await as('Manager')
    await expect(
      buildChunk(db, manager, { kind: 'person', id: randomUUID() }, chunk('2026-09-28', '2026-10-05'), TODAY),
    ).rejects.toBeInstanceOf(NotFoundError)
    asUser(await goldenUser('Ivy'))
    const jack = await idOf('Jack')
    expect((await callRoute(getPersonGrid, `/api/grid/person/${jack}`, { userId: jack })).status).toBe(404)
    const ivy = await idOf('Ivy')
    expect((await callRoute(getPersonGrid, `/api/grid/person/${ivy}?from=2026-09-29&to=2026-10-12`, { userId: ivy })).status).toBe(400)
    const body = await okJson<GridResponse>(await callRoute(getPersonGrid, `/api/grid/person/${ivy}`, { userId: ivy }))
    expect(body.context.kind).toBe('person')
    expect(body.window.from).toBe('2026-08-31')
  })

  it('archived (BR-44): archive CRM → Cindy’s grid has no CRM row and no masked row', async () => {
    await seedGolden(db)
    await db.update(projects).set({ archivedAt: new Date() }).where(eq(projects.name, 'CRM Migration'))
    const g = await person('Manager', 'Cindy')
    expect(projectRows(g).map((r) => r.name)).toEqual(['POS Upgrade'])
    expect(masked(g)).toBeUndefined()
  })

  it('day zoom: Ivy assignee D cells 50 ×5 derived; as Peter → masked D:09-28…10-02 = 50/50, no names', async () => {
    await seedGolden(db)
    const p = chunk('2026-09-28', '2026-10-05', 'day')
    const g = await person('Manager', 'Ivy', p)
    const uat = g.rows.find((r): r is GridAssigneeRow => r.kind === 'assignee' && r.cells['W:2026-09-28']?.cd === 250)!
    for (const d of ['2026-09-28', '2026-09-29', '2026-09-30', '2026-10-01', '2026-10-02'])
      expect(uat.cells[`D:${d}` as PeriodKey]).toMatchObject({ cd: 50, derived: true })
    const asPeter = await person('Peter', 'Ivy', p)
    const m = masked(asPeter)!
    for (const d of ['2026-09-28', '2026-09-29', '2026-09-30', '2026-10-01', '2026-10-02'])
      expect(m.totals[`D:${d}` as PeriodKey]).toEqual({ total: 50, committed: 50 })
    expect(containsAny(asPeter, ['POS Upgrade', 'CRM Migration', ...goldenTaskNames(['POS Upgrade', 'CRM Migration'])])).toEqual([])
  })

  it('milestones (M8, MASK-6): visible projects of the person only; lateForMilestone; canManage false', async () => {
    await seedGolden(db)
    await addMilestones(db)
    const ivy = await person('Cindy', 'Ivy')
    expect(ivy.milestones.map((m) => m.name).sort()).toEqual(['Data migration complete', 'Go-live สาขาแรก', 'UAT sign-off'])
    expect(taskRows(ivy).find((t) => t.name === 'ทำ UAT + คู่มือหน้าร้าน')!.lateForMilestone).toBe(true)
    const peter = await person('Cindy', 'Peter')
    expect(peter.milestones).toEqual([])
    expect(containsAny(peter, ['Pipeline พร้อมใช้งาน', 'Dashboard v1 review'])).toEqual([])
    const mint = await person('Ivy', 'Mint')
    expect(mint.milestones.map((m) => m.name).sort()).toEqual(['Go-live สาขาแรก', 'UAT sign-off'])
    expect(containsAny(mint, ['Design freeze', 'Beta release'])).toEqual([])
    expect((await person('Manager', 'Ivy')).context.canManage).toBe(false)
  })

  it('AC-604: shared task Jack 300 / Mint 200 → each person grid shows only their own load', async () => {
    await seedGolden(db)
    const mobile = await goldenProjectId('Mobile App Revamp')
    const manager = await goldenUser('Manager')
    const t = await makeTask({ project: { id: mobile }, name: 'งานร่วม AC-604', createdBy: manager })
    const jack = await goldenUser('Jack')
    const mint = await goldenUser('Mint')
    await makeAllocation({ assignment: await makeAssignment({ task: t, user: jack }), period: '2026-11-16', cd: 300 })
    await makeAllocation({ assignment: await makeAssignment({ task: t, user: mint }), period: '2026-11-16', cd: 200 })
    const p = chunk('2026-11-16', '2026-11-23')
    for (const [who, cd] of [['Jack', 300], ['Mint', 200]] as const) {
      const g = await person('Manager', who, p)
      const k = g.rows.findIndex((r) => r.kind === 'task' && r.name === 'งานร่วม AC-604')
      const taskRow = g.rows[k] as GridTaskRow
      const own = g.rows[k + 1] as GridAssigneeRow
      expect(own.cells['W:2026-11-16']).toMatchObject({ cd })
      expect(taskRow.totals['W:2026-11-16']).toEqual({ total: cd, committed: cd })
      expect(taskRow.assigneeCount).toBe(2)
    }
  })

  it('parity: Σ task totals + masked = workload cell for every golden user (manager and Cindy viewers)', async () => {
    await seedGolden(db)
    const window = { from: '2026-09-28', to: '2026-12-21' }
    for (const viewer of ['Manager', 'Cindy'] as const) {
      const v = await as(viewer)
      const table = await buildTable(db, v, { window }, TODAY)
      const cells = new Map(table.groups.flatMap((g) => g.people.map((p) => [p.userId, p.cells] as const)))
      for (const target of GOLDEN_VIEWERS) {
        const id = await idOf(target)
        const tc = cells.get(id)
        if (!tc) continue
        const g = await buildChunk(db, v, { kind: 'person', id }, chunk(window.from, window.to), TODAY)
        for (const w of table.weeks) {
          let sum: LoadPair = { total: 0, committed: 0 }
          for (const r of g.rows) {
            if (r.kind === 'task' || r.kind === 'masked') sum = addLoad(sum, r.totals[`W:${w}`] ?? { total: 0, committed: 0 })
          }
          expect([viewer, target, w, sum]).toEqual([viewer, target, w, { total: tc[w]!.total, committed: tc[w]!.committed }])
        }
      }
    }
  })

  it('edits: Cindy (LEAD of CRM) saves Ivy’s CRM cell from the person grid; Peter → NOT_FOUND', async () => {
    await seedGolden(db)
    const g = await person('Cindy', 'Ivy')
    const crmTask = taskRows(g).find((t) => t.name === 'ตั้งค่า automation')!
    const row = g.rows.find((r): r is GridAssigneeRow => r.kind === 'assignee' && r.taskId === crmTask.id)!
    const input = {
      items: [
        {
          taskAssignmentId: row.taskAssignmentId,
          baseVersion: row.version,
          changes: [{ granularity: 'WEEK' as const, period: '2026-10-19', cd: 300 }],
        },
      ],
      clientOpId: 'person-grid-edit',
    }
    asUser(await goldenUser('Cindy'))
    expect(await saveAllocations(input)).toMatchObject({ ok: true })
    asUser(await goldenUser('Peter'))
    expect(await saveAllocations({ ...input, clientOpId: 'p2' })).toMatchObject({ ok: false, code: 'NOT_FOUND' })
    const [a] = await db
      .select({ version: taskAssignments.version })
      .from(taskAssignments)
      .where(and(eq(taskAssignments.id, row.taskAssignmentId)))
    expect(a!.version).toBe(row.version + 1)
  })
})
