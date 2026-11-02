// M6 S2.3–S2.4 — saveAllocations (BR-20b, BR-26, X27, X65, M6-D3/D4/D29/D34). Golden F1 + world.
import { randomUUID } from 'node:crypto'
import { eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ISODate } from '@/domain/types'
import { th } from '@/i18n/th'
import type { ActionResult } from '@/lib/action-result'
import type { SaveAllocationsInput, SaveAllocationsOk } from '@/lib/contracts/grid'
import { seedGolden } from '../../../scripts/lib/fixtures'
import { goldenProjectId, goldenUser, type GoldenViewer } from '../../../tests/authz/_support/golden'
import { asUser, toSessionUser } from '../../../tests/helpers/as-user'
import { auditCount, auditRowsAfter } from '../../../tests/helpers/audit'
import { allocationRows, assignmentVersion, makeAllocation, makeAssignment, makeTask } from '../../../tests/helpers/factories'
import { createWorld } from '../../../tests/helpers/world'
import { saveAllocations } from '../actions/allocations'
import { db } from '../db/client'
import { auditLog, taskAssignments, tasks } from '../db/schema'
import { deactivateEmployee } from './employees'
import { save } from './allocations'

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

async function as(nick: GoldenViewer) {
  return asUser(await goldenUser(nick))
}

const week = (id: string, period: ISODate, cd: number | null, baseVersion = 1) => ({
  taskAssignmentId: id,
  baseVersion,
  changes: [{ granularity: 'WEEK' as const, period, cd }],
})

function ok(r: ActionResult<SaveAllocationsOk>): SaveAllocationsOk {
  if (!r.ok) throw new Error(`expected ok, got ${r.code}: ${r.message}`)
  return r
}

