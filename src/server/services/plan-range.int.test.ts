// M6 S2.5 — planAssignmentRange (FR-612, BR-25, M6-D6 deviation, AC-604 M6 part / X14). Golden F1 unless noted.
import { eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ISODate } from '@/domain/types'
import { th } from '@/i18n/th'
import type { ActionResult } from '@/lib/action-result'
import type { PlanAssignmentRangeOk } from '@/lib/contracts/grid'
import { applyFixture, seedGolden } from '../../../scripts/lib/fixtures'
import { goldenProjectId, goldenUser, type GoldenViewer } from '../../../tests/authz/_support/golden'
import { asUser, toSessionUser } from '../../../tests/helpers/as-user'
import { auditCount, auditRowsAfter } from '../../../tests/helpers/audit'
import { allocationRows, assignmentVersion, makeAssignment, makeTask } from '../../../tests/helpers/factories'
import { createWorld } from '../../../tests/helpers/world'
import { planAssignmentRange, saveAllocations } from '../actions/allocations'
import { db } from '../db/client'
import { taskAssignments, tasks } from '../db/schema'
import * as repo from '../repo'
import { buildChunk } from './grid'

const TODAY: ISODate = '2026-09-30'

beforeEach(() => {
  vi.stubEnv('ALLOW_TEST_HOOKS', '1')
  vi.stubEnv('APP_NOW', '2026-09-30T10:00:00+07:00')
})

async function assignmentOf(taskName: string): Promise<string> {
  const [a] = await db
    .select({ id: taskAssignments.id })
    .from(taskAssignments)
    .innerJoin(tasks, eq(tasks.id, taskAssignments.taskId))
    .where(eq(tasks.name, taskName))
  if (!a) throw new Error(`assignment of ${taskName} not found`)
  return a.id
}

const UAT = 'ทำ UAT + คู่มือหน้าร้าน'

async function as(nick: GoldenViewer) {
  return asUser(await goldenUser(nick))
}

function ok(r: ActionResult<PlanAssignmentRangeOk>): PlanAssignmentRangeOk {
  if (!r.ok) throw new Error(`expected ok, got ${r.code}: ${r.message}`)
  return r
}

const plan = (
  taskAssignmentId: string,
  totalCd: number,
  start: ISODate,
  end: ISODate,
  o: { dryRun?: boolean; baseVersion?: number | null } = {},
) =>
  planAssignmentRange({
    taskAssignmentId,
    totalCd,
    start,
    end,
    dryRun: o.dryRun ?? false,
    baseVersion: o.baseVersion === undefined ? 1 : o.baseVersion,
    clientOpId: 'pr',
  })

