// M5 S2.4 — leave entries (FR-903…906, FR-909, BR-42, M5-D3…D6, D16): create / update / delete / restore through the
// actions (authz → service → audit in one tx), overlap messages, 23P01 backstop, capacity impact, plan tables untouched.
import { randomUUID } from 'node:crypto'
import { and, count, eq, sql } from 'drizzle-orm'
import { describe, expect, it, vi } from 'vitest'
import { th } from '@/i18n/th'
import { formatLeaveRange } from '@/lib/format'
import { saveAllocations } from '@/server/actions/allocations'
import { createTimeOff, deleteTimeOff, restoreTimeOff, updateTimeOff } from '@/server/actions/time-off'
import { applyFixture, seedGolden } from '../../../scripts/lib/fixtures'
import { goldenProjectId, goldenUser, type GoldenProject } from '../../../tests/authz/_support/golden'
import { containsAny } from '../../../tests/helpers/json'
import { asUser } from '../../../tests/helpers/as-user'
import {
  allocationRows,
  makeDayAllocations,
  makeHoliday,
  makeLeaveType,
  makeTimeOff,
  makeUser,
  type TestUser,
} from '../../../tests/helpers/factories'
import { createWorld } from '../../../tests/helpers/world'
import { db } from '../db/client'
import { allocations, auditLog, leaveTypes, taskAssignments, tasks, timeOff } from '../db/schema'
import * as repo from '../repo'
import { loadCapacity } from './capacity'
import { ensureDefaultLeaveTypes } from './leave-types'
import * as timeOffService from './time-off'
import { overloadImpact } from './workload'

/** `expect.any(String)` typed as unknown (no-unsafe-assignment inside object literals). */
const ANY_STRING: unknown = expect.any(String)

interface Setup {
  peter: TestUser
  manager: TestUser
  vacationId: string
  sickId: string
}

async function setup(): Promise<Setup> {
  const peter = await makeUser({ name: 'Peter Example', nickname: 'Peter' })
  const manager = await makeUser({ role: 'manager', nickname: 'Boss' })
  await db.transaction((tx) => ensureDefaultLeaveTypes(tx, null))
  const types = await db.select().from(leaveTypes)
  const id = (name: string) => types.find((t) => t.name === name)!.id
  return { peter, manager, vacationId: id('ลาพักร้อน'), sickId: id('ลาป่วย') }
}

const timeOffAudits = () => db.select().from(auditLog).where(eq(auditLog.entity, 'time_off'))

function ok<T extends { ok: boolean }>(r: T): Extract<T, { ok: true }> {
  if (!r.ok) throw new Error(`expected ok, got ${JSON.stringify(r)}`)
  return r as Extract<T, { ok: true }>
}

