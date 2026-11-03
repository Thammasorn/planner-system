// v3.6 (SPEC FR-812, BR-103a) — GET /api/projects/[id]/plan-spans: first → last day with counted planned load of each
// live task's own live assignees (WEEK → the assignee's working days of that week, DAY → the date), bounded by
// week_start (± 3 years around the month grid); the golden POS / Store tasks get the spans of their grid weeks.
import { randomUUID } from 'node:crypto'
import { and, eq, isNull } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import { GET } from '@/app/api/projects/[id]/plan-spans/route'
import { GET as GET_TEAM } from '@/app/api/tasks/plan-spans/route'
import { monthGrid } from '@/lib/calendar/month-grid'
import type { PlanSpansResponse, TeamPlanSpansResponse } from '@/lib/contracts/plan-spans'
import { seedGolden } from '../../../scripts/lib/fixtures'
import { goldenProjectId, goldenUser } from '../../../tests/authz/_support/golden'
import { callRoute, okJson } from '../../../tests/authz/_support/http'
import { asUser, toSessionUser } from '../../../tests/helpers/as-user'
import {
  makeAllocation,
  makeAssignment,
  makeDayAllocations,
  makeTask,
  makeUser,
} from '../../../tests/helpers/factories'
import { createWorld } from '../../../tests/helpers/world'
import { db } from '../db/client'
import { projects, tasks } from '../db/schema'
import * as repo from '../repo'
import {
  getProjectPlanSpans,
  getTeamPlanSpans,
  lookaroundRange,
  PLAN_SPAN_LOOKAROUND_DAYS,
} from './plan-spans'

const NOV = monthGrid('2026-11')

/** id → name of the project's live tasks. */
async function getProjectTasks(projectId: string): Promise<Map<string, string>> {
  const rows = await db
    .select({ id: tasks.id, name: tasks.name })
    .from(tasks)
    .where(and(eq(tasks.projectId, projectId), isNull(tasks.deletedAt)))
  return new Map(rows.map((r) => [r.id, r.name]))
}

