// M6 S2.1 — repo/allocations (BR-02 numeric ↔ cd, §6.5 builder parity X03, BR-44, BR-50, M6-D24).
import { randomUUID } from 'node:crypto'
import { and, eq, gte, isNull, lt } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import { effectiveCertainty, splitLoad, type CertaintyNode } from '@/domain/certainty'
import { countsTowardLoad } from '@/domain/completed'
import type { ISODate, LoadPair } from '@/domain/types'
import { addWeeks } from '@/domain/dates'
import { numericToCd } from '@/domain/units'
import { seedGolden } from '../../../scripts/lib/fixtures'
import { makeAllocation, makeAssignment, makeTask } from '../../../tests/helpers/factories'
import { createWorld } from '../../../tests/helpers/world'
import { db } from '../db/client'
import { allocations, projects, taskAssignments, tasks } from '../db/schema'
import * as repoAllocations from './allocations'

const RANGE = { from: '2026-08-31', to: '2027-01-04' } as const

async function rawRows(assignmentId: string, week: ISODate) {
  return db
    .select({ g: allocations.granularity, p: allocations.periodStart, d: allocations.personDays })
    .from(allocations)
    .where(and(eq(allocations.taskAssignmentId, assignmentId), eq(allocations.weekStart, week)))
    .orderBy(allocations.periodStart)
}

describe('repo.allocations — numeric round trip (BR-02)', () => {
  it('WEEK 375 ↔ 3.75; DAY rows of one week; deleteWeek removes only that week; a Friday-of-year-end DAY row', async () => {
    const w = await createWorld({ with: ['tasks'] })
    const id = w.assignments.pLeafLead.id
    await db.transaction(async (tx) => {
      await repoAllocations.insertWeekPlan(tx, id, '2026-10-05', { resolution: 'WEEK', weekCd: 375 })
      await repoAllocations.insertWeekPlan(tx, id, '2026-09-28', { resolution: 'DAY', days: [50, 50, 100, 50, 50, 0, 0] })
      await repoAllocations.insertWeekPlan(tx, id, '2026-12-28', { resolution: 'DAY', days: [0, 0, 0, 0, 25, 0, 0] })
      await repoAllocations.insertWeekPlan(tx, id, '2026-11-02', { resolution: null })
    })
    expect(await rawRows(id, '2026-10-05')).toEqual([{ g: 'WEEK', p: '2026-10-05', d: '3.75' }])
    expect((await rawRows(id, '2026-09-28')).map((r) => r.d)).toEqual(['0.50', '0.50', '1.00', '0.50', '0.50'])
    expect(await rawRows(id, '2026-12-28')).toEqual([{ g: 'DAY', p: '2027-01-01', d: '0.25' }])
    const listed = await repoAllocations.listForWeeks(db, [id], ['2026-10-05', '2026-09-28'])
    expect(listed.filter((r) => r.weekStart === '2026-10-05')).toEqual([
      { taskAssignmentId: id, granularity: 'WEEK', periodStart: '2026-10-05', weekStart: '2026-10-05', cd: 375 },
    ])
    const plans = repoAllocations.plansFromRows(listed).get(id)!
    expect(plans.get('2026-09-28')).toEqual({ resolution: 'DAY', days: [50, 50, 100, 50, 50, 0, 0] })
    expect(plans.get('2026-10-05')).toEqual({ resolution: 'WEEK', weekCd: 375 })
    expect(await db.transaction((tx) => repoAllocations.deleteWeek(tx, id, '2026-09-28'))).toBe(5)
    expect(await rawRows(id, '2026-09-28')).toEqual([])
    expect(await rawRows(id, '2026-10-05')).toHaveLength(1)
    expect(await repoAllocations.listForWeeks(db, [], ['2026-10-05'])).toEqual([])
    expect(await repoAllocations.listForWeeks(db, [id], [])).toEqual([])
  })

  it('plansFromRows rejects a week with WEEK and DAY rows', () => {
    const base = { taskAssignmentId: 'a', weekStart: '2026-10-05', cd: 50 }
    expect(() =>
      repoAllocations.plansFromRows([
        { ...base, granularity: 'WEEK', periodStart: '2026-10-05' },
        { ...base, granularity: 'DAY', periodStart: '2026-10-06' },
      ]),
    ).toThrow(/mixed/)
  })
})