describe('saveAllocations — golden F1', () => {
  it('single edit: CRM Cindy W 2026-10-05 = 300 → one row, version 2, rowTotal { 1550, 0 }, one audit row', async () => {
    await seedGolden(db)
    await as('Cindy')
    const id = await assignmentOf('ย้ายข้อมูลลูกค้า')
    const before = await auditCount()
    const r = ok(await saveAllocations({ items: [week(id, '2026-10-05', 300)], clientOpId: 'op-single' }))
    expect(r.results).toEqual([
      {
        taskAssignmentId: id,
        version: 2,
        weeks: { '2026-10-05': { cd: 300, resolution: 'WEEK' } },
        rowTotal: { total: 1550, committed: 0 },
      },
    ])
    expect(r.warnings).toEqual([])
    expect(await allocationRows(id, '2026-10-05')).toEqual([{ granularity: 'WEEK', periodStart: '2026-10-05', cd: 300 }])
    const rows = await auditRowsAfter(before)
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      entity: 'allocation',
      entityId: id,
      action: 'update',
      projectId: await goldenProjectId('CRM Migration'),
      before: { weeks: { '2026-10-05': { cd: 250, resolution: 'WEEK' } } },
      after: { weeks: { '2026-10-05': { cd: 300, resolution: 'WEEK' } }, clientOpId: 'op-single' },
    })
    expect(rows[0]!.summary).toBe(th.audit.allocationsSaved('Cindy', 'ย้ายข้อมูลลูกค้า', 1))
  })

  it('AC-801 batch: Cindy CRM 10-05…11-09 = 300 in one item → 6 rows, version 2, one audit row, rowTotal 1800', async () => {
    await seedGolden(db)
    await as('Cindy')
    const id = await assignmentOf('ย้ายข้อมูลลูกค้า')
    const weeks = ['2026-10-05', '2026-10-12', '2026-10-19', '2026-10-26', '2026-11-02', '2026-11-09']
    const before = await auditCount()
    const r = ok(
      await saveAllocations({
        items: [{ taskAssignmentId: id, baseVersion: 1, changes: weeks.map((period) => ({ granularity: 'WEEK', period, cd: 300 })) }],
        clientOpId: 'op-ac801',
      }),
    )
    for (const w of weeks) expect(await allocationRows(id, w)).toEqual([{ granularity: 'WEEK', periodStart: w, cd: 300 }])
    expect(r.results[0]!.version).toBe(2)
    expect(Object.keys(r.results[0]!.weeks)).toEqual(weeks)
    expect(r.results[0]!.rowTotal).toEqual({ total: 1800, committed: 0 })
    expect(await auditRowsAfter(before)).toHaveLength(1)
  })

  it('clear: null and 0 delete; clearing an absent week is a no-op (no version bump, no audit)', async () => {
    await seedGolden(db)
    await as('Cindy')
    const id = await assignmentOf('ย้ายข้อมูลลูกค้า')
    ok(await saveAllocations({ items: [week(id, '2026-10-05', null)], clientOpId: 'c1' }))
    expect(await allocationRows(id, '2026-10-05')).toEqual([])
    ok(await saveAllocations({ items: [week(id, '2026-10-12', 0, 2)], clientOpId: 'c2' }))
    expect(await allocationRows(id, '2026-10-12')).toEqual([])
    expect(await assignmentVersion(id)).toBe(3)
    const before = await auditCount()
    const r = ok(await saveAllocations({ items: [week(id, '2026-12-07', null, 3)], clientOpId: 'c3' }))
    expect(r.results[0]).toMatchObject({ version: 3, weeks: { '2026-12-07': { cd: 0, resolution: null } } })
    expect(await assignmentVersion(id)).toBe(3)
    expect(await auditCount()).toBe(before)
  })

  it('multi-assignment (AC-803 shape): Cindy + Ivy POS × 4 weeks → 8 rows, 2 audit rows, both versions + 1', async () => {
    await seedGolden(db)
    await as('Cindy')
    const cindy = await assignmentOf('ปรับปรุงระบบ POS หน้าร้าน')
    const ivy = await assignmentOf('ทำ UAT + คู่มือหน้าร้าน')
    const weeks = ['2026-11-09', '2026-11-16', '2026-11-23', '2026-11-30']
    const item = (id: string, values: number[]) => ({
      taskAssignmentId: id,
      baseVersion: 1,
      changes: weeks.map((period, i) => ({ granularity: 'WEEK' as const, period, cd: values[i]! })),
    })
    const before = await auditCount()
    const r = ok(
      await saveAllocations({
        items: [item(cindy, [250, 500, 375, 125]), item(ivy, [500, 250, 125, 375])],
        clientOpId: 'op-ac803',
      }),
    )
    expect(r.results.map((x) => [x.taskAssignmentId, x.version])).toEqual([
      [cindy, 2],
      [ivy, 2],
    ])
    expect(await allocationRows(cindy, '2026-11-23')).toEqual([{ granularity: 'WEEK', periodStart: '2026-11-23', cd: 375 }])
    expect(await allocationRows(ivy, '2026-11-30')).toEqual([{ granularity: 'WEEK', periodStart: '2026-11-30', cd: 375 }])
    const audits = await auditRowsAfter(before)
    expect(audits.map((a) => a.entityId).sort()).toEqual([cindy, ivy].sort())
  })

  it('version: the second save with baseVersion 1 → VERSION_CONFLICT with current { version 2, stored week }; nothing written', async () => {
    await seedGolden(db)
    await as('Cindy')
    const id = await assignmentOf('ย้ายข้อมูลลูกค้า')
    ok(await saveAllocations({ items: [week(id, '2026-10-05', 300)], clientOpId: 'v1' }))
    const before = await auditCount()
    const r = await saveAllocations({ items: [week(id, '2026-10-05', 400)], clientOpId: 'v2' })
    expect(r).toMatchObject({ ok: false, code: 'VERSION_CONFLICT', message: th.grid.toast.conflict })
    expect((r as unknown as { current: unknown }).current).toEqual([
      {
        taskAssignmentId: id,
        version: 2,
        weeks: { '2026-10-05': { cd: 300, resolution: 'WEEK' } },
        rowTotal: { total: 1550, committed: 0 },
      },
    ])
    expect(await allocationRows(id, '2026-10-05')).toEqual([{ granularity: 'WEEK', periodStart: '2026-10-05', cd: 300 }])
    expect(await auditCount()).toBe(before)
  })

  it('BR-26: a DAY change of 125 is refused by zod (400) before anything else', async () => {
    await seedGolden(db)
    await as('Cindy')
    const id = await assignmentOf('ย้ายข้อมูลลูกค้า')
    const r = await saveAllocations({
      items: [{ taskAssignmentId: id, baseVersion: 1, changes: [{ granularity: 'DAY', period: '2026-10-06', cd: 125 }] }],
      clientOpId: 'br26',
    })
    expect(r).toMatchObject({ ok: false, code: 'VALIDATION' })
    expect(await assignmentVersion(id)).toBe(1)
  })
})