describe('createTimeOff (FR-903…906)', () => {
  it('own leave 10-05..10-06 → created_by self, impact 500 → 300, userName = display name, one audit row', async () => {
    const s = await setup()
    asUser(s.peter)
    const res = ok(
      await createTimeOff({ leaveTypeId: s.vacationId, startDate: '2026-10-05', endDate: '2026-10-06' }),
    )
    expect(res.impact).toEqual({
      userId: s.peter.id,
      userName: 'Peter',
      weeks: [{ weekStart: '2026-10-05', beforeCd: 500, afterCd: 300 }],
      // M9-D18: this user has no plans → no overload lines and no DAY rows on the leave dates
      overloads: [],
      onTimeOffDays: [],
    })
    const [row] = await db.select().from(timeOff).where(eq(timeOff.id, res.id))
    expect(row).toMatchObject({
      userId: s.peter.id,
      createdBy: s.peter.id,
      half: null,
      note: null,
      startDate: '2026-10-05',
      endDate: '2026-10-06',
    })
    const audits = await timeOffAudits()
    expect(audits).toHaveLength(1)
    expect(audits[0]).toMatchObject({
      action: 'create',
      entityId: res.id,
      actorId: s.peter.id,
      projectId: null,
      summary: th.audit.timeOffCreated('Peter', formatLeaveRange('2026-10-05', '2026-10-06', null)),
    })
    expect(JSON.stringify(audits[0]?.after)).not.toContain('note')
  })

  it('effective immediately (FR-904): the capacity loader sees it in the same transaction', async () => {
    const s = await setup()
    const week = await db.transaction(async (tx) => {
      await timeOffService.createTimeOff(tx, null, {
        userId: s.peter.id,
        leaveTypeId: s.vacationId,
        startDate: '2026-10-05',
        endDate: '2026-10-06',
        half: null,
        note: null,
      })
      const cap = await loadCapacity(tx, [s.peter.id], { from: '2026-10-05', to: '2026-10-12' })
      return cap.get(s.peter.id)?.weeks['2026-10-05']
    })
    expect(week).toEqual({ capacityCd: 300, standardCd: 500 })
  })

  it('manager for another person → created_by = manager, impact for the target', async () => {
    const s = await setup()
    asUser(s.manager)
    const res = ok(
      await createTimeOff({
        userId: s.peter.id,
        leaveTypeId: s.vacationId,
        startDate: '2026-10-15',
        endDate: '2026-10-16',
        note: 'ไปต่างจังหวัด',
      }),
    )
    expect(res.impact).toEqual({
      userId: s.peter.id,
      userName: 'Peter',
      weeks: [{ weekStart: '2026-10-12', beforeCd: 500, afterCd: 300 }],
      // M9-D18: this user has no plans → no overload lines and no DAY rows on the leave dates
      overloads: [],
      onTimeOffDays: [],
    })
    const [row] = await db.select().from(timeOff).where(eq(timeOff.id, res.id))
    expect(row).toMatchObject({ userId: s.peter.id, createdBy: s.manager.id, note: 'ไปต่างจังหวัด' })
  })

  it('overlap names the existing entry (type + range); nothing is written', async () => {
    const s = await setup()
    asUser(s.peter)
    ok(await createTimeOff({ leaveTypeId: s.vacationId, startDate: '2026-10-05', endDate: '2026-10-06' }))
    const res = await createTimeOff({ leaveTypeId: s.sickId, startDate: '2026-10-06', endDate: '2026-10-07' })
    expect(res).toEqual({
      ok: false,
      code: 'OVERLAP',
      message: th.timeOff.errors.overlap(formatLeaveRange('2026-10-05', '2026-10-06', null), 'ลาพักร้อน'),
    })
    expect(await db.select().from(timeOff)).toHaveLength(1)
    expect(await timeOffAudits()).toHaveLength(1)
  })

  it('AM + PM on the same date → the "แก้รายการเดิมเป็นเต็มวัน" hint; AM again → plain overlap', async () => {
    const s = await setup()
    asUser(s.peter)
    const day = { startDate: '2026-10-20', endDate: '2026-10-20' }
    ok(await createTimeOff({ leaveTypeId: s.vacationId, ...day, half: 'AM' }))
    const range = formatLeaveRange('2026-10-20', '2026-10-20', 'AM')
    expect(await createTimeOff({ leaveTypeId: s.vacationId, ...day, half: 'PM' })).toMatchObject({
      ok: false,
      code: 'OVERLAP',
      message: th.timeOff.errors.overlapHalfDay(range, 'ลาพักร้อน'),
    })
    expect(await createTimeOff({ leaveTypeId: s.vacationId, ...day, half: 'AM' })).toMatchObject({
      ok: false,
      code: 'OVERLAP',
      message: th.timeOff.errors.overlap(range, 'ลาพักร้อน'),
    })
  })

  it('backstop: the pre-check misses (race) → 23P01 maps to OVERLAP with the generic message', async () => {
    const s = await setup()
    await makeTimeOff({ user: s.peter, leaveType: { id: s.vacationId }, startDate: '2026-10-05' })
    vi.spyOn(repo.timeOff, 'findOverlap').mockResolvedValueOnce(null)
    asUser(s.peter)
    const res = await createTimeOff({
      leaveTypeId: s.vacationId,
      startDate: '2026-10-05',
      endDate: '2026-10-05',
    })
    expect(res).toEqual({ ok: false, code: 'OVERLAP', message: th.errors.OVERLAP })
  })

  it('weekend / holiday leave is allowed; impact shows no change (400 → 400)', async () => {
    const s = await setup()
    await makeHoliday({ date: '2026-10-23' })
    asUser(s.peter)
    const res = ok(
      await createTimeOff({ leaveTypeId: s.vacationId, startDate: '2026-10-23', endDate: '2026-10-25' }),
    )
    expect(res.impact.weeks).toEqual([{ weekStart: '2026-10-19', beforeCd: 400, afterCd: 400 }])
  })

  it('archived or unknown type → VALIDATION fieldErrors.leaveTypeId', async () => {
    const s = await setup()
    const archived = await makeLeaveType({ name: 'เลิกใช้', archived: true })
    asUser(s.peter)
    expect(
      await createTimeOff({ leaveTypeId: archived.id, startDate: '2026-10-05', endDate: '2026-10-05' }),
    ).toMatchObject({
      ok: false,
      code: 'VALIDATION',
      fieldErrors: { leaveTypeId: [th.timeOff.errors.typeArchived] },
    })
    expect(
      await createTimeOff({ leaveTypeId: randomUUID(), startDate: '2026-10-05', endDate: '2026-10-05' }),
    ).toMatchObject({
      ok: false,
      code: 'VALIDATION',
      fieldErrors: { leaveTypeId: [th.timeOff.errors.typeRequired] },
    })
    expect(await db.select().from(timeOff)).toEqual([])
  })
})