describe('planAssignmentRange — golden', () => {
  it('r8 §6.8: 1000 cd over 11-11..11-24 — dryRun previews BOUNDARY/WHOLE/BOUNDARY, writes nothing; apply writes them', async () => {
    await seedGolden(db)
    await as('Cindy')
    const id = await assignmentOf(UAT)
    const before = await auditCount()
    const dry = ok(await plan(id, 1000, '2026-11-11', '2026-11-24', { dryRun: true, baseVersion: null }))
    expect(dry.applied).toBeNull()
    expect(dry.preview).toMatchObject({ version: 1, totalCd: 1000, capacityCd: 1000, overCapacityCd: 0, warnings: [] })
    expect(dry.preview.weeks).toEqual([
      {
        week: '2026-11-09',
        kind: 'BOUNDARY',
        before: { cd: 0, resolution: null },
        after: { cd: 300, resolution: 'DAY', days: { '2026-11-11': 100, '2026-11-12': 100, '2026-11-13': 100 } },
        capacityCd: 300,
      },
      {
        week: '2026-11-16',
        kind: 'WHOLE',
        before: { cd: 0, resolution: null },
        after: { cd: 500, resolution: 'WEEK' },
        capacityCd: 500,
      },
      {
        week: '2026-11-23',
        kind: 'BOUNDARY',
        before: { cd: 0, resolution: null },
        after: { cd: 200, resolution: 'DAY', days: { '2026-11-23': 100, '2026-11-24': 100 } },
        capacityCd: 200,
      },
    ])
    expect(await allocationRows(id, '2026-11-16')).toEqual([])
    expect(await auditCount()).toBe(before)

    const applied = ok(await plan(id, 1000, '2026-11-11', '2026-11-24'))
    expect(applied.applied).toMatchObject({ taskAssignmentId: id, version: 2, rowTotal: { total: 1875, committed: 1875 } })
    expect(Object.keys(applied.applied!.weeks)).toEqual(['2026-11-09', '2026-11-16', '2026-11-23'])
    expect(await allocationRows(id, '2026-11-09')).toEqual(
      ['2026-11-11', '2026-11-12', '2026-11-13'].map((d) => ({ granularity: 'DAY', periodStart: d, cd: 100 })),
    )
    expect(await allocationRows(id, '2026-11-16')).toEqual([{ granularity: 'WEEK', periodStart: '2026-11-16', cd: 500 }])
    expect(await allocationRows(id, '2026-11-23')).toEqual(
      ['2026-11-23', '2026-11-24'].map((d) => ({ granularity: 'DAY', periodStart: d, cd: 100 })),
    )
    expect(await assignmentVersion(id)).toBe(2)
    const audits = await auditRowsAfter(before)
    expect(audits).toHaveLength(1)
    expect(audits[0]).toMatchObject({
      entity: 'allocation',
      entityId: id,
      action: 'update',
      projectId: await goldenProjectId('POS Upgrade'),
    })
    expect(audits[0]!.summary).toContain('Ivy')
  })

  it('UNREPRESENTABLE (r8 G3): 400 over 11-11..11-13 → VALIDATION issue on week 2026-11-09; nothing written', async () => {
    await seedGolden(db)
    await as('Cindy')
    const id = await assignmentOf(UAT)
    const r = await plan(id, 400, '2026-11-11', '2026-11-13')
    expect(r).toMatchObject({
      ok: false,
      code: 'VALIDATION',
      message: th.plan.errors.unrepresentable,
      issues: [{ taskAssignmentId: id, period: '2026-11-09', reason: 'UNREPRESENTABLE' }],
    })
    expect(await assignmentVersion(id)).toBe(1)
  })

  it('replace within range only: 100 over 09-30..10-02 on WEEK 09-28 = 250 → DAY [50,50,34,33,33]; 10-05 untouched', async () => {
    await seedGolden(db)
    await as('Ivy')
    const id = await assignmentOf(UAT)
    ok(await plan(id, 100, '2026-09-30', '2026-10-02'))
    expect((await allocationRows(id, '2026-09-28')).map((r) => [r.periodStart, r.cd])).toEqual([
      ['2026-09-28', 50],
      ['2026-09-29', 50],
      ['2026-09-30', 34],
      ['2026-10-01', 33],
      ['2026-10-02', 33],
    ])
    expect(await allocationRows(id, '2026-10-05')).toEqual([{ granularity: 'WEEK', periodStart: '2026-10-05', cd: 125 }])
  })

  it('N = 0 clears: the whole week goes; in-range boundary days become 0, out-of-range days stay', async () => {
    await seedGolden(db)
    await as('Ivy')
    const id = await assignmentOf(UAT)
    const r = ok(await plan(id, 0, '2026-09-30', '2026-10-09'))
    expect(r.preview.weeks.map((w) => [w.week, w.kind, w.after])).toEqual([
      ['2026-09-28', 'BOUNDARY', { cd: 100, resolution: 'DAY', days: { '2026-09-28': 50, '2026-09-29': 50 } }],
      ['2026-10-05', 'WHOLE', { cd: 0, resolution: null }],
    ])
    expect(await allocationRows(id, '2026-10-05')).toEqual([])
    expect((await allocationRows(id, '2026-09-28')).map((x) => x.cd)).toEqual([50, 50])
  })

  it('F3 fallback (Peter on leave 10-05..10-06): in-range days by schedule, NON_WORKING warnings on both dates', async () => {
    await seedGolden(db)
    await applyFixture(db, 'F3')
    await as('Peter')
    const id = await assignmentOf('ย้าย pipeline ขึ้น BigQuery')
    const r = ok(await plan(id, 200, '2026-10-05', '2026-10-06', { dryRun: true, baseVersion: null }))
    const wk = r.preview.weeks[0]!
    expect(wk.kind).toBe('BOUNDARY')
    expect(wk.capacityCd).toBe(0)
    expect(wk.after.days?.['2026-10-05']).toBe(100)
    expect(wk.after.days?.['2026-10-06']).toBe(100)
    expect(wk.after.cd).toBe(700) // 200 in range + the out-of-range 500 (sum preserved, M6-D6)
    const nonWorking = r.preview.warnings.filter((x) => x.code === 'WORK_ON_NON_WORKING_DAY').map((x) => x.date)
    expect(nonWorking).toEqual(expect.arrayContaining(['2026-10-05', '2026-10-06']))
    expect(r.preview.overCapacityCd).toBe(200)
  })

  it('stale: apply with baseVersion 1 after a grid save → VERSION_CONFLICT with the range weeks', async () => {
    await seedGolden(db)
    await as('Ivy')
    const id = await assignmentOf(UAT)
    const saved = await saveAllocations({
      items: [{ taskAssignmentId: id, baseVersion: 1, changes: [{ granularity: 'WEEK', period: '2026-11-16', cd: 100 }] }],
      clientOpId: 'g',
    })
    expect(saved.ok).toBe(true)
    const r = await plan(id, 500, '2026-11-16', '2026-11-20')
    expect(r).toMatchObject({ ok: false, code: 'VERSION_CONFLICT' })
    expect((r as unknown as { current: unknown }).current).toEqual([
      expect.objectContaining({ taskAssignmentId: id, version: 2, weeks: { '2026-11-16': { cd: 100, resolution: 'WEEK' } } }),
    ])
  })

  it('AC-604 (X14): Jack 3 days + Mint 2 days on one Mobile task → two WEEK rows, task total 500, loads per person', async () => {
    await seedGolden(db)
    const mobileId = await goldenProjectId('Mobile App Revamp')
    const [jack, mint, manager] = await Promise.all([goldenUser('Jack'), goldenUser('Mint'), goldenUser('Manager')])
    const t = await makeTask({ project: { id: mobileId }, name: 'งาน AC604', createdBy: manager })
    const aj = await makeAssignment({ task: t, user: jack })
    const am = await makeAssignment({ task: t, user: mix })
    asUser(jack)
    ok(await plan(aj.id, 300, '2026-11-16', '2026-11-20'))
    ok(await plan(am.id, 200, '2026-11-16', '2026-11-20'))
    expect(await allocationRows(aj.id, '2026-11-16')).toEqual([{ granularity: 'WEEK', periodStart: '2026-11-16', cd: 300 }])
    expect(await allocationRows(am.id, '2026-11-16')).toEqual([{ granularity: 'WEEK', periodStart: '2026-11-16', cd: 200 }])
    const g = await buildChunk(
      db,
      toSessionUser(jack),
      { kind: 'project', id: mobileId },
      { from: '2026-11-16', to: '2026-11-23', expand: [], zoom: 'week', includeOthers: false },
      TODAY,
    )
    const taskRow = g.rows.find((r) => r.kind === 'task' && r.id === t.id)
    expect(taskRow).toMatchObject({ assigneeCount: 2, totals: { 'W:2026-11-16': { total: 500, committed: 500 } } })
    const cells = g.rows.flatMap((r) => (r.kind === 'assignee' && r.taskId === t.id ? [[r.userId, r.cells['W:2026-11-16']?.cd]] : []))
    expect(cells).toEqual([
      [jack.id, 300],
      [mint.id, 200],
    ])
    const load = await repo.allocations.loadByUserWeek(db, {
      userIds: [jack.id, mint.id],
      range: { from: '2026-11-16', to: '2026-11-23' },
    })
    expect(load.get(jack.id)?.['2026-11-16']).toEqual({ total: 550, committed: 300 }) // + Store 250 (tentative)
    expect(load.get(mint.id)?.['2026-11-16']).toEqual({ total: 200, committed: 200 })
  })
})

describe('planAssignmentRange — world', () => {
  it('archived A: dryRun → FORBIDDEN; outsider → NOT_FOUND', async () => {
    const w = await createWorld({ with: ['allocations'] })
    asUser(w.member)
    expect(
      await plan(w.assignments.aTaskMember.id, 100, '2026-10-12', '2026-10-13', { dryRun: true, baseVersion: null }),
    ).toMatchObject({ ok: false, code: 'FORBIDDEN' })
    asUser(w.outsider)
    expect(
      await plan(w.assignments.pLeafLead.id, 100, '2026-10-12', '2026-10-13', { dryRun: true, baseVersion: null }),
    ).toMatchObject({ ok: false, code: 'NOT_FOUND' })
  })
})