describe('saveAllocations — world', () => {
  it('all-or-nothing: P item + Q item as lead → NOT_FOUND, P unchanged, no audit; as manager both succeed (2 audit rows)', async () => {
    const w = await createWorld({ with: ['allocations'] })
    const input: SaveAllocationsInput = {
      items: [week(w.assignments.pLeafLead.id, '2026-11-16', 200), week(w.assignments.qTaskOutsider.id, '2026-11-16', 100)],
      clientOpId: 'aon',
    }
    const before = await auditCount()
    asUser(w.lead)
    expect(await saveAllocations(input)).toMatchObject({ ok: false, code: 'NOT_FOUND' })
    expect(await allocationRows(w.assignments.pLeafLead.id, '2026-11-16')).toEqual([])
    expect(await assignmentVersion(w.assignments.pLeafLead.id)).toBe(1)
    expect(await auditCount()).toBe(before)
    asUser(w.manager)
    ok(await saveAllocations(input))
    const audits = await auditRowsAfter(before)
    expect(audits.map((a) => a.projectId).sort()).toEqual([w.P.id, w.Q.id].sort())
  })

  it('X27 / M6-D34 → M7 BR-24: WEEK ≠ Σ on a DAY week → NEEDS_CHOICE; SCALE scales; COLLAPSE converts; null clears', async () => {
    const w = await createWorld({ with: ['allocations'] })
    asUser(w.member)
    const id = w.assignments.pChildAMember.id
    const dayRows = [
      { granularity: 'DAY', periodStart: '2026-10-12', cd: 50 },
      { granularity: 'DAY', periodStart: '2026-10-13', cd: 50 },
    ]
    const before = await auditCount()
    // was the M6-only VALIDATION reason (M6-D34): now NEEDS_CHOICE (M7-D3), nothing written
    const r = await saveAllocations({ items: [week(id, '2026-10-12', 150)], clientOpId: 'dw' })
    expect(r).toMatchObject({
      ok: false,
      code: 'NEEDS_CHOICE',
      message: th.errors.NEEDS_CHOICE,
      week: '2026-10-12',
      weeks: ['2026-10-12'],
      pairs: [{ taskAssignmentId: id, week: '2026-10-12' }],
    })
    expect(await allocationRows(id, '2026-10-12')).toEqual(dayRows)
    expect(await assignmentVersion(id)).toBe(1)
    expect(await auditCount()).toBe(before)
    // Σ (100) without a choice → no-op
    const same = ok(await saveAllocations({ items: [week(id, '2026-10-12', 100)], clientOpId: 'sum' }))
    expect(same.results[0]).toMatchObject({ version: 1, weeks: { '2026-10-12': { cd: 100, resolution: 'DAY' } } })
    expect(same.results[0]!.weeks['2026-10-12']!.days).toEqual({ '2026-10-12': 50, '2026-10-13': 50 })
    // Σ with COLLAPSE (BR-23, M7-D2) → one WEEK row 100
    ok(await saveAllocations({ items: [week(id, '2026-10-12', 100)], onDayWeekConflict: 'COLLAPSE', clientOpId: 'col0' }))
    expect(await allocationRows(id, '2026-10-12')).toEqual([{ granularity: 'WEEK', periodStart: '2026-10-12', cd: 100 }])
    // snapshot replay back to DAY: 7 DAY changes onto the WEEK
    const days = ['2026-10-12', '2026-10-13', '2026-10-14', '2026-10-15', '2026-10-16', '2026-10-17', '2026-10-18']
    ok(
      await saveAllocations({
        items: [
          {
            taskAssignmentId: id,
            baseVersion: 2,
            changes: days.map((period, i) => ({ granularity: 'DAY' as const, period, cd: i < 2 ? 50 : null })),
          },
        ],
        clientOpId: 'replay',
      }),
    )
    expect(await allocationRows(id, '2026-10-12')).toEqual(dayRows)
    // was VALIDATION with SCALE (M6): now BR-24 SCALE → DAY 75 / 75
    const scaled = ok(
      await saveAllocations({ items: [week(id, '2026-10-12', 150, 3)], onDayWeekConflict: 'SCALE', clientOpId: 'scale' }),
    )
    expect(scaled.results[0]!.version).toBe(4)
    expect(await allocationRows(id, '2026-10-12')).toEqual([
      { granularity: 'DAY', periodStart: '2026-10-12', cd: 75 },
      { granularity: 'DAY', periodStart: '2026-10-13', cd: 75 },
    ])
    // COLLAPSE with a different value → WEEK 200; null clears
    ok(await saveAllocations({ items: [week(id, '2026-10-12', 200, 4)], onDayWeekConflict: 'COLLAPSE', clientOpId: 'col' }))
    expect(await allocationRows(id, '2026-10-12')).toEqual([{ granularity: 'WEEK', periodStart: '2026-10-12', cd: 200 }])
    ok(await saveAllocations({ items: [week(id, '2026-10-12', null, 5)], clientOpId: 'clr' }))
    expect(await allocationRows(id, '2026-10-12')).toEqual([])
    // was refused in M6 (M6-D34): a partial DAY edit on a WEEK week now splits it (BR-22; 11-20 is the world holiday → cap 0)
    await makeAllocation({ assignment: { id }, period: '2026-11-16', cd: 250 })
    const partial = ok(
      await saveAllocations({
        items: [{ taskAssignmentId: id, baseVersion: 6, changes: [{ granularity: 'DAY', period: '2026-11-18', cd: 100 }] }],
        clientOpId: 'partial',
      }),
    )
    expect(partial.results[0]!.weeks['2026-11-16']).toEqual({
      cd: 288,
      resolution: 'DAY',
      days: { '2026-11-16': 63, '2026-11-17': 63, '2026-11-18': 100, '2026-11-19': 62 },
    })
  })

  it('DAY weeks: null DAY week accepts day edits; mixed WEEK + DAY in one week → VALIDATION MIXED_WEEK_AND_DAY', async () => {
    const w = await createWorld({ with: ['allocations'] })
    asUser(w.lead)
    const id = w.assignments.pLeafLead.id
    const r = ok(
      await saveAllocations({
        items: [{ taskAssignmentId: id, baseVersion: 1, changes: [{ granularity: 'DAY', period: '2026-11-18', cd: 75 }] }],
        clientOpId: 'd1',
      }),
    )
    expect(r.results[0]!.weeks['2026-11-16']).toEqual({ cd: 75, resolution: 'DAY', days: { '2026-11-18': 75 } })
    expect(await allocationRows(id, '2026-11-16')).toEqual([{ granularity: 'DAY', periodStart: '2026-11-18', cd: 75 }])
    const mixed = await saveAllocations({
      items: [
        {
          taskAssignmentId: id,
          baseVersion: 2,
          changes: [
            { granularity: 'WEEK', period: '2026-11-23', cd: 100 },
            { granularity: 'DAY', period: '2026-11-24', cd: 50 },
          ],
        },
      ],
      clientOpId: 'mixed',
    })
    expect(mixed).toMatchObject({
      ok: false,
      code: 'VALIDATION',
      message: th.grid.errors.invalidBatch,
      issues: [{ taskAssignmentId: id, period: '2026-11-23', reason: 'MIXED_WEEK_AND_DAY' }],
    })
  })

  it('warnings: WEEK 250 in a week without capacity (deactivated) → WEEK_NO_CAPACITY, still written', async () => {
    const w = await createWorld({ with: ['allocations'] })
    await db.transaction((tx) => deactivateEmployee(tx, w.manager, { userId: w.lead.id, today: TODAY }))
    asUser(w.manager)
    const id = w.assignments.pLeafLead.id
    const r = ok(await saveAllocations({ items: [week(id, '2026-11-16', 250)], clientOpId: 'warn' }))
    expect(r.warnings).toEqual([{ code: 'WEEK_NO_CAPACITY', taskAssignmentId: id, week: '2026-11-16' }])
    expect(await allocationRows(id, '2026-11-16')).toEqual([{ granularity: 'WEEK', periodStart: '2026-11-16', cd: 250 }])
  })

  it('archived A → FORBIDDEN; outsider on P → NOT_FOUND; unknown id → NOT_FOUND', async () => {
    const w = await createWorld({ with: ['allocations'] })
    asUser(w.member)
    expect(await saveAllocations({ items: [week(w.assignments.aTaskMember.id, '2026-10-12', 100)], clientOpId: 'a' })).toMatchObject({
      ok: false,
      code: 'FORBIDDEN',
    })
    asUser(w.outsider)
    expect(await saveAllocations({ items: [week(w.assignments.pLeafLead.id, '2026-10-12', 100)], clientOpId: 'o' })).toMatchObject({
      ok: false,
      code: 'NOT_FOUND',
    })
    expect(await saveAllocations({ items: [week(randomUUID(), '2026-10-12', 100)], clientOpId: 'x' })).toMatchObject({
      ok: false,
      code: 'NOT_FOUND',
    })
  })

  it('parent: an assignment on a task with live children → VALIDATION, nothing written', async () => {
    const w = await createWorld({ with: ['allocations'] })
    const parent = await makeTask({ project: w.P, name: 'parent-with-plan', createdBy: w.manager })
    await makeTask({ project: w.P, parent, name: 'child', createdBy: w.manager })
    const a = await makeAssignment({ task: parent, user: w.lead })
    asUser(w.lead)
    expect(await saveAllocations({ items: [week(a.id, '2026-10-12', 100)], clientOpId: 'p' })).toMatchObject({
      ok: false,
      code: 'VALIDATION',
      message: th.grid.toast.readOnlyRow,
    })
    expect(await allocationRows(a.id, '2026-10-12')).toEqual([])
  })

  it('services.allocations.save writes its own audit rows (X90) and leaves other weeks alone', async () => {
    const w = await createWorld({ with: ['allocations'] })
    const id = w.assignments.pLeafLead.id
    const r = await db.transaction((tx) =>
      save(tx, toSessionUser(w.lead), { items: [week(id, '2026-10-05', 125)], clientOpId: 'svc' }, TODAY),
    )
    expect(r.results[0]).toMatchObject({ version: 2, rowTotal: { total: 375, committed: 375 } })
    expect(await allocationRows(id, '2026-09-28')).toEqual([{ granularity: 'WEEK', periodStart: '2026-09-28', cd: 250 }])
    const [row] = await db.select().from(auditLog).where(eq(auditLog.entityId, id))
    expect(row).toMatchObject({ entity: 'allocation', actorId: w.lead.id, projectId: w.P.id })
  })
})