describe('getProjectPlanSpans (BR-103a)', () => {
  it('golden: POS and Store tasks without dates span exactly their grid weeks (Mon … Fri)', async () => {
    await seedGolden(db)
    const cindy = await goldenUser('Cindy')
    asUser(cindy)
    const pos = await goldenProjectId('POS Upgrade')
    const body = await okJson<PlanSpansResponse>(
      await callRoute(GET, `/api/projects/${pos}/plan-spans?from=${NOV.from}&to=${NOV.to}`, { id: pos }),
    )
    const names = await getProjectTasks(pos)
    const byName = new Map(body.spans.map((s) => [names.get(s.taskId), [s.start, s.end]]))
    expect(Object.fromEntries(byName)).toEqual({
      'ปรับปรุงระบบ POS หน้าร้าน': ['2026-08-31', '2026-10-02'],
      'ทำ UAT + คู่มือหน้าร้าน': ['2026-09-14', '2026-10-09'],
      'Rollout สาขา': ['2026-11-30', '2027-01-01'],
    })
    expect(body).toMatchObject({ projectId: pos, from: NOV.from, to: NOV.to })

    const peter = await goldenUser('Peter')
    const store = await goldenProjectId('Store Analytics Dashboard')
    const s = await getProjectPlanSpans(db, toSessionUser(peter), store, NOV)
    const storeNames = await getProjectTasks(store)
    expect(Object.fromEntries(s.spans.map((x) => [storeNames.get(x.taskId), [x.start, x.end]]))).toEqual({
      'ทำ dashboard ผู้บริหาร': ['2026-11-02', '2026-12-18'],
      'เก็บ requirement + สรุป': ['2026-11-09', '2026-12-04'],
    })
  })

  it('WEEK/DAY mint, two assignees with their own schedules, deleted assignment, BR-50, parent ≠ children, horizon', async () => {
    const w = await createWorld({ with: ['tasks'] })
    // Tue–Sat person (Saturday half day)
    const tueSat = await makeUser({
      schedule: [2, 3, 4, 5]
        .map((weekday) => ({ weekday, fraction: '1.00' }))
        .concat({ weekday: 6, fraction: '0.50' }),
    })
    const t = await makeTask({ project: w.P, name: 'plan-only', createdBy: w.manager })
    const a1 = await makeAssignment({ task: t, user: w.lead }) // Mon–Fri
    const a2 = await makeAssignment({ task: t, user: tueSat })
    await makeDayAllocations({ assignment: a1, days: { '2026-11-04': 50, '2026-11-05': 100 } }) // first: Wed 4
    await makeAllocation({ assignment: a1, period: '2026-11-09', cd: 300 })
    await makeAllocation({ assignment: a2, period: '2026-11-16', cd: 200 }) // last week → Sat 21 for Tue–Sat
    // a deleted assignment's rows never count
    const gone = await makeAssignment({
      task: t,
      user: w.member,
      deleted: { daysAgo: 1, batch: randomUUID() },
    })
    await makeAllocation({ assignment: gone, period: '2026-12-28', cd: 100 })

    // completed 2026-09-28: rows after its week are not counted (BR-50)
    const done = await makeAssignment({ task: w.tasks.pDone, user: w.lead })
    await makeAllocation({ assignment: done, period: '2026-09-21', cd: 100 })
    await makeAllocation({ assignment: done, period: '2026-10-12', cd: 100 })

    // a parent never takes its children's plan (FR-812); pChildA gets one
    const child = await makeAssignment({ task: w.tasks.pChildA, user: w.lead })
    await makeAllocation({ assignment: child, period: '2026-11-23', cd: 100 })

    // a plan beyond the ± 3-year horizon is not searched
    const far = await makeTask({ project: w.P, name: 'far', createdBy: w.manager })
    const fa = await makeAssignment({ task: far, user: w.lead })
    await makeAllocation({ assignment: fa, period: '2031-01-06', cd: 100 })

    const body = await getProjectPlanSpans(db, toSessionUser(w.lead), w.P.id, NOV)
    const got = new Map(body.spans.map((s) => [s.taskId, [s.start, s.end]]))
    expect(got.get(t.id)).toEqual(['2026-11-04', '2026-11-21'])
    expect(got.get(w.tasks.pDone.id)).toEqual(['2026-09-21', '2026-09-25'])
    expect(got.get(w.tasks.pChildA.id)).toEqual(['2026-11-23', '2026-11-27'])
    expect(got.has(w.tasks.pParent.id)).toBe(false)
    expect(got.has(far.id)).toBe(false)
    // only this project's tasks (masking unchanged: the ids are a subset of GET …/tasks)
    const own = new Set((await getProjectTasks(w.P.id)).keys())
    for (const s of body.spans) expect(own.has(s.taskId)).toBe(true)
    expect(body.spans.map((s) => s.taskId)).toEqual([...body.spans.map((s) => s.taskId)].sort())
  })

  it('lookaroundRange: Mondays, ± PLAN_SPAN_LOOKAROUND_DAYS around the month grid; the repo honours the bound', async () => {
    const r = lookaroundRange(NOV)
    expect(PLAN_SPAN_LOOKAROUND_DAYS).toBe(1096)
    expect(r).toEqual({ from: '2023-10-23', to: '2029-12-03' })
    const w = await createWorld({ with: ['tasks'] })
    const edge = await makeTask({ project: w.P, name: 'edge', createdBy: w.manager })
    const a = await makeAssignment({ task: edge, user: w.lead })
    await makeAllocation({ assignment: a, period: '2029-12-03', cd: 100 }) // = to (exclusive) → outside
    expect(await repo.allocations.plannedWeekBoundsForProject(db, w.P.id, r)).toEqual([])
    await makeAllocation({ assignment: a, period: '2029-11-26', cd: 100 })
    expect(await repo.allocations.plannedWeekBoundsForProject(db, w.P.id, r)).toEqual([
      { assignmentId: a.id, taskId: edge.id, userId: w.lead.id, first: '2029-11-26', last: '2029-11-26' },
    ])
  })

  it('route: outsider → 404, malformed id → 404, a range that is not the month grid → 400', async () => {
    const w = await createWorld({ with: ['tasks'] })
    asUser(w.outsider)
    const url = (id: string, q = `from=${NOV.from}&to=${NOV.to}`) => `/api/projects/${id}/plan-spans?${q}`
    expect((await callRoute(GET, url(w.P.id), { id: w.P.id })).status).toBe(404)
    asUser(w.member)
    expect((await callRoute(GET, url('not-a-uuid'), { id: 'not-a-uuid' })).status).toBe(404)
    expect((await callRoute(GET, url(w.P.id, 'from=2026-11-03&to=2026-12-07'), { id: w.P.id })).status).toBe(
      400,
    )
    expect((await callRoute(GET, url(w.P.id), { id: w.P.id })).status).toBe(200)
  })
})