describe('updateTimeOff', () => {
  it('move 10-05..06 → 10-12..13: impact over both weeks; one audit row with before/after', async () => {
    const s = await setup()
    asUser(s.peter)
    const { id } = ok(
      await createTimeOff({ leaveTypeId: s.vacationId, startDate: '2026-10-05', endDate: '2026-10-06' }),
    )
    const res = ok(
      await updateTimeOff({ id, leaveTypeId: s.vacationId, startDate: '2026-10-12', endDate: '2026-10-13' }),
    )
    expect(res).toEqual({
      ok: true,
      id,
      impact: {
        userId: s.peter.id,
        userName: 'Peter',
        weeks: [
          { weekStart: '2026-10-05', beforeCd: 300, afterCd: 500 },
          { weekStart: '2026-10-12', beforeCd: 500, afterCd: 300 },
        ],
        // M9-D18: this user has no plans → no overload lines and no DAY rows on the leave dates
        overloads: [],
        onTimeOffDays: [],
      },
    })
    const audits = await timeOffAudits()
    expect(audits).toHaveLength(2)
    const upd = audits.find((a) => a.action === 'update')
    expect(upd).toMatchObject({
      before: { startDate: '2026-10-05', endDate: '2026-10-06' },
      after: { startDate: '2026-10-12', endDate: '2026-10-13' },
    })
  })

  it('may keep an archived type; changing to another archived type → VALIDATION', async () => {
    const s = await setup()
    const old = await makeLeaveType({ name: 'เก่า1' })
    const other = await makeLeaveType({ name: 'เก่า2', archived: true })
    const entry = await makeTimeOff({ user: s.peter, leaveType: old, startDate: '2026-10-05' })
    await db
      .update(leaveTypes)
      .set({ archivedAt: sql`now()` })
      .where(eq(leaveTypes.id, old.id))
    asUser(s.peter)
    const base = { id: entry.id, startDate: '2026-10-05', endDate: '2026-10-05' }
    ok(await updateTimeOff({ ...base, leaveTypeId: old.id, half: 'PM', note: 'แก้' }))
    expect(await updateTimeOff({ ...base, leaveTypeId: other.id })).toMatchObject({
      ok: false,
      code: 'VALIDATION',
      fieldErrors: { leaveTypeId: [th.timeOff.errors.typeArchived] },
    })
  })

  it('past entry is editable by its owner (X64) and audited; overlap with another entry excludes itself', async () => {
    const s = await setup()
    const past = await makeTimeOff({
      user: s.peter,
      leaveType: { id: s.vacationId },
      startDate: '2026-09-01',
    })
    await makeTimeOff({ user: s.peter, leaveType: { id: s.sickId }, startDate: '2026-09-03' })
    asUser(s.peter)
    ok(
      await updateTimeOff({
        id: past.id,
        leaveTypeId: s.sickId,
        startDate: '2026-09-01',
        endDate: '2026-09-02',
      }),
    )
    expect(await timeOffAudits()).toHaveLength(1)
    expect(
      await updateTimeOff({
        id: past.id,
        leaveTypeId: s.sickId,
        startDate: '2026-09-01',
        endDate: '2026-09-03',
      }),
    ).toMatchObject({
      ok: false,
      code: 'OVERLAP',
      message: th.timeOff.errors.overlap(formatLeaveRange('2026-09-03', '2026-09-03', null), 'ลาป่วย'),
    })
  })
})

