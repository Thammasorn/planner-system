// M7 S2.2–S2.3 — grid chunk at day level: periods for expanded weeks / day zoom (FR-802/803, M7-D10/D17), derived and
// stored day cells (BR-20/20a/21/21a, M7-D9), D: capacity keys (M7-D19), F2 holiday, leave added later (BR-42,
// M7-D15), other projects' day loads (X29, M7-D27) and blockers kept (X76). Golden F1 unless noted; actor Cindy (LEAD).
import { and, eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { GET as getGrid } from '@/app/api/grid/project/[projectId]/route'
import type { ISODate } from '@/domain/types'
import type { GridAssigneeRow, GridResponse, GridTaskRow } from '@/lib/contracts/grid'
import { applyFixture, seedGolden } from '../../../scripts/lib/fixtures'
import { callRoute, okJson } from '../../../tests/authz/_support/http'
import { goldenProjectId, goldenUser, type GoldenProject, type GoldenViewer } from '../../../tests/authz/_support/golden'
import { asUser, toSessionUser } from '../../../tests/helpers/as-user'
import { allocationRows, makeDayAllocations } from '../../../tests/helpers/factories'
import { createTimeOff } from '../actions/time-off'
import { db } from '../db/client'
import { allocations, leaveTypes, taskAssignments, tasks, user as userTable, workSchedules } from '../db/schema'
import type { SessionUser } from '../session'
import { buildChunk, type ChunkParams } from './grid'
import { addTaskBlocker } from './taskBlockers'

const TODAY: ISODate = '2026-09-30'

beforeEach(() => {
  vi.stubEnv('ALLOW_TEST_HOOKS', '1')
  vi.stubEnv('APP_NOW', '2026-09-30T10:00:00+07:00')
})

const params = (from: ISODate, to: ISODate, o: Partial<ChunkParams> = {}): ChunkParams => ({
  from,
  to,
  expand: [],
  zoom: 'week',
  includeOthers: false,
  ...o,
})

async function golden(nick: GoldenViewer): Promise<SessionUser> {
  return toSessionUser(await goldenUser(nick))
}

async function grid(user: SessionUser, project: GoldenProject, p: ChunkParams): Promise<GridResponse> {
  return buildChunk(db, user, { kind: 'project', id: await goldenProjectId(project) }, p, TODAY)
}

async function assignmentOf(taskName: string): Promise<string> {
  const [a] = await db
    .select({ id: taskAssignments.id })
    .from(taskAssignments)
    .innerJoin(tasks, eq(tasks.id, taskAssignments.taskId))
    .where(eq(tasks.name, taskName))
  if (!a) throw new Error(`assignment of ${taskName} not found`)
  return a.id
}

/** Drops the WEEK row of one (assignment, week) so a test can put DAY rows there (the trigger forbids mixing). */
async function clearWeek(assignmentId: string, week: ISODate): Promise<void> {
  await db
    .delete(allocations)
    .where(and(eq(allocations.taskAssignmentId, assignmentId), eq(allocations.weekStart, week)))
}

const rowOf = (g: GridResponse, userId: string) =>
  g.rows.find((r): r is GridAssigneeRow => r.kind === 'assignee' && r.userId === userId)!
const keys = (g: GridResponse) => g.periods.map((p) => p.key)
const WEEKDAYS_0928 = ['D:2026-09-28', 'D:2026-09-29', 'D:2026-09-30', 'D:2026-10-01', 'D:2026-10-02'] as const

describe('grid periods (FR-802/803, M7-D10)', () => {
  it('zoom=week without expand → 4 WEEK periods, none expanded (M6 shape)', async () => {
    await seedGolden(db)
    const g = await grid(await golden('Cindy'), 'POS Upgrade', params('2026-09-28', '2026-10-26'))
    expect(g.periods).toHaveLength(4)
    for (const p of g.periods) {
      expect(p.kind).toBe('WEEK')
      expect(p.expanded).toBeUndefined()
    }
    expect(g.window).toEqual({ from: '2026-09-28', to: '2026-10-26', expand: [], zoom: 'week', includeOthers: false })
  })

  it('expand=2026-09-28 → five D: periods, then W:2026-09-28 { expanded }, then the collapsed weeks', async () => {
    await seedGolden(db)
    const g = await grid(await golden('Cindy'), 'POS Upgrade', params('2026-09-28', '2026-10-26', { expand: ['2026-09-28'] }))
    expect(keys(g)).toEqual([...WEEKDAYS_0928, 'W:2026-09-28', 'W:2026-10-05', 'W:2026-10-12', 'W:2026-10-19'])
    expect(g.periods[0]).toEqual({ key: 'D:2026-09-28', kind: 'DAY', weekStart: '2026-09-28', date: '2026-09-28' })
    expect(g.periods[5]).toEqual({ key: 'W:2026-09-28', kind: 'WEEK', weekStart: '2026-09-28', date: '2026-09-28', expanded: true })
    expect(g.periods[6]!.expanded).toBeUndefined()
    expect(g.window.expand).toEqual(['2026-09-28'])
  })

  it('zoom=day → 4 × (5 + 1); a Saturday in Mint’s schedule → 6 days + รวม; a Sunday DAY row adds that date', async () => {
    await seedGolden(db)
    const cindy = await golden('Cindy')
    const p = params('2026-09-28', '2026-10-26', { zoom: 'day' })
    expect((await grid(cindy, 'POS Upgrade', p)).periods).toHaveLength(24)
    const mint = (await goldenUser('Mint')).id
    await db.insert(workSchedules).values({ userId: mint, weekday: 6, fraction: '1.00' })
    const sat = await grid(cindy, 'POS Upgrade', p)
    expect(sat.periods).toHaveLength(28)
    expect(keys(sat).slice(0, 7)).toEqual([...WEEKDAYS_0928, 'D:2026-10-03', 'W:2026-09-28'])
    await makeDayAllocations({ assignment: { id: await assignmentOf('Rollout สาขา') }, days: { '2026-10-04': 50 } })
    const sun = await grid(cindy, 'POS Upgrade', p)
    expect(keys(sun).slice(0, 8)).toEqual([...WEEKDAYS_0928, 'D:2026-10-03', 'D:2026-10-04', 'W:2026-09-28'])
    expect(sun.periods).toHaveLength(29)
  })

  it('zoom=day&expand=2026-10-05 → identical to zoom=day (expand ignored)', async () => {
    await seedGolden(db)
    const cindy = await golden('Cindy')
    const a = await grid(cindy, 'POS Upgrade', params('2026-09-28', '2026-10-26', { zoom: 'day' }))
    const b = await grid(cindy, 'POS Upgrade', params('2026-09-28', '2026-10-26', { zoom: 'day', expand: ['2026-10-05'] }))
    expect(b.periods).toEqual(a.periods)
    expect(b.rows).toEqual(a.rows)
    expect(b.people).toEqual(a.people)
  })

  it('route: zoom/expand are forwarded and echoed; bad expand → 400 before authz', async () => {
    await seedGolden(db)
    const cindy = await goldenUser('Cindy')
    asUser(cindy)
    const pos = await goldenProjectId('POS Upgrade')
    const body = await okJson<GridResponse>(
      await callRoute(getGrid, `/api/grid/project/${pos}?from=2026-09-28&to=2026-10-26&expand=2026-10-05&zoom=week`, {
        projectId: pos,
      }),
    )
    expect(body.window).toMatchObject({ expand: ['2026-10-05'], zoom: 'week' })
    expect(body.periods.filter((p) => p.kind === 'DAY')).toHaveLength(5)
    const bad = await callRoute(getGrid, `/api/grid/project/${pos}?from=2026-09-28&to=2026-10-26&expand=2026-11-02`, {
      projectId: pos,
    })
    expect(bad.status).toBe(400)
  })
})

describe('grid day cells (BR-20/20a/21/21a, M7-D9/D15/D19)', () => {
  it('derived: Ivy 09-28 (WEEK 250) → 50 × 5 derived; W cell unchanged; capacity D:2026-09-30 = 100', async () => {
    await seedGolden(db)
    const ivy = (await goldenUser('Ivy')).id
    const g = await grid(await golden('Cindy'), 'POS Upgrade', params('2026-09-28', '2026-10-26', { expand: ['2026-09-28'] }))
    const row = rowOf(g, ivy)
    for (const k of WEEKDAYS_0928) expect(row.cells[k]).toEqual({ cd: 50, resolution: 'WEEK', derived: true })
    expect(row.cells['D:2026-10-03']).toBeUndefined()
    expect(row.cells['W:2026-09-28']).toEqual({ cd: 250, resolution: 'WEEK', derived: false })
    expect(g.people[ivy]!.capacity['D:2026-09-30']).toBe(100)
    expect(g.people[ivy]!.capacity['D:2026-10-07']).toBeUndefined() // collapsed WEEK week: no D: keys (M7-D19)
    // task totals carry the D: keys (Ivy's task is CONFIRMED)
    const uat = g.rows.find((r): r is GridTaskRow => r.kind === 'task' && r.name === 'ทำ UAT + คู่มือหน้าร้าน')!
    expect(uat.totals['D:2026-09-30']).toEqual({ total: 50, committed: 50 })
  })

  it('DAY week collapsed: W cell = Σ with days; the five D: capacity keys are present anyway (M7-D19)', async () => {
    await seedGolden(db)
    const ivy = (await goldenUser('Ivy')).id
    const uat = await assignmentOf('ทำ UAT + คู่มือหน้าร้าน')
    await clearWeek(uat, '2026-09-28')
    const days = { '2026-09-28': 50, '2026-09-29': 50, '2026-09-30': 100, '2026-10-01': 50, '2026-10-02': 50 }
    await makeDayAllocations({ assignment: { id: uat }, days })
    const g = await grid(await golden('Cindy'), 'POS Upgrade', params('2026-09-28', '2026-10-26'))
    expect(rowOf(g, ivy).cells['W:2026-09-28']).toEqual({ cd: 300, resolution: 'DAY', derived: false, days })
    expect(rowOf(g, ivy).cells['D:2026-09-30']).toBeUndefined()
    for (const k of WEEKDAYS_0928) expect(g.people[ivy]!.capacity[k]).toBe(100)
    expect(g.periods.every((p) => p.kind === 'WEEK')).toBe(true)
  })

  it('BR-21a: Ivy deactivated 2026-09-28 → W:10-05 fallback SCHEDULE; expanded → 25 × 5 with warn NON_WORKING', async () => {
    await seedGolden(db)
    const ivy = (await goldenUser('Ivy')).id
    await db.update(userTable).set({ deactivatedOn: '2026-09-28' }).where(eq(userTable.id, ivy))
    const cindy = await golden('Cindy')
    const g = await grid(cindy, 'POS Upgrade', params('2026-09-28', '2026-10-26'))
    expect(rowOf(g, ivy).cells['W:2026-10-05']).toEqual({ cd: 125, resolution: 'WEEK', derived: false, fallback: 'SCHEDULE' })
    const e = await grid(cindy, 'POS Upgrade', params('2026-09-28', '2026-10-26', { expand: ['2026-10-05'] }))
    for (const d of ['2026-10-05', '2026-10-06', '2026-10-07', '2026-10-08', '2026-10-09'] as const)
      expect(rowOf(e, ivy).cells[`D:${d}`]).toEqual({ cd: 25, resolution: 'WEEK', derived: true, warn: ['NON_WORKING'] })
  })

  it('F2 (Mobile, expand 10-19): Jack Mon–Thu = 125 derived; no Fri cell; D:2026-10-23 period and holiday listed', async () => {
    await seedGolden(db)
    await applyFixture(db, 'F2')
    const jack = (await goldenUser('Jack')).id
    const g = await grid(await golden('Manager'), 'Mobile App Revamp', params('2026-10-19', '2026-10-26', { expand: ['2026-10-19'] }))
    for (const d of ['2026-10-19', '2026-10-20', '2026-10-21', '2026-10-22'] as const)
      expect(rowOf(g, jack).cells[`D:${d}`]).toEqual({ cd: 125, resolution: 'WEEK', derived: true })
    expect(rowOf(g, jack).cells['D:2026-10-23']).toBeUndefined()
    expect(keys(g)).toContain('D:2026-10-23')
    expect(g.holidays.map((h) => h.date)).toEqual(['2026-10-23'])
    expect(g.people[jack]!.capacity['D:2026-10-23']).toBeUndefined()
    expect(g.people[jack]!.standard['D:2026-10-23']).toBe(100)
  })

  it('leave later (BR-42): DAY rows on CRM, leave on 10-13 → rows unchanged; D:2026-10-13 warn NON_WORKING + TIME_OFF', async () => {
    await seedGolden(db)
    const ivyUser = await goldenUser('Ivy')
    const crm = await assignmentOf('ตั้งค่า automation')
    await clearWeek(crm, '2026-10-12')
    await makeDayAllocations({ assignment: { id: crm }, days: { '2026-10-12': 100, '2026-10-13': 100, '2026-10-14': 100 } })
    const before = await allocationRows(crm, '2026-10-12')
    const [vacation] = await db.select({ id: leaveTypes.id }).from(leaveTypes).where(eq(leaveTypes.name, 'ลาพักร้อน'))
    asUser(ivyUser)
    const r = await createTimeOff({ leaveTypeId: vacation!.id, startDate: '2026-10-13', endDate: '2026-10-13' })
    expect(r.ok).toBe(true)
    expect(await allocationRows(crm, '2026-10-12')).toEqual(before)
    const g = await grid(await golden('Manager'), 'CRM Migration', params('2026-10-12', '2026-10-19', { expand: ['2026-10-12'] }))
    const row = rowOf(g, ivyUser.id)
    expect(row.cells['D:2026-10-13']).toEqual({ cd: 100, resolution: 'DAY', derived: false, warn: ['NON_WORKING', 'TIME_OFF'] })
    expect(row.cells['D:2026-10-12']).toEqual({ cd: 100, resolution: 'DAY', derived: false })
  })

  it('otherProjects day keys (X29): Cindy on POS, includeOthers + expand 10-05 → D:2026-10-05 { 50, 0 }; no CRM name or id', async () => {
    await seedGolden(db)
    const cindy = await golden('Cindy')
    const p = params('2026-09-28', '2026-10-26', { includeOthers: true, expand: ['2026-10-05'] })
    const g = await grid(cindy, 'POS Upgrade', p)
    const other = g.people[cindy.id]!.otherProjects!
    expect(other['D:2026-10-05']).toEqual({ total: 50, committed: 0 })
    expect(other['W:2026-10-05']).toEqual({ total: 250, committed: 0 })
    expect(other['D:2026-10-12']).toBeUndefined() // collapsed week: W: key only
    const json = JSON.stringify(g)
    expect(json).not.toContain('CRM Migration')
    expect(json).not.toContain('ย้ายข้อมูลลูกค้า')
    expect(json).not.toContain(await goldenProjectId('CRM Migration'))
  })

  it('blockers kept (X76): a POS task blocked by another → blockers { 1, 1 } under zoom=day', async () => {
    await seedGolden(db)
    const cindy = await golden('Cindy')
    const [rollout] = await db.select({ id: tasks.id }).from(tasks).where(eq(tasks.name, 'Rollout สาขา'))
    const [uat] = await db.select({ id: tasks.id }).from(tasks).where(eq(tasks.name, 'ทำ UAT + คู่มือหน้าร้าน'))
    await db.transaction((tx) => addTaskBlocker(tx, cindy, { taskId: rollout!.id, blockerTaskId: uat!.id }))
    const g = await grid(cindy, 'POS Upgrade', params('2026-09-28', '2026-10-26', { zoom: 'day' }))
    const row = g.rows.find((r): r is GridTaskRow => r.kind === 'task' && r.id === rollout!.id)!
    expect(row.blockers).toEqual({ open: 1, total: 1 })
    expect(row).toMatchObject({ milestoneId: null, lateForMilestone: false })
  })
})