describe('repo.allocations — §6.5 parity (X03, BR-44, BR-50)', () => {
  it('loadByUserWeek equals the TS oracle (effectiveCertainty + splitLoad + countsTowardLoad) for every user × week', async () => {
    const w = await createWorld({ with: ['allocations'] })
    // overrides at every depth: grandparent → parent → child, a task override, none; project certainties both ways
    await db.update(projects).set({ certainty: 'TENTATIVE' }).where(eq(projects.id, w.Q.id))
    const g = await makeTask({ project: w.P, name: 'gp', createdBy: w.manager, certaintyOverride: 'TENTATIVE' })
    const pa = await makeTask({ project: w.P, parent: g, name: 'pa', createdBy: w.manager })
    const ch = await makeTask({ project: w.P, parent: pa, name: 'ch', createdBy: w.manager })
    const pa2 = await makeTask({ project: w.P, name: 'pa2', createdBy: w.manager, certaintyOverride: 'TENTATIVE' })
    const ch2 = await makeTask({ project: w.P, parent: pa2, name: 'ch2', createdBy: w.manager, certaintyOverride: 'CONFIRMED' })
    const qt = await makeTask({ project: w.Q, name: 'qt', createdBy: w.manager, certaintyOverride: 'CONFIRMED' })
    for (const [task, user, cd] of [
      [ch, w.lead, 150],
      [ch2, w.member, 225],
      [qt, w.outsider, 75],
    ] as const) {
      const a = await makeAssignment({ task, user })
      await makeAllocation({ assignment: a, period: '2026-10-12', cd })
      await makeAllocation({ assignment: a, period: '2026-10-21', cd: 25 })
    }
    // soft-deleted assignment and task are excluded
    const gone = await makeTask({ project: w.P, name: 'gone', createdBy: w.manager, deleted: { batch: randomUUID(), daysAgo: 1 } })
    await makeAllocation({ assignment: await makeAssignment({ task: gone, user: w.lead }), period: '2026-10-12', cd: 500 })

    const userIds = [w.manager, w.lead, w.member, w.outsider, w.users.coworker!].map((u) => u.id)
    const got = await repoAllocations.loadByUserWeek(db, { userIds, range: RANGE })

    // oracle
    const all = await db
      .select({
        userId: taskAssignments.userId,
        week: allocations.weekStart,
        d: allocations.personDays,
        taskId: tasks.id,
        completedWeek: tasks.completedWeek,
        projectCertainty: projects.certainty,
        archived: projects.archivedAt,
        taDeleted: taskAssignments.deletedAt,
        tDeleted: tasks.deletedAt,
      })
      .from(allocations)
      .innerJoin(taskAssignments, eq(taskAssignments.id, allocations.taskAssignmentId))
      .innerJoin(tasks, eq(tasks.id, taskAssignments.taskId))
      .innerJoin(projects, eq(projects.id, tasks.projectId))
      .where(and(gte(allocations.weekStart, RANGE.from), lt(allocations.weekStart, RANGE.to), isNull(projects.deletedAt)))
    const taskRows = await db.select().from(tasks)
    const byId = new Map(taskRows.map((t) => [t.id, t]))
    const chain = (id: string): CertaintyNode[] => {
      const out: CertaintyNode[] = []
      for (let t = byId.get(id); t && out.length < 3; t = t.parentId ? byId.get(t.parentId) : undefined)
        out.push({ id: t.id, name: t.name, certaintyOverride: t.certaintyOverride })
      return out
    }
    const want = new Map<string, Record<ISODate, LoadPair>>()
    for (const r of all) {
      if (r.archived || r.taDeleted || r.tDeleted || !countsTowardLoad(r.week, r.completedWeek)) continue
      if (!userIds.includes(r.userId)) continue
      const pair = splitLoad(numericToCd(r.d), effectiveCertainty(chain(r.taskId), r.projectCertainty))
      const weeks = want.get(r.userId) ?? {}
      const cur = weeks[r.week] ?? { total: 0, committed: 0 }
      weeks[r.week] = { total: cur.total + pair.total, committed: cur.committed + pair.committed }
      want.set(r.userId, weeks)
    }
    expect(Object.fromEntries(got)).toEqual(Object.fromEntries(want))
    // spot checks: archived A (member 10-05 = 200) and pDone's 10-05 (BR-50) are out; lead 10-12 = 150 tentative
    expect(got.get(w.member.id)?.['2026-10-05']).toBeUndefined()
    expect(got.get(w.lead.id)?.['2026-10-12']).toEqual({ total: 150, committed: 0 })
    expect(got.get(w.member.id)?.['2026-10-12']).toEqual({ total: 325, committed: 325 }) // 100 DAY + 225 confirmed
    expect(got.get(w.outsider.id)?.['2026-10-12']).toEqual({ total: 75, committed: 75 })
    expect(await repoAllocations.loadByUserWeek(db, { userIds: [], range: RANGE })).toEqual(new Map())
  })

  it('excludeProjectId / projectId: coworker without P → only Q’s W 2026-10-05 = { 300, 300 }', async () => {
    const w = await createWorld({ with: ['allocations'] })
    const coworker = w.users.coworker!.id
    const others = await repoAllocations.loadByUserWeek(db, { userIds: [coworker], range: RANGE, excludeProjectId: w.P.id })
    expect(others.get(coworker)).toEqual({ '2026-10-05': { total: 300, committed: 300 } })
    const onlyP = await repoAllocations.loadByUserWeek(db, { userIds: [coworker], range: RANGE, projectId: w.P.id })
    expect(onlyP.get(coworker)).toEqual({ '2026-10-05': { total: 100, committed: 100 } })
  })
})

