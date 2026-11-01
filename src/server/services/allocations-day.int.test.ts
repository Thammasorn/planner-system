// M7 S2.4–S2.7 — saveAllocations per-(item, week) table at day level: BR-22 split (AC-804), clamp-and-spill (M7-D7,
// golden F2/F3/F4), DAY edits on DAY weeks, BR-23 via COLLAPSE (M7-D2), M7-D5 no-ops, BR-24 NEEDS_CHOICE / SCALE /
// COLLAPSE (M7-D3), validation precedence, audit conversions (FR-1201) and warnings. Golden F1 unless noted.
import { and, eq, inArray, ne } from 'drizzle-orm'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ISODate } from '@/domain/types'
import { th } from '@/i18n/th'
import type { ActionResult } from '@/lib/action-result'
import type { AllocationChange, SaveAllocationsInput, SaveAllocationsOk } from '@/lib/contracts/grid'
import { applyFixture, seedGolden } from '../../../scripts/lib/fixtures'
import { goldenProjectId, goldenUser, type GoldenViewer } from '../../../tests/authz/_support/golden'
import { asUser } from '../../../tests/helpers/as-user'
import { auditCount, auditRowsAfter } from '../../../tests/helpers/audit'
import { allocationRows, assignmentVersion, makeAllocation } from '../../../tests/helpers/factories'
import { saveAllocations } from '../actions/allocations'
import { db } from '../db/client'
import { taskAssignments, tasks, workSchedules } from '../db/schema'
import * as repo from '../repo'

beforeEach(() => {
  vi.stubEnv('ALLOW_TEST_HOOKS', '1')
  vi.stubEnv('APP_NOW', '2026-09-30T10:00:00+07:00')
})

const UAT = 'ทำ UAT + คู่มือหน้าร้าน'
const POS_CINDY = 'ปรับปรุงระบบ POS หน้าร้าน'

async function assignmentOf(taskName: string): Promise<string> {
  const [a] = await db
    .select({ id: taskAssignments.id })
    .from(taskAssignments)
    .innerJoin(tasks, eq(tasks.id, taskAssignments.taskId))
    .where(eq(tasks.name, taskName))
  if (!a) throw new Error(`assignment of ${taskName} not found`)
  return a.id
}

async function as(nick: GoldenViewer) {
  return asUser(await goldenUser(nick))
}

const day = (period: ISODate, cd: number | null): AllocationChange => ({ granularity: 'DAY', period, cd })
const wk = (period: ISODate, cd: number | null): AllocationChange => ({ granularity: 'WEEK', period, cd })
const item = (id: string, changes: AllocationChange[], baseVersion = 1) => ({ taskAssignmentId: id, baseVersion, changes })

function save(items: SaveAllocationsInput['items'], o: Partial<Omit<SaveAllocationsInput, 'items'>> = {}) {
  return saveAllocations({ items, clientOpId: o.clientOpId ?? 'op', ...(o.onDayWeekConflict ? { onDayWeekConflict: o.onDayWeekConflict } : {}) })
}

function ok(r: ActionResult<SaveAllocationsOk>): SaveAllocationsOk {
  if (!r.ok) throw new Error(`expected ok, got ${r.code}: ${r.message}`)
  return r
}

const D = (date: ISODate, cd: number) => ({ granularity: 'DAY', periodStart: date, cd })

async function projectTotal(name: Parameters<typeof goldenProjectId>[0]): Promise<number> {
  const rows = await repo.allocations.listForProject(db, await goldenProjectId(name), { from: '2026-08-31', to: '2027-01-04' })
  return rows.reduce((s, r) => s + r.cd, 0)
}

const AC804_ROWS = [D('2026-09-28', 50), D('2026-09-29', 50), D('2026-09-30', 100), D('2026-10-01', 50), D('2026-10-02', 50)]

/** Golden F1 + AC-804 applied as Ivy: POS UAT 09-28 = DAY 300 (version 2). */
async function afterAc804(): Promise<string> {
  await seedGolden(db)
  await as('Ivy')
  const id = await assignmentOf(UAT)
  ok(await save([item(id, [day('2026-09-30', 100)])]))
  return id
}