describe('deleteTimeOff / restoreTimeOff (FR-909, M5-D16)', () => {
  it('soft delete returns the batch; restore brings it back; second restore → NOT_FOUND', async () => {
    const s = await setup()
    asUser(s.peter)
    const { id } = ok(
      await createTimeOff({ leaveTypeId: s.vacationId, startDate: '2026-10-05', endDate: '2026-10-06' }),
    )
    const del = ok(await deleteTimeOff({ id }))
    expect(del).toEqual({
      ok: true,
      batch: ANY_STRING,
      userId: s.peter.id,
      startDate: '2026-10-05',
      endDate: '2026-10-06',
      half: null,
    })
    const [gone] = await db.select().from(timeOff).where(eq(timeOff.id, id))
    expect(gone?.deletedAt).not.toBeNull()
    expect(gone?.deletedBatch).toBe(del.batch)
    expect(await deleteTimeOff({ id })).toMatchObject({ ok: false, code: 'NOT_FOUND' })

    expect(await restoreTimeOff({ batch: del.batch })).toEqual({
      ok: true,
      restored: 1,
      userId: s.peter.id,
    })
    const [back] = await db.select().from(timeOff).where(eq(timeOff.id, id))
    expect(back).toMatchObject({ deletedAt: null, deletedBatch: null })
    expect((await timeOffAudits()).map((a) => a.action).sort()).toEqual(['create', 'delete', 'restore'])
    expect(await restoreTimeOff({ batch: del.batch })).toMatchObject({ ok: false, code: 'NOT_FOUND' })
  })

  it('restore after 31 days → CONFLICT restoreExpired', async () => {
    const s = await setup()
    const batch = randomUUID()
    await makeTimeOff({
      user: s.peter,
      leaveType: { id: s.vacationId },
      startDate: '2026-10-05',
      deleted: { batch, daysAgo: 31 },
    })
    asUser(s.peter)
    expect(await restoreTimeOff({ batch })).toEqual({
      ok: false,
      code: 'CONFLICT',
      message: th.timeOff.errors.restoreExpired,
    })
  })

  it('restore that overlaps newer leave → OVERLAP restoreOverlap; nothing restored', async () => {
    const s = await setup()
    asUser(s.peter)
    const { id } = ok(
      await createTimeOff({ leaveTypeId: s.vacationId, startDate: '2026-10-05', endDate: '2026-10-06' }),
    )
    const { batch } = ok(await deleteTimeOff({ id }))
    ok(await createTimeOff({ leaveTypeId: s.vacationId, startDate: '2026-10-06', endDate: '2026-10-06' }))
    expect(await restoreTimeOff({ batch })).toEqual({
      ok: false,
      code: 'OVERLAP',
      message: th.timeOff.errors.restoreOverlap,
    })
    const [still] = await db.select().from(timeOff).where(eq(timeOff.id, id))
    expect(still?.deletedBatch).toBe(batch)
  })

  it('restore backstop: 23P01 at restore time also maps to restoreOverlap', async () => {
    const s = await setup()
    const batch = randomUUID()
    await makeTimeOff({
      user: s.peter,
      leaveType: { id: s.vacationId },
      startDate: '2026-10-05',
      deleted: { batch, daysAgo: 1 },
    })
    await makeTimeOff({ user: s.peter, leaveType: { id: s.vacationId }, startDate: '2026-10-05' })
    vi.spyOn(repo.timeOff, 'findOverlap').mockResolvedValueOnce(null)
    asUser(s.peter)
    expect(await restoreTimeOff({ batch })).toMatchObject({
      ok: false,
      code: 'OVERLAP',
      message: th.timeOff.errors.restoreOverlap,
    })
  })
})