describe('repo.allocations — counted sums (BR-50)', () => {
  it('sumCountedByAssignment: pDoneMember → 100 (10-05 not counted); golden Rollout สาขา → 1875', async () => {
    const w = await createWorld({ with: ['allocations'] })
    const m = await repoAllocations.sumCountedByAssignment(db, [w.assignments.pDoneMember.id, w.assignments.pLeafLead.id], RANGE)
    expect(m.get(w.assignments.pDoneMember.id)).toBe(100)
    expect(m.get(w.assignments.pLeafLead.id)).toBe(750)
    expect(await repoAllocations.sumCountedByAssignment(db, [], RANGE)).toEqual(new Map())
  })

  it('golden: Rollout สาขา sums 1875; listAfterWeek / listProjectFuture are bounded', async () => {
    await seedGolden(db)
    const [rollout] = await db
      .select({ ta: taskAssignments.id, task: tasks.id })
      .from(taskAssignments)
      .innerJoin(tasks, eq(tasks.id, taskAssignments.taskId))
      .where(eq(tasks.name, 'Rollout สาขา'))
    const sums = await repoAllocations.sumCountedByAssignment(db, [rollout!.ta], RANGE)
    expect(sums.get(rollout!.ta)).toBe(1875)
    const after = await repoAllocations.listAfterWeek(db, [rollout!.task], '2026-09-28', '2029-10-01')
    expect(after.map((r) => r.cd)).toEqual([250, 375, 500, 500, 250])
    expect(await repoAllocations.listAfterWeek(db, [rollout!.task], '2026-12-21', '2029-10-01')).toEqual([
      { weekStart: '2026-12-28', cd: 250 },
    ])
    expect(await repoAllocations.listAfterWeek(db, [], '2026-09-28', '2029-10-01')).toEqual([])
    const [pos] = await db.select({ id: projects.id }).from(projects).where(eq(projects.name, 'POS Upgrade'))
    const future = await repoAllocations.listProjectFuture(db, pos!.id, { from: '2026-09-28', to: '2026-10-12' })
    expect(future).toEqual([
      { weekStart: '2026-09-28', cd: 500, completedWeek: null },
      { weekStart: '2026-10-05', cd: 125, completedWeek: null },
    ])
  })
})