describe('getTeamPlanSpans (M11.4, FR-669)', () => {
  /** One WEEK row of 100 cd on 2026-11-09 for a fresh assignment of `task` (Mon 9 … Fri 13 for a Mon–Fri user). */
  async function planned(task: { id: string }, user: { id: string }) {
    const a = await makeAssignment({ task, user })
    await makeAllocation({ assignment: a, period: '2026-11-09', cd: 100 })
  }

  it('visible, non-archived projects only; projectId narrows; invisible projectId → 404; ids + dates only', async () => {
    const w = await createWorld({ with: ['tasks'] })
    await planned(w.tasks.pLeaf, w.manager)
    await planned(w.tasks.qTask, w.manager)
    await planned(w.tasks.aTask, w.manager) // archived A → never on the team calendar
    const ids = (r: TeamPlanSpansResponse) => r.spans.map((s) => s.taskId)
    const span = { start: '2026-11-09', end: '2026-11-13' }

    const mgr = await getTeamPlanSpans(db, toSessionUser(w.manager), NOV)
    expect(mgr).toEqual({
      from: NOV.from,
      to: NOV.to,
      spans: [
        { taskId: w.tasks.pLeaf.id, ...span },
        { taskId: w.tasks.qTask.id, ...span },
      ].sort((a, b) => (a.taskId < b.taskId ? -1 : 1)),
    })
    expect(ids(await getTeamPlanSpans(db, toSessionUser(w.member), NOV))).toEqual([w.tasks.pLeaf.id])
    const out = await getTeamPlanSpans(db, toSessionUser(w.outsider), NOV)
    expect(ids(out)).toEqual([w.tasks.qTask.id])
    expect(JSON.stringify(out)).not.toContain(w.P.id)

    // projectId filter
    expect(ids(await getTeamPlanSpans(db, toSessionUser(w.manager), { ...NOV, projectId: w.Q.id }))).toEqual([
      w.tasks.qTask.id,
    ])
    // accessible but archived → no spans (the /api/tasks set excludes archived projects)
    expect(ids(await getTeamPlanSpans(db, toSessionUser(w.member), { ...NOV, projectId: w.A.id }))).toEqual(
      [],
    )
    await expect(
      getTeamPlanSpans(db, toSessionUser(w.member), { ...NOV, projectId: w.Q.id }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' })
    await expect(
      getTeamPlanSpans(db, toSessionUser(w.member), { ...NOV, projectId: randomUUID() }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' })

    // un-archiving A brings its task back
    await db.update(projects).set({ archivedAt: null }).where(eq(projects.id, w.A.id))
    expect(ids(await getTeamPlanSpans(db, toSessionUser(w.member), NOV)).sort()).toEqual(
      [w.tasks.pLeaf.id, w.tasks.aTask.id].sort(),
    )
    // a worker without projects sees nothing
    const lonely = await makeUser()
    expect((await getTeamPlanSpans(db, toSessionUser(lonely), NOV)).spans).toEqual([])
  })

  it('same span rules as the project calendar: deleted assignment, BR-50, parent own-only, deleted task', async () => {
    const w = await createWorld({ with: ['tasks'] })
    const gone = await makeAssignment({
      task: w.tasks.pLeaf,
      user: w.member,
      deleted: { daysAgo: 1, batch: randomUUID() },
    })
    await makeAllocation({ assignment: gone, period: '2026-11-16', cd: 100 })
    const done = await makeAssignment({ task: w.tasks.pDone, user: w.lead })
    await makeAllocation({ assignment: done, period: '2026-09-21', cd: 100 })
    await makeAllocation({ assignment: done, period: '2026-10-12', cd: 100 })
    const child = await makeAssignment({ task: w.tasks.pChildA, user: w.lead })
    await makeAllocation({ assignment: child, period: '2026-11-23', cd: 100 })
    const dead = await makeTask({
      project: w.P,
      name: 'dead',
      createdBy: w.manager,
      deleted: { daysAgo: 1, batch: randomUUID() },
    })
    await planned(dead, w.lead)

    const got = new Map(
      (await getTeamPlanSpans(db, toSessionUser(w.lead), NOV)).spans.map((s) => [s.taskId, [s.start, s.end]]),
    )
    expect(Object.fromEntries(got)).toEqual({
      [w.tasks.pDone.id]: ['2026-09-21', '2026-09-25'],
      [w.tasks.pChildA.id]: ['2026-11-23', '2026-11-27'],
    })
    // the project calendar answers the same for P
    const project = await getProjectPlanSpans(db, toSessionUser(w.lead), w.P.id, NOV)
    expect(project.spans).toEqual(
      (await getTeamPlanSpans(db, toSessionUser(w.lead), { ...NOV, projectId: w.P.id })).spans,
    )
  })

  it('route: bad range / bad projectId → 400, invisible projectId → 404, ok → 200', async () => {
    const w = await createWorld({ with: ['tasks'] })
    const url = (q: string) => `/api/tasks/plan-spans?${q}`
    asUser(w.member)
    expect((await callRoute(GET_TEAM, url(`from=${NOV.from}&to=${NOV.to}`))).status).toBe(200)
    expect((await callRoute(GET_TEAM, url('from=2026-11-03&to=2026-12-07'))).status).toBe(400)
    expect((await callRoute(GET_TEAM, url('from=2026-10-26&to=2027-01-04'))).status).toBe(400) // > 42 days
    expect((await callRoute(GET_TEAM, url(`from=${NOV.from}`))).status).toBe(400)
    expect((await callRoute(GET_TEAM, url(`from=${NOV.from}&to=${NOV.to}&projectId=x`))).status).toBe(400)
    expect((await callRoute(GET_TEAM, url(`from=${NOV.from}&to=${NOV.to}&projectId=${w.Q.id}`))).status).toBe(
      404,
    )
    const ok = await okJson<TeamPlanSpansResponse>(
      await callRoute(GET_TEAM, url(`from=${NOV.from}&to=${NOV.to}&projectId=${w.P.id}`)),
    )
    expect(ok).toEqual({ from: NOV.from, to: NOV.to, spans: [] })
  })
})