describe('saveAllocations — BR-22 split and day edits', () => {
  it('AC-804: Wed = 100 on the WEEK 250 week → five DAY rows, week 300, version +1, POS 4625 → 4675', async () => {
    await seedGolden(db)
    await as('Ivy')
    const id = await assignmentOf(UAT)
    expect(await projectTotal('POS Upgrade')).toBe(4625)
    const r = ok(await save([item(id, [day('2026-09-30', 100)])]))
    expect(await allocationRows(id, '2026-09-28')).toEqual(AC804_ROWS)
    expect(r.results[0]).toMatchObject({ taskAssignmentId: id, version: 2 })
    expect(r.results[0]!.weeks['2026-09-28']).toEqual({
      cd: 300,
      resolution: 'DAY',
      days: { '2026-09-28': 50, '2026-09-29': 50, '2026-09-30': 100, '2026-10-01': 50, '2026-10-02': 50 },
    })
    expect(r.warnings).toEqual([])
    expect(await assignmentVersion(id)).toBe(2)
    expect(await projectTotal('POS Upgrade')).toBe(4675)
  })

  it('M7-D8: a day edit equal to the derived value still materialises the week', async () => {
    await seedGolden(db)
    await as('Ivy')
    const id = await assignmentOf(UAT)
    ok(await save([item(id, [day('2026-09-30', 50)])]))
    const rows = await allocationRows(id, '2026-09-28')
    expect(rows.map((r) => [r.granularity, r.cd])).toEqual([
      ['DAY', 50],
      ['DAY', 50],
      ['DAY', 50],
      ['DAY', 50],
      ['DAY', 50],
    ])
  })

  it('spill F2 (Jack Mobile 10-19, holiday Fri): Mon = 100 → 100×4 + Fri 75, SPILLED + WORK_ON_NON_WORKING_DAY, 475', async () => {
    await seedGolden(db)
    await applyFixture(db, 'F2')
    await as('Jack')
    const id = await assignmentOf('ออกแบบ flow ใหม่')
    const r = ok(await save([item(id, [day('2026-10-19', 100)])]))
    expect(await allocationRows(id, '2026-10-19')).toEqual([
      D('2026-10-19', 100),
      D('2026-10-20', 100),
      D('2026-10-21', 100),
      D('2026-10-22', 100),
      D('2026-10-23', 75),
    ])
    expect(r.results[0]!.weeks['2026-10-19']!.cd).toBe(475)
    expect(r.warnings).toEqual([
      { code: 'SPILLED_OVER_DAY_LIMIT', taskAssignmentId: id, week: '2026-10-19' },
      { code: 'WORK_ON_NON_WORKING_DAY', taskAssignmentId: id, week: '2026-10-19', date: '2026-10-23' },
    ])
  })

  it('spill F3 (Peter DW 10-05, leave Mon–Tue): Wed = 50 → 100/33/50/100/100 = 383, ALLOCATED_ON_TIME_OFF Mon + Tue', async () => {
    await seedGolden(db)
    await applyFixture(db, 'F3')
    await as('Peter')
    const id = await assignmentOf('ย้าย pipeline ขึ้น BigQuery')
    const r = ok(await save([item(id, [day('2026-10-07', 50)])]))
    expect(await allocationRows(id, '2026-10-05')).toEqual([
      D('2026-10-05', 100),
      D('2026-10-06', 33),
      D('2026-10-07', 50),
      D('2026-10-08', 100),
      D('2026-10-09', 100),
    ])
    expect(r.results[0]!.weeks['2026-10-05']!.cd).toBe(383)
    const w = (code: string, date: ISODate) => ({ code, taskAssignmentId: id, week: '2026-10-05', date })
    expect(r.warnings).toEqual(
      expect.arrayContaining([
        w('ALLOCATED_ON_TIME_OFF', '2026-10-05'),
        w('ALLOCATED_ON_TIME_OFF', '2026-10-06'),
        { code: 'SPILLED_OVER_DAY_LIMIT', taskAssignmentId: id, week: '2026-10-05' },
      ]),
    )
  })

  it('spill F4 (Cindy CRM 10-12, leave Mon–Wed): Thu = 100 → 25/100/100 = 225', async () => {
    await seedGolden(db)
    await applyFixture(db, 'F4')
    await as('Cindy')
    const id = await assignmentOf('ย้ายข้อมูลลูกค้า')
    const r = ok(await save([item(id, [day('2026-10-15', 100)])]))
    expect(await allocationRows(id, '2026-10-12')).toEqual([D('2026-10-12', 25), D('2026-10-15', 100), D('2026-10-16', 100)])
    expect(r.results[0]!.weeks['2026-10-12']!.cd).toBe(225)
  })

  it('DAY edits on a DAY week: Thu = null → 4 rows (250); all five null → no rows, state { 0, null } (E8)', async () => {
    const id = await afterAc804()
    ok(await save([item(id, [day('2026-10-01', null)], 2)]))
    expect(await allocationRows(id, '2026-09-28')).toEqual(AC804_ROWS.filter((r) => r.periodStart !== '2026-10-01'))
    const r = ok(
      await save([
        item(
          id,
          ['2026-09-28', '2026-09-29', '2026-09-30', '2026-10-01', '2026-10-02'].map((d) => day(d, null)),
          3,
        ),
      ]),
    )
    expect(await allocationRows(id, '2026-09-28')).toEqual([])
    expect(r.results[0]!.weeks['2026-09-28']).toEqual({ cd: 0, resolution: null })
  })

  it('BR-23 via COLLAPSE (M7-D2): WEEK = Σ + COLLAPSE → one WEEK row 300; the 7-day snapshot replay restores the DAY rows', async () => {
    const id = await afterAc804()
    ok(await save([item(id, [wk('2026-09-28', 300)], 2)], { onDayWeekConflict: 'COLLAPSE' }))
    expect(await allocationRows(id, '2026-09-28')).toEqual([{ granularity: 'WEEK', periodStart: '2026-09-28', cd: 300 }])
    const snapshot = [50, 50, 100, 50, 50, null, null]
    const dates: ISODate[] = ['2026-09-28', '2026-09-29', '2026-09-30', '2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04']
    ok(await save([item(id, dates.map((d, i) => day(d, snapshot[i]!)), 3)]))
    expect(await allocationRows(id, '2026-09-28')).toEqual(AC804_ROWS)
  })

  it('M7-D5: WEEK null on a DAY week clears without a choice; WEEK = Σ without a choice → nothing written, no audit', async () => {
    const id = await afterAc804()
    const before = await auditCount()
    const same = ok(await save([item(id, [wk('2026-09-28', 300)], 2)]))
    expect(same.results[0]!.version).toBe(2)
    expect(await allocationRows(id, '2026-09-28')).toEqual(AC804_ROWS)
    expect(await auditCount()).toBe(before)
    ok(await save([item(id, [wk('2026-09-28', null)], 2)]))
    expect(await allocationRows(id, '2026-09-28')).toEqual([])
    expect(await assignmentVersion(id)).toBe(3)
  })

  it('mixed batch: DAY change on a WEEK week + WEEK change on a WEEK week → both applied, two audit rows, both +1', async () => {
    await seedGolden(db)
    await as('Ivy')
    const ivy = await assignmentOf(UAT)
    const cindy = await assignmentOf(POS_CINDY)
    const before = await auditCount()
    const r = ok(await save([item(ivy, [day('2026-09-30', 100)]), item(cindy, [wk('2026-10-05', 100)])]))
    expect(r.results.map((x) => x.version)).toEqual([2, 2])
    expect(await allocationRows(ivy, '2026-09-28')).toEqual(AC804_ROWS)
    expect(await allocationRows(cindy, '2026-10-05')).toEqual([{ granularity: 'WEEK', periodStart: '2026-10-05', cd: 100 }])
    expect((await auditRowsAfter(before)).map((a) => a.entityId).sort()).toEqual([ivy, cindy].sort())
  })

  it('week isolation: a 09-28 save leaves the 10-05 row of the same assignment untouched', async () => {
    const id = await afterAc804()
    expect(await allocationRows(id, '2026-10-05')).toEqual([{ granularity: 'WEEK', periodStart: '2026-10-05', cd: 125 }])
  })

  it('audit (FR-1201, X44): AC-804 → one row with conversions WEEK → DAY via SPLIT; before/after week states', async () => {
    await seedGolden(db)
    await as('Ivy')
    const id = await assignmentOf(UAT)
    const before = await auditCount()
    ok(await save([item(id, [day('2026-09-30', 100)])], { clientOpId: 'ac804' }))
    const rows = await auditRowsAfter(before)
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      entity: 'allocation',
      entityId: id,
      projectId: await goldenProjectId('POS Upgrade'),
      before: { weeks: { '2026-09-28': { cd: 250, resolution: 'WEEK' } } },
      after: {
        weeks: { '2026-09-28': { cd: 300, resolution: 'DAY' } },
        conversions: [{ week: '2026-09-28', from: 'WEEK', to: 'DAY', via: 'SPLIT' }],
        clientOpId: 'ac804',
      },
    })
    expect(rows[0]!.summary).toBe(th.audit.allocationsSaved('Ivy', UAT, 1))
  })
})