describe('repo.allocations — dayLoadsForProjects (M7 S2.1, C39, M7-D27)', () => {
  const weeksOf = (from: ISODate, n: number): ISODate[] => Array.from({ length: n }, (_, i) => addWeeks(from, i))

  it('excludeProjectId / projectIds narrow it; archived A and weeks outside `weeks` never returned; [] without weeks', async () => {
    const w = await createWorld({ with: ['dayAllocations'] })
    const coworker = w.users.coworker!.id
    const qRow = { userId: coworker, weekStart: '2026-11-09', granularity: 'DAY', periodStart: '2026-11-10', totalCd: 75, committedCd: 75 }
    expect(
      await repoAllocations.dayLoadsForProjects(db, { userIds: [coworker], weeks: ['2026-11-09'], excludeProjectId: w.P.id }),
    ).toEqual([qRow])
    expect(await repoAllocations.dayLoadsForProjects(db, { userIds: [coworker], weeks: ['2026-11-09'], projectIds: [w.Q.id] })).toEqual([
      qRow,
    ])
    const lead = w.lead.id
    const pDay = await repoAllocations.dayLoadsForProjects(db, { userIds: [lead], weeks: ['2026-11-09'], projectIds: [w.P.id] })
    expect(pDay.map((r) => [r.granularity, r.periodStart, r.totalCd])).toEqual([
      ['DAY', '2026-11-09', 100],
      ['DAY', '2026-11-10', 100],
      ['DAY', '2026-11-11', 50],
    ])
    for (const r of pDay) expect(r).toMatchObject({ userId: lead, weekStart: '2026-11-09', committedCd: r.totalCd })
    // archived A (member's DAY 11-09 = 50) is excluded (BR-44)
    expect(await repoAllocations.dayLoadsForProjects(db, { userIds: [w.member.id], weeks: ['2026-11-09'] })).toEqual([])
    // a week outside `weeks` is never returned: pWeek (11-02) WEEK 250 only when asked
    expect(await repoAllocations.dayLoadsForProjects(db, { userIds: [lead], weeks: ['2026-11-16'] })).toEqual([])
    expect(await repoAllocations.dayLoadsForProjects(db, { userIds: [lead], weeks: ['2026-11-02'] })).toEqual([
      { userId: lead, weekStart: '2026-11-02', granularity: 'WEEK', periodStart: '2026-11-02', totalCd: 250, committedCd: 250 },
    ])
    expect(await repoAllocations.dayLoadsForProjects(db, { userIds: [lead], weeks: [] })).toEqual([])
    expect(await repoAllocations.dayLoadsForProjects(db, { userIds: [], weeks: ['2026-11-09'] })).toEqual([])
  })

  it('parity: Σ per (user, week) equals loadByUserWeek for the same filters (incl. BR-50 and certainty)', async () => {
    const w = await createWorld({ with: ['dayAllocations'] })
    await db.update(projects).set({ certainty: 'TENTATIVE' }).where(eq(projects.id, w.Q.id))
    const userIds = [w.manager, w.lead, w.member, w.outsider, w.users.coworker!].map((u) => u.id)
    const weeks = weeksOf('2026-09-28', 8)
    const cases: { excludeProjectId?: string; projectId?: string }[] = [{}, { excludeProjectId: w.P.id }, { projectId: w.Q.id }]
    for (const filter of cases) {
      const expected = await repoAllocations.loadByUserWeek(db, {
        userIds,
        range: { from: weeks[0]!, to: '2026-11-23' },
        ...filter,
      })
      const rows = await repoAllocations.dayLoadsForProjects(db, {
        userIds,
        weeks,
        ...(filter.excludeProjectId ? { excludeProjectId: filter.excludeProjectId } : {}),
        ...(filter.projectId ? { projectIds: [filter.projectId] } : {}),
      })
      const got = new Map<string, Record<ISODate, LoadPair>>()
      for (const r of rows) {
        const m = got.get(r.userId) ?? {}
        const prev = m[r.weekStart] ?? { total: 0, committed: 0 }
        m[r.weekStart] = { total: prev.total + r.totalCd, committed: prev.committed + r.committedCd }
        got.set(r.userId, m)
      }
      expect(got).toEqual(expected)
    }
  })
})