describe('BR-42 (M5 part): leave writes never edit plans', () => {
  it('row counts of every table except time_off / audit_log are unchanged after create / update / delete / restore', async () => {
    // M6 S2.9: with plans (the member's pDone week 10-05 overlaps the leave) + an allocations checksum
    const w = await createWorld({ with: ['allocations'] })
    const vacation = w.leaveTypes.vacation
    const counts = async () => {
      const tables = await db.execute<{ tablename: string }>(
        sql`select tablename from pg_tables where schemaname = 'public' and tablename not in ('time_off', 'audit_log') order by tablename`,
      )
      const out: Record<string, number> = {}
      for (const { tablename } of tables) {
        const [r] = await db.execute<{ n: number }>(sql.raw(`select count(*)::int as n from "${tablename}"`))
        out[tablename] = r?.n ?? 0
      }
      return out
    }
    /** count + Σ cd of plans, bounded by week_start (SPEC §6.5). */
    const planChecksum = async () => {
      const [r] = await db.execute<{ n: number; cd: number }>(
        sql`select count(*)::int as n, (coalesce(sum(person_days), 0) * 100)::int as cd from allocations
            where week_start >= '2020-01-06' and week_start < '2030-01-07'`,
      )
      return r
    }
    const before = await counts()
    const plansBefore = await planChecksum()
    expect(before.tasks).toBeGreaterThan(0)
    expect(before.task_assignments).toBeGreaterThan(0)
    expect(plansBefore?.n).toBeGreaterThan(0)
    asUser(w.member)
    const { id } = ok(
      await createTimeOff({ leaveTypeId: vacation.id, startDate: '2026-10-05', endDate: '2026-10-09' }),
    )
    ok(await updateTimeOff({ id, leaveTypeId: vacation.id, startDate: '2026-10-05', endDate: '2026-10-06' }))
    const { batch } = ok(await deleteTimeOff({ id }))
    ok(await restoreTimeOff({ batch }))
    expect(await counts()).toEqual(before)
    expect(await planChecksum()).toEqual(plansBefore)
  })
})

describe('BR-42 (M7 part, M7-D15): leave added after DAY rows', () => {
  it('DAY rows are unchanged by a later leave; a later save in that week returns ALLOCATED_ON_TIME_OFF', async () => {
    await seedGolden(db)
    const ivy = await goldenUser('Ivy')
    const [a] = await db
      .select({ id: taskAssignments.id })
      .from(taskAssignments)
      .innerJoin(tasks, eq(tasks.id, taskAssignments.taskId))
      .where(eq(tasks.name, 'ตั้งค่า automation'))
    const id = a!.id
    await db.delete(allocations).where(and(eq(allocations.taskAssignmentId, id), eq(allocations.weekStart, '2026-10-12')))
    await makeDayAllocations({ assignment: { id }, days: { '2026-10-12': 100, '2026-10-13': 100 } })
    const before = await allocationRows(id, '2026-10-12')
    const [vacation] = await db.select({ id: leaveTypes.id }).from(leaveTypes).where(eq(leaveTypes.name, 'ลาพักร้อน'))
    asUser(ivy)
    ok(await createTimeOff({ leaveTypeId: vacation!.id, startDate: '2026-10-13', endDate: '2026-10-13' }))
    expect(await allocationRows(id, '2026-10-12')).toEqual(before)
    const r = ok(
      await saveAllocations({
        items: [{ taskAssignmentId: id, baseVersion: 1, changes: [{ granularity: 'DAY', period: '2026-10-14', cd: 50 }] }],
        clientOpId: 'br42-day',
      }),
    )
    expect(r.warnings).toEqual([
      { code: 'WORK_ON_NON_WORKING_DAY', taskAssignmentId: id, week: '2026-10-12', date: '2026-10-13' },
      { code: 'ALLOCATED_ON_TIME_OFF', taskAssignmentId: id, week: '2026-10-12', date: '2026-10-13' },
    ])
  })
})