describe('BR-24 — NEEDS_CHOICE / SCALE / COLLAPSE (§7.4, M7-D3/D4/D6/D7)', () => {
  /** AC-804 (09-28 DAY 300) + 10-05 Mon = 50 on the WEEK 125 week → [50,25,25,25,25] = 150; version 3. */
  async function setup(): Promise<string> {
    const id = await afterAc804()
    ok(await save([item(id, [day('2026-10-05', 50)], 2)]))
    expect(await allocationRows(id, '2026-10-05')).toEqual([
      D('2026-10-05', 50),
      D('2026-10-06', 25),
      D('2026-10-07', 25),
      D('2026-10-08', 25),
      D('2026-10-09', 25),
    ])
    return id
  }

  it('WEEK 200 without a choice → NEEDS_CHOICE { week, weeks, pairs }; rows, version and audit unchanged', async () => {
    const id = await setup()
    const before = await auditCount()
    const r = await save([item(id, [wk('2026-09-28', 200)], 3)])
    expect(r).toEqual({
      ok: false,
      code: 'NEEDS_CHOICE',
      message: th.errors.NEEDS_CHOICE,
      week: '2026-09-28',
      weeks: ['2026-09-28'],
      pairs: [{ taskAssignmentId: id, week: '2026-09-28' }],
    })
    expect(await allocationRows(id, '2026-09-28')).toEqual(AC804_ROWS)
    expect(await assignmentVersion(id)).toBe(3)
    expect(await auditCount()).toBe(before)
  })

  it('two weeks in one item → one error listing both weeks, nothing written', async () => {
    const id = await setup()
    const r = await save([item(id, [wk('2026-09-28', 200), wk('2026-10-05', 300)], 3)])
    expect(r).toMatchObject({
      ok: false,
      code: 'NEEDS_CHOICE',
      week: '2026-09-28',
      weeks: ['2026-09-28', '2026-10-05'],
      pairs: [
        { taskAssignmentId: id, week: '2026-09-28' },
        { taskAssignmentId: id, week: '2026-10-05' },
      ],
    })
    expect(await assignmentVersion(id)).toBe(3)
  })

  it('one item needs a choice, another is a plain WEEK edit → the whole batch is rejected', async () => {
    const id = await setup()
    const cindy = await assignmentOf(POS_CINDY)
    const r = await save([item(id, [wk('2026-09-28', 200)], 3), item(cindy, [wk('2026-10-05', 100)])])
    expect(r).toMatchObject({ ok: false, code: 'NEEDS_CHOICE', pairs: [{ taskAssignmentId: id, week: '2026-09-28' }] })
    expect(await assignmentVersion(cindy)).toBe(1)
    expect(await allocationRows(cindy, '2026-10-05')).toEqual([])
  })

  it.each([
    [200, [34, 33, 67, 33, 33, 0, 0], []],
    [400, [100, 67, 100, 67, 66, 0, 0], ['SPILLED_OVER_DAY_LIMIT']],
    [700, [100, 100, 100, 100, 100, 100, 100], ['SPILLED_OVER_DAY_LIMIT', 'WORK_ON_NON_WORKING_DAY', 'WORK_ON_NON_WORKING_DAY']],
  ] as const)('SCALE 09-28 → %i (r8 §6.8)', async (total, days, codes) => {
    const id = await setup()
    const before = await auditCount()
    const r = ok(await save([item(id, [wk('2026-09-28', total)], 3)], { onDayWeekConflict: 'SCALE' }))
    const dates: ISODate[] = ['2026-09-28', '2026-09-29', '2026-09-30', '2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04']
    expect(await allocationRows(id, '2026-09-28')).toEqual(dates.flatMap((d, i) => (days[i]! > 0 ? [D(d, days[i]!)] : [])))
    expect(r.warnings.map((w) => w.code)).toEqual(codes)
    if (total === 700) expect(r.warnings.slice(1).map((w) => w.date)).toEqual(['2026-10-03', '2026-10-04'])
    const audits = await auditRowsAfter(before)
    expect(audits[0]!.after).toMatchObject({ conversions: [{ week: '2026-09-28', from: 'DAY', to: 'DAY', via: 'SCALE' }] })
  })

  it('COLLAPSE 09-28 → 400 → one WEEK row 400 (conversion COLLAPSE); SCALE on a WEEK week → plain write (P8)', async () => {
    const id = await setup()
    const before = await auditCount()
    ok(await save([item(id, [wk('2026-09-28', 400)], 3)], { onDayWeekConflict: 'COLLAPSE' }))
    expect(await allocationRows(id, '2026-09-28')).toEqual([{ granularity: 'WEEK', periodStart: '2026-09-28', cd: 400 }])
    expect((await auditRowsAfter(before))[0]!.after).toMatchObject({
      conversions: [{ week: '2026-09-28', from: 'DAY', to: 'WEEK', via: 'COLLAPSE' }],
    })
    ok(await save([item(id, [wk('2026-09-28', 450)], 4)], { onDayWeekConflict: 'SCALE' }))
    expect(await allocationRows(id, '2026-09-28')).toEqual([{ granularity: 'WEEK', periodStart: '2026-09-28', cd: 450 }])
  })

  it('VALIDATION (nothing written): MIXED_WEEK_AND_DAY; UNREPRESENTABLE; stale baseVersion + choice → VERSION_CONFLICT', async () => {
    const id = await setup()
    const mixed = await save([item(id, [wk('2026-09-28', 200), day('2026-09-29', 50)], 3)])
    expect(mixed).toMatchObject({
      ok: false,
      code: 'VALIDATION',
      message: th.grid.errors.invalidBatch,
      issues: [{ taskAssignmentId: id, period: '2026-09-28', reason: 'MIXED_WEEK_AND_DAY' }],
    })
    // capacity and schedule Mon only, WEEK 700, DAY Tue = 0 → nothing can absorb the spill
    const ivy = (await goldenUser('Ivy')).id
    await db.delete(workSchedules).where(and(eq(workSchedules.userId, ivy), ne(workSchedules.weekday, 1)))
    await makeAllocation({ assignment: { id }, period: '2026-10-26', cd: 700 })
    const unrep = await save([item(id, [day('2026-10-27', 0)], 3)])
    expect(unrep).toMatchObject({
      ok: false,
      code: 'VALIDATION',
      issues: [{ taskAssignmentId: id, period: '2026-10-26', reason: 'UNREPRESENTABLE' }],
    })
    expect(await allocationRows(id, '2026-10-26')).toEqual([{ granularity: 'WEEK', periodStart: '2026-10-26', cd: 700 }])
    // precedence: VERSION_CONFLICT before NEEDS_CHOICE
    const stale = await save([item(id, [wk('2026-09-28', 200)], 1)])
    expect(stale).toMatchObject({ ok: false, code: 'VERSION_CONFLICT' })
    expect(await assignmentVersion(id)).toBe(3)
    const rows = await db
      .select({ id: workSchedules.userId })
      .from(workSchedules)
      .where(inArray(workSchedules.userId, [ivy]))
    expect(rows).toHaveLength(1)
  })
})