describe('saveAllocations — milestone lateness (M8-D12, BR-71)', () => {
  it('pChildB bound to p (10-23): WEEK 10-26 → late; cleared → not late; unbound / deleted-milestone tasks → null', async () => {
    const w = await createWorld({ with: ['milestones'] })
    asUser(w.lead)
    const a = await makeAssignment({ task: w.tasks.pChildB, user: w.lead })
    const late = ok(await saveAllocations({ items: [week(a.id, '2026-10-26', 100)], clientOpId: 'ms-late' }))
    expect(late.lateness).toEqual({
      tasks: [{ taskId: w.tasks.pChildB.id, lateForMilestone: true }],
      milestones: [{ id: w.milestones.p.id, late: true, lateTaskCount: 1 }],
    })
    const cleared = ok(await saveAllocations({ items: [week(a.id, '2026-10-26', null, 2)], clientOpId: 'ms-clear' }))
    expect(cleared.lateness).toEqual({
      tasks: [{ taskId: w.tasks.pChildB.id, lateForMilestone: false }],
      milestones: [{ id: w.milestones.p.id, late: false, lateTaskCount: 0 }],
    })
    const unbound = ok(
      await saveAllocations({ items: [week(w.assignments.pCoworker.id, '2026-11-02', 100)], clientOpId: 'ms-none' }),
    )
    expect(unbound.lateness).toBeNull()
    const underDeleted = ok(
      await saveAllocations({ items: [week(w.assignments.pChildAMember.id, '2026-11-02', 100)], clientOpId: 'ms-del' }),
    )
    expect(underDeleted.lateness).toBeNull()
  })
})