describe('time-off actions: authorization (M5-D3)', () => {
  it('worker for a co-member → FORBIDDEN; outsider for an invisible person → NOT_FOUND; nothing written', async () => {
    const w = await createWorld({ with: ['timeOff'] })
    const coworker = w.users.coworker!
    const pOnly = w.users.pOnly!
    const before = await db.select({ n: count() }).from(timeOff)
    asUser(w.member)
    expect(
      await createTimeOff({
        userId: coworker.id,
        leaveTypeId: w.leaveTypes.vacation.id,
        startDate: '2026-12-21',
        endDate: '2026-12-21',
      }),
    ).toMatchObject({ ok: false, code: 'FORBIDDEN' })
    asUser(w.outsider)
    expect(
      await createTimeOff({
        userId: pOnly.id,
        leaveTypeId: w.leaveTypes.vacation.id,
        startDate: '2026-12-21',
        endDate: '2026-12-21',
      }),
    ).toMatchObject({ ok: false, code: 'NOT_FOUND' })
    expect(await deleteTimeOff({ id: w.timeOff.pOnly.id })).toMatchObject({ ok: false, code: 'NOT_FOUND' })
    expect(
      await updateTimeOff({
        id: w.timeOff.pOnly.id,
        leaveTypeId: w.leaveTypes.sick.id,
        startDate: '2026-11-16',
        endDate: '2026-11-16',
      }),
    ).toMatchObject({ ok: false, code: 'NOT_FOUND' })
    expect(await deleteTimeOff({ id: w.timeOff.coworker.id })).toMatchObject({ ok: false, code: 'FORBIDDEN' })
    expect(await restoreTimeOff({ batch: w.batches.coworkerDeletedTimeOff })).toMatchObject({
      ok: false,
      code: 'FORBIDDEN',
    })
    expect(await db.select({ n: count() }).from(timeOff)).toEqual(before)
    const live = await db
      .select({ n: count() })
      .from(timeOff)
      .where(and(eq(timeOff.userId, coworker.id), sql`${timeOff.deletedAt} is null`))
    expect(live[0]?.n).toBe(1)
  })

  it('manager edits, deletes and restores other people’s entries', async () => {
    const w = await createWorld({ with: ['timeOff'] })
    asUser(w.manager)
    ok(
      await updateTimeOff({
        id: w.timeOff.pOnly.id,
        leaveTypeId: w.leaveTypes.sick.id,
        startDate: '2026-11-16',
        endDate: '2026-11-16',
        half: 'AM',
      }),
    )
    ok(await deleteTimeOff({ id: w.timeOff.coworker.id }))
    ok(await restoreTimeOff({ batch: w.batches.coworkerDeletedTimeOff }))
  })
})

// ── M9 S2.9 — FR-906 overload lines + onTimeOffDays (M9-D18, X23, M7-D15; golden F1 unless noted) ──

describe('createTimeOff / updateTimeOff → impact.overloads (FR-906, M9-D18)', () => {
  const vacation = async () => (await repo.leaveTypes.findIdByName(db, 'ลาพักร้อน'))!
  const pid = async (name: GoldenProject) => goldenProjectId(name)
  const checksum = async () =>
    (await db.execute<{ s: string }>(sql`select coalesce(sum(person_days), 0)::text as s from allocations
      where week_start >= '2026-01-05' and week_start < '2027-12-27'`))[0]!.s

  it('Peter 2026-10-05..06 → one OVER +200 CAPACITY line (r8 §6b); plans untouched (BR-42)', async () => {
    await seedGolden(db)
    const before = await checksum()
    const peter = await goldenUser('Peter')
    asUser(peter)
    const res = ok(await createTimeOff({ leaveTypeId: await vacation(), startDate: '2026-10-05', endDate: '2026-10-06' }))
    const dw = await pid('Data Warehouse')
    expect(res.impact.overloads).toEqual([
      {
        week: '2026-10-05',
        before: { level: 'OK', excessCd: 0 },
        after: { level: 'OVER', excessCd: 200, cause: 'CAPACITY' },
        load: { total: 500, committed: 500 },
        capacityCd: 300,
        standardCd: 500,
        parts: [{ projectId: dw, name: 'Data Warehouse', load: { total: 500, committed: 500 } }],
        href: `/people/${peter.id}/plan?week=2026-10-05`,
      },
    ])
    expect(res.impact.onTimeOffDays).toEqual([])
    expect(await checksum()).toBe(before)
  })

  it('Cindy 2026-10-12..14 (F4) → one RISK +50 CAPACITY line, part CRM 250/0', async () => {
    await seedGolden(db)
    asUser(await goldenUser('Cindy'))
    const res = ok(await createTimeOff({ leaveTypeId: await vacation(), startDate: '2026-10-12', endDate: '2026-10-14' }))
    expect(res.impact.overloads).toHaveLength(1)
    expect(res.impact.overloads[0]).toMatchObject({
      week: '2026-10-12',
      after: { level: 'RISK', excessCd: 50, cause: 'CAPACITY' },
      parts: [{ projectId: await pid('CRM Migration'), name: 'CRM Migration', load: { total: 250, committed: 0 } }],
    })
  })

  it('update 10-05..06 → 10-12..13: only week 2026-10-12 (OVER +75, load 375, cap 300)', async () => {
    await seedGolden(db)
    asUser(await goldenUser('Peter'))
    const created = ok(
      await createTimeOff({ leaveTypeId: await vacation(), startDate: '2026-10-05', endDate: '2026-10-06' }),
    )
    const res = ok(
      await updateTimeOff({ id: created.id, leaveTypeId: await vacation(), startDate: '2026-10-12', endDate: '2026-10-13' }),
    )
    expect(res.impact.overloads.map((o) => [o.week, o.after.level, o.after.excessCd, o.load.total, o.capacityCd])).toEqual([
      ['2026-10-12', 'OVER', 75, 375, 300],
    ])
  })

  it('F2 + Jack leave 2026-10-19 → OVER +100 → OVER +200 is listed (excess grew)', async () => {
    await seedGolden(db)
    await applyFixture(db, 'F2')
    asUser(await goldenUser('Jack'))
    const res = ok(await createTimeOff({ leaveTypeId: await vacation(), startDate: '2026-10-19', endDate: '2026-10-19' }))
    expect(res.impact.overloads).toHaveLength(1)
    expect(res.impact.overloads[0]).toMatchObject({
      week: '2026-10-19',
      before: { level: 'OVER', excessCd: 100 },
      after: { level: 'OVER', excessCd: 200, cause: 'CAPACITY' },
    })
  })

  it('Ivy 2026-10-05 (125 of 400) → no line; DAY rows on the leave date → onTimeOffDays', async () => {
    await seedGolden(db)
    const ivy = await goldenUser('Ivy')
    asUser(ivy)
    expect(
      ok(await createTimeOff({ leaveTypeId: await vacation(), startDate: '2026-10-05', endDate: '2026-10-05' })).impact
        .overloads,
    ).toEqual([])
    const [uat] = await db
      .select({ id: taskAssignments.id })
      .from(taskAssignments)
      .innerJoin(tasks, eq(tasks.id, taskAssignments.taskId))
      .where(and(eq(tasks.name, 'ทำ UAT + คู่มือหน้าร้าน'), eq(taskAssignments.userId, ivy.id)))
    await makeDayAllocations({ assignment: uat!, days: { '2026-11-10': 100 } })
    const res = ok(await createTimeOff({ leaveTypeId: await vacation(), startDate: '2026-11-10', endDate: '2026-11-10' }))
    expect(res.impact.onTimeOffDays).toEqual([{ date: '2026-11-10', cd: 100 }])
    expect(res.impact.overloads).toEqual([])
  })

  it('masking: lead → coworker with cap 0 → P part + one masked part; nothing of Q', async () => {
    const w = await createWorld({ with: ['allocations'] })
    const coworker = w.users.coworker!
    const lines = await overloadImpact(
      db,
      asUser(w.lead),
      coworker.id,
      ['2026-10-05'],
      new Map([['2026-10-05', { capacityCd: 500, standardCd: 500 }]]),
      new Map([['2026-10-05', { capacityCd: 0, standardCd: 500 }]]),
    )
    expect(lines).toHaveLength(1)
    expect(lines[0]!.parts).toEqual([
      { projectId: w.P.id, name: w.P.name, load: { total: 100, committed: 100 } },
      { projectId: null, name: th.masking.otherProjects, load: { total: 300, committed: 300 } },
    ])
    expect(containsAny(lines, [w.Q.name, w.Q.id, 'งาน Q-ลับ02'])).toEqual([])
  })
})
