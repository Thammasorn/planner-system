// tests/golden/golden.int.test.ts — golden fixtures through the planning grid (SPEC §11.3, PLAN §4.6; plan/m06 S5.3,
// r8 §2.1–§2.2, §4.5, §6.3). Golden seed + (F2 | F3 on their own), then for each project
// services.grid.buildChunk over [2026-08-31, 2027-01-04) — 18 weeks, an exclusive end that includes the week of
// 2026-12-28 — **and** the same window through GET /api/grid/project/[id] (deep-equal bodies), as the manager.
// Expected numbers come from docs/reference/golden-fixtures.json (`expected.F1`, `tasks[].allocationsCd`) and the r8
// lists (footer weekly totals, row totals); never from SPEC prose. The oracle below is computed independently of
// src/lib/grid (counted = BR-50 week ≤ completedWeek, committed = effective certainty CONFIRMED, BR-37); the client
// footer aggregate (`footerTotals` over `mergeChunks([route body])`, S3.7 — pure) must agree with it and with r8 §6.3.
// M9 (describe 'M9 workload' at the end): F1–F4 (+ F2+F3, F2+F3+F4) through the workload service and route, BR-45 colour
// counts, badges per viewer, person-grid parity and FR-906 impact lines through createTimeOff.
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { weekRange } from '@/domain/dates'
import { viewTone, type LoadTone } from '@/domain/overload'
import type { Cd, ISODate, LoadPair, LoadView, PeriodKey } from '@/domain/types'
import type { GridAssigneeRow, GridMaskedRow, GridResponse, GridTaskRow } from '@/lib/contracts/grid'
import type { WorkloadBadgeResponse, WorkloadPerson, WorkloadResponse } from '@/lib/contracts/workload'
import { footerTotals } from '@/lib/grid/aggregate'
import { mergeChunks } from '@/lib/grid/merge'
import { createTimeOff } from '@/server/actions/time-off'
import { db } from '@/server/db/client'
import * as repo from '@/server/repo'
import * as services from '@/server/services'
import { applyFixture, GOLDEN_PATH, seedGolden, type FixtureId } from '../../scripts/lib/fixtures'
import { asUser } from '../helpers/as-user'
import { allNumbersInteger } from '../helpers/json'
import {
  GOLDEN_PROJECTS,
  GOLDEN_VIEWERS,
  goldenProjectId,
  goldenUser,
  type GoldenProject,
  type GoldenViewer,
} from '../authz/_support/golden'
import { okJson } from '../authz/_support/http'
import { pinToday } from '../authz/rows/_m5'
import { gridGet } from '../authz/rows/_m6'
import { workloadBadgeGet, workloadGet } from '../authz/rows/_m9'

const FROM: ISODate = '2026-08-31'
const TO: ISODate = '2027-01-04'
const TODAY: ISODate = '2026-09-30'
const WEEKS = weekRange(FROM, TO)
const wk = (w: ISODate): PeriodKey => `W:${w}`

interface GoldenJson {
  weekStarts: ISODate[]
  tasks: {
    project: GoldenProject
    name: string
    assignee: GoldenViewer
    allocationsCd: Record<ISODate, Cd>
  }[]
  expected: {
    F1: {
      totalCd: Cd
      committedCd: Cd
      byProject: Record<GoldenProject, { totalCd: Cd; committedCd: Cd }>
      byUserWeek: Partial<
        Record<GoldenViewer, Record<ISODate, { totalCd: Cd; committedCd: Cd; capacityCd: Cd }>>
      >
    }
  }
}
const golden = JSON.parse(readFileSync(GOLDEN_PATH, 'utf8')) as GoldenJson
const F1 = golden.expected.F1

/** r8 §6.3 — per project weekly footer "ภาระรวม" (this project only; absent weeks = 0). */
const R8_FOOTER: Record<GoldenProject, Record<string, Cd>> = {
  'POS Upgrade': {
    '2026-08-31': 500,
    '2026-09-07': 500,
    '2026-09-14': 625,
    '2026-09-21': 500,
    '2026-09-28': 500,
    '2026-10-05': 125,
    '2026-11-30': 250,
    '2026-12-07': 375,
    '2026-12-14': 500,
    '2026-12-21': 500,
    '2026-12-28': 250,
  },
  'Data Warehouse': {
    '2026-08-31': 250,
    '2026-09-07': 250,
    '2026-09-14': 375,
    '2026-09-21': 500,
    '2026-09-28': 500,
    '2026-10-05': 500,
    '2026-10-12': 375,
    '2026-10-19': 250,
  },
  'Mobile App Revamp': {
    '2026-09-07': 250,
    '2026-09-14': 250,
    '2026-09-21': 375,
    '2026-09-28': 625,
    '2026-10-05': 1000,
    '2026-10-12': 1000,
    '2026-10-19': 1000,
    '2026-10-26': 750,
    '2026-11-02': 375,
    '2026-11-09': 250,
  },
  'CRM Migration': {
    '2026-10-05': 250,
    '2026-10-12': 500,
    '2026-10-19': 625,
    '2026-10-26': 625,
    '2026-11-02': 500,
  },
  'Store Analytics Dashboard': {
    '2026-11-02': 250,
    '2026-11-09': 625,
    '2026-11-16': 750,
    '2026-11-23': 750,
    '2026-11-30': 625,
    '2026-12-07': 250,
    '2026-12-14': 250,
  },
}

/** r8 §6.3 — footer capacity under F1 (people = the project's assignees, 500 each every week). */
const R8_CAPACITY: Record<GoldenProject, Cd> = {
  'POS Upgrade': 1500,
  'Data Warehouse': 500,
  'Mobile App Revamp': 1000,
  'CRM Migration': 1000,
  'Store Analytics Dashboard': 1000,
}

/** r8 §4.5 — the "รวม" column per (project, assignee); committed is 0 for CRM, Store and Rollout สาขา (Mint in POS). */
const R8_ROW_TOTAL: Record<string, LoadPair> = {
  'POS Upgrade/Cindy': { total: 1875, committed: 1875 },
  'POS Upgrade/Ivy': { total: 875, committed: 875 },
  'POS Upgrade/Mint': { total: 1875, committed: 0 },
  'Data Warehouse/Peter': { total: 3000, committed: 3000 },
  'Mobile App Revamp/Jack': { total: 3000, committed: 3000 },
  'Mobile App Revamp/Mint': { total: 2875, committed: 2875 },
  'CRM Migration/Cindy': { total: 1500, committed: 0 },
  'CRM Migration/Ivy': { total: 1000, committed: 0 },
  'Store Analytics Dashboard/Peter': { total: 2500, committed: 0 },
  'Store Analytics Dashboard/Jack': { total: 1000, committed: 0 },
}

const ZERO: LoadPair = { total: 0, committed: 0 }
const add = (a: LoadPair, b: LoadPair): LoadPair => ({
  total: a.total + b.total,
  committed: a.committed + b.committed,
})

type Ids = { users: Map<string, GoldenViewer>; projects: Map<GoldenProject, string> }

async function goldenIds(): Promise<Ids> {
  const users = new Map<string, GoldenViewer>()
  for (const n of GOLDEN_VIEWERS) users.set((await goldenUser(n)).id, n)
  const projects = new Map<GoldenProject, string>()
  for (const p of GOLDEN_PROJECTS) projects.set(p, await goldenProjectId(p))
  return { users, projects }
}

/** The project's chunk through the service and the route; the two bodies must be identical JSON. */
async function gridOf(projectId: string): Promise<GridResponse> {
  const manager = asUser(await goldenUser('Manager'))
  const service = await services.grid.buildChunk(
    db,
    manager,
    { kind: 'project', id: projectId },
    { from: FROM, to: TO, expand: [], zoom: 'week', includeOthers: false },
    TODAY,
  )
  const viaRoute = await okJson<GridResponse>(await gridGet(projectId, `from=${FROM}&to=${TO}`))
  const serviceJson = JSON.parse(JSON.stringify(service)) as GridResponse
  expect(viaRoute, 'route body = service result').toEqual(serviceJson)
  return serviceJson
}

const assigneeRows = (g: GridResponse) => g.rows.filter((r): r is GridAssigneeRow => r.kind === 'assignee')
const taskRows = (g: GridResponse) => g.rows.filter((r): r is GridTaskRow => r.kind === 'task')

/** Counted (BR-50) load of one assignee cell, split by its task's effective certainty (BR-37). */
function countedCell(g: GridResponse, row: GridAssigneeRow, week: ISODate): LoadPair {
  const task = taskRows(g).find((t) => t.id === row.taskId)
  expect(task, `task row of ${row.taskAssignmentId}`).toBeDefined()
  const cd = row.cells[wk(week)]?.cd ?? 0
  const counted = task!.completedWeek === null || week <= task!.completedWeek
  if (!counted || cd === 0) return ZERO
  return { total: cd, committed: task!.certainty === 'CONFIRMED' ? cd : 0 }
}

describe('F1 via grid (M6, SPEC §11.3, r8 §2–§4.5/§6.3)', () => {
  it('the window is exactly the 18 golden weeks; the r8 row totals match the JSON plans', () => {
    expect(WEEKS).toEqual(golden.weekStarts)
    expect(WEEKS).toHaveLength(18)
    const fromJson: Record<string, Cd> = {}
    for (const t of golden.tasks)
      fromJson[`${t.project}/${t.assignee}`] = Object.values(t.allocationsCd).reduce((a, b) => a + b, 0)
    expect(fromJson).toEqual(Object.fromEntries(Object.entries(R8_ROW_TOTAL).map(([k, v]) => [k, v.total])))
  })

  it('per project: totals, footer loads and capacities, row totals; across projects: 19 500 / 11 625 and every byUserWeek cell', async () => {
    await seedGolden(db)
    const ids = await goldenIds()
    const nick = (userId: string): GoldenViewer => {
      const n = ids.users.get(userId)
      expect(n, `golden user ${userId}`).toBeDefined()
      return n!
    }
    const byUserWeek = new Map<GoldenViewer, Map<ISODate, LoadPair>>()
    const capacityOf = new Map<GoldenViewer, Partial<Record<PeriodKey, Cd>>>()
    let grand = ZERO
    let cells = 0

    for (const project of GOLDEN_PROJECTS) {
      const g = await gridOf(ids.projects.get(project)!)
      expect(g.context, project).toMatchObject({
        kind: 'project',
        name: project,
        archived: false,
        canEdit: true,
      })
      expect(g.window).toMatchObject({ from: FROM, to: TO, includeOthers: false })
      expect(g.periods.map((p) => p.key)).toEqual(WEEKS.map(wk))
      // M8: still [] — the golden seed has no milestones (A.2's come only from addMilestones; see milestones.int.test.ts)
      expect(g.milestones).toEqual([])

      // row totals (r8 §4.5) and cell shape
      const assignees = assigneeRows(g)
      const expectedPeople = golden.tasks.filter((t) => t.project === project).map((t) => t.assignee)
      expect(assignees.map((r) => nick(r.userId)).sort(), `${project} assignee rows`).toEqual(
        [...expectedPeople].sort(),
      )
      expect(Object.keys(g.people).map(nick).sort(), `${project} people`).toEqual(
        [...new Set(expectedPeople)].sort(),
      )
      for (const r of assignees) {
        expect(r.rowTotal, `${project}/${nick(r.userId)} รวม`).toEqual(
          R8_ROW_TOTAL[`${project}/${nick(r.userId)}`],
        )
        for (const c of Object.values(r.cells)) {
          expect(c).toMatchObject({ resolution: 'WEEK', derived: false })
          if (c && c.cd > 0) cells++
        }
      }

      // the footer users see: src/lib/grid/aggregate#footerTotals over the client model of the route body
      const model = mergeChunks([g])
      expect(model, `${project} client model`).not.toBeNull()
      const shown = footerTotals(model!, { includeOthers: false })
      expect(shown.people.map(nick).sort(), `${project} footer people`).toEqual(
        [...new Set(expectedPeople)].sort(),
      )
      expect(Object.keys(shown.cells), `${project} footer periods`).toEqual(WEEKS.map(wk))

      // per project Σ, footer per week (r8 §6.3), task-total aggregate, footer capacity
      let projectSum = ZERO
      for (const week of WEEKS) {
        let footer = ZERO
        for (const r of assignees) {
          const c = countedCell(g, r, week)
          footer = add(footer, c)
          const u = nick(r.userId)
          const m = byUserWeek.get(u) ?? new Map<ISODate, LoadPair>()
          m.set(week, add(m.get(week) ?? ZERO, c))
          byUserWeek.set(u, m)
        }
        expect(footer.total, `${project} footer ${week}`).toBe(R8_FOOTER[project][week] ?? 0)
        const cell = shown.cells[wk(week)]
        expect(cell?.load.total, `${project} footerTotals ${week}`).toBe(R8_FOOTER[project][week] ?? 0)
        expect(cell?.load, `${project} footerTotals = oracle ${week}`).toEqual(footer)
        expect(cell?.capacityCd, `${project} footerTotals capacity ${week}`).toBe(R8_CAPACITY[project])
        const rootTotals = taskRows(g)
          .filter((t) => t.depth === 0)
          .reduce((acc, t) => add(acc, t.totals[wk(week)] ?? ZERO), ZERO)
        expect(rootTotals, `${project} Σ task totals ${week}`).toEqual(footer)
        const capacity = Object.values(g.people).reduce((a, p) => a + (p.capacity[wk(week)] ?? 0), 0)
        expect(capacity, `${project} footer capacity ${week}`).toBe(R8_CAPACITY[project])
        projectSum = add(projectSum, footer)
      }
      expect(projectSum, project).toEqual({
        total: F1.byProject[project].totalCd,
        committed: F1.byProject[project].committedCd,
      })
      grand = add(grand, projectSum)
      for (const [userId, p] of Object.entries(g.people)) capacityOf.set(nick(userId), p.capacity)
    }

    expect(grand).toEqual({ total: F1.totalCd, committed: F1.committedCd })
    expect(grand).toEqual({ total: 19_500, committed: 11_625 })
    expect(cells, 'non-empty assignee cells = the 57 golden WEEK rows').toBe(57)

    // every expected.F1.byUserWeek cell (57), every other user × week 0 / 0
    let checked = 0
    for (const u of GOLDEN_VIEWERS) {
      for (const week of WEEKS) {
        const want = F1.byUserWeek[u]?.[week]
        const got = byUserWeek.get(u)?.get(week) ?? ZERO
        expect(got, `${u} ${week}`).toEqual(
          want ? { total: want.totalCd, committed: want.committedCd } : ZERO,
        )
        if (want) {
          checked++
          expect(capacityOf.get(u)?.[wk(week)], `${u} capacity ${week}`).toBe(want.capacityCd)
        }
      }
    }
    expect(checked).toBe(57)
  })

  it('F2 (holiday 2026-10-23): POS footer capacity of week 2026-10-19 = 1200 (3 × 400), other weeks 1500', async () => {
    await seedGolden(db)
    await applyFixture(db, 'F2')
    const g = await gridOf(await goldenProjectId('POS Upgrade'))
    for (const week of WEEKS) {
      const capacity = Object.values(g.people).reduce((a, p) => a + (p.capacity[wk(week)] ?? 0), 0)
      expect(capacity, week).toBe(week === '2026-10-19' ? 1200 : 1500)
    }
  })

  it('F3 (Peter on leave 10-05…10-06): DW people[peter].capacity W:2026-10-05 = 300, standard 500', async () => {
    await seedGolden(db)
    await applyFixture(db, 'F3')
    const peter = await goldenUser('Peter')
    const g = await gridOf(await goldenProjectId('Data Warehouse'))
    const p = g.people[peter.id]
    expect(p).toBeDefined()
    expect(p!.capacity[wk('2026-10-05')]).toBe(300)
    expect(p!.standard[wk('2026-10-05')]).toBe(500)
    expect(p!.capacity[wk('2026-09-28')]).toBe(500)
  })
})

// ── M9 workload (SPEC §11.3, r8 §2.3/§4.6/§6.10/§6b, X11; plan/m09 S5.3) ───────────────────────────────────────────────
// Fresh golden seed per case (the worker truncates before each test) + its fixtures, then as the manager
// services.workload.buildTable over [2026-08-31, 2027-01-04) **and** GET /api/workload with the same window (deep-equal
// bodies). Overloads compare with expected.Fn.overloads of the JSON (r8 sortOv); colour counts, badges and the
// reds / greens lists come from plan/research/snippets/r8/facts.json — never re-typed from SPEC prose.

interface GoldenOverload {
  user: GoldenViewer
  week: ISODate
  level: 'RISK' | 'OVER'
  excessCd: Cd
  cause: 'CAPACITY' | 'WORKLOAD' | 'BOTH'
  totalCd: Cd
  committedCd: Cd
  capacityCd: Cd
}
interface GoldenM9Json {
  positions: string[]
  users: { nickname: GoldenViewer; position: string }[]
  expected: Record<FixtureId, { overloads: GoldenOverload[]; setup: { timeOff?: GoldenTimeOff[] } }>
}
interface GoldenTimeOff {
  user: GoldenViewer
  startDate: ISODate
  endDate: ISODate
  half: 'AM' | 'PM' | null
  type: string
}
type ColourKey = 'EMPTY' | 'GREEN' | 'YELLOW' | 'RED'
interface R8Facts {
  colors: Record<FixtureId | 'F1', { total: Partial<Record<ColourKey, number>>; committed: Partial<Record<ColourKey, number>>; reds: string[]; greens: string[] }>
  badges: Record<string, string[]>
}
const goldenM9 = JSON.parse(readFileSync(GOLDEN_PATH, 'utf8')) as GoldenM9Json
const facts = JSON.parse(
  readFileSync(path.join(process.cwd(), 'plan/research/snippets/r8/facts.json'), 'utf8'),
) as R8Facts
const WORKERS: readonly GoldenViewer[] = ['Cindy', 'Ivy', 'Peter', 'Jack', 'Mint']
const TONE_KEY: Record<LoadTone, ColourKey | 'NOCAP'> = {
  empty: 'EMPTY',
  light: 'YELLOW',
  full: 'GREEN',
  over: 'RED',
  noCapacity: 'NOCAP',
}

const sortOv = <T extends { week: string; user: string }>(a: readonly T[]): T[] =>
  [...a].sort((x, y) => x.week.localeCompare(y.week) || x.user.localeCompare(y.user))

async function setupFixtures(fx: readonly FixtureId[]): Promise<void> {
  await seedGolden(db)
  for (const f of fx) await applyFixture(db, f)
}

/** The table through the service and the route as `viewer`; the two bodies must be identical JSON. */
async function workloadTableAs(viewer: GoldenViewer = 'Manager'): Promise<WorkloadResponse> {
  const u = asUser(await goldenUser(viewer))
  const service = await services.workload.buildTable(db, u, { window: { from: FROM, to: TO } }, TODAY)
  const viaRoute = await okJson<WorkloadResponse>(await workloadGet(`from=${FROM}&to=${TO}`))
  const serviceJson = JSON.parse(JSON.stringify(service)) as WorkloadResponse
  expect(viaRoute, 'route body = service result').toEqual(serviceJson)
  return serviceJson
}

function peopleByNick(t: WorkloadResponse, ids: Ids): Map<GoldenViewer, WorkloadPerson> {
  const out = new Map<GoldenViewer, WorkloadPerson>()
  for (const p of t.groups.flatMap((g) => g.people)) {
    const n = ids.users.get(p.userId)
    expect(n, `workload row ${p.userId} is a golden user`).toBeDefined()
    out.set(n!, p)
  }
  return out
}

const overloadsOf = (t: WorkloadResponse, ids: Ids): GoldenOverload[] =>
  sortOv(
    t.overloads.map((o) => ({
      user: ids.users.get(o.userId)!,
      week: o.week,
      level: o.level,
      excessCd: o.excess,
      cause: o.cause,
      totalCd: o.total,
      committedCd: o.committed,
      capacityCd: o.capacity,
    })),
  )

const expectedOverloads = (fx: readonly FixtureId[]): GoldenOverload[] =>
  sortOv(fx.flatMap((f) => goldenM9.expected[f].overloads))

/** BR-45 colour counts of the 5 × 18 cells in one view + the cells of each colour as r8 writes them ("Jack 10-19"). */
function colours(people: Map<GoldenViewer, WorkloadPerson>, view: LoadView) {
  const counts: Partial<Record<ColourKey | 'NOCAP', number>> = {}
  const cellsOf: Partial<Record<ColourKey | 'NOCAP', string[]>> = {}
  for (const n of WORKERS)
    for (const week of WEEKS) {
      const c = people.get(n)!.cells[week]!
      const key = TONE_KEY[viewTone({ total: c.total, committed: c.committed }, c.capacity, view).tone]
      counts[key] = (counts[key] ?? 0) + 1
      ;(cellsOf[key] ??= []).push(`${n} ${week.slice(5)}`)
    }
  return { counts, cellsOf }
}

/** r8 counts include the Manager's 18 empty cells (6 × 18); the table has no Manager row (M9-D3). */
const withoutManager = (c: Partial<Record<ColourKey, number>>) => ({ ...c, EMPTY: (c.EMPTY ?? 0) - WEEKS.length })
const r8Cells = (list: readonly string[]) => list.map((s) => s.split(' (')[0]!).sort()

describe('M9 workload (SPEC §11.3, r8 §4.6)', () => {
  it('F1: every byUserWeek cell (57), every other cell 0/0/500, Σ 19 500 / 11 625, no overload, Manager absent, groups by position', async () => {
    await setupFixtures([])
    const ids = await goldenIds()
    const t = await workloadTableAs()
    expect(t.weeks).toEqual(WEEKS)
    expect(t.overloads).toEqual([])
    expect(allNumbersInteger(t), 'BR-03').toBe(true)
    const people = peopleByNick(t, ids)
    expect([...people.keys()].sort(), 'M9-D3: workers with memberships; the Manager has none').toEqual([...WORKERS].sort())
    // groups follow positions order, empty groups omitted (M9-D3)
    const used = new Set(goldenM9.users.filter((u) => WORKERS.includes(u.nickname)).map((u) => u.position))
    expect(t.groups.map((g) => g.name)).toEqual(goldenM9.positions.filter((p) => used.has(p)))
    let sum = ZERO
    let listed = 0
    for (const n of WORKERS)
      for (const week of WEEKS) {
        const c = people.get(n)!.cells[week]
        expect(c, `${n} ${week}`).toBeDefined()
        const want = F1.byUserWeek[n]?.[week]
        if (want) listed++
        expect({ total: c!.total, committed: c!.committed, capacity: c!.capacity }, `${n} ${week}`).toEqual(
          want
            ? { total: want.totalCd, committed: want.committedCd, capacity: want.capacityCd }
            : { total: 0, committed: 0, capacity: 500 },
        )
        expect(c!.level, `${n} ${week}`).toBe('OK')
        expect(c!.cause).toBeNull()
        sum = add(sum, c!)
      }
    expect(listed).toBe(57)
    expect({ total: sum.total, committed: sum.committed }).toEqual({ total: 19_500, committed: 11_625 })
  })

  it.each([
    ['F2', ['F2']],
    ['F3', ['F3']],
    ['F4', ['F4']],
    ['F2 + F3 (the §8.5 state, 3 items)', ['F2', 'F3']],
    ['F2 + F3 + F4 (4 items)', ['F2', 'F3', 'F4']],
  ] as const)('%s: overloads = expected.Fn.overloads (r8 sortOv); no other non-OK cell', async (_label, fx) => {
    await setupFixtures(fx)
    const ids = await goldenIds()
    const t = await workloadTableAs()
    const want = expectedOverloads(fx)
    expect(want).toHaveLength({ 1: fx[0] === 'F2' ? 2 : 1, 2: 3, 3: 4 }[fx.length])
    expect(overloadsOf(t, ids)).toEqual(want)
    const people = peopleByNick(t, ids)
    const nonOk = WORKERS.flatMap((n) =>
      WEEKS.filter((wk_) => people.get(n)!.cells[wk_]!.level !== 'OK').map((wk_) => `${n} ${wk_}`),
    ).sort()
    expect(nonOk).toEqual(want.map((o) => `${o.user} ${o.week}`).sort())
    for (const o of want) {
      const c = people.get(o.user)!.cells[o.week]!
      expect({ level: c.level, excess: c.excess, cause: c.cause, standard: c.standard }).toEqual({
        level: o.level,
        excess: o.excessCd,
        cause: o.cause,
        standard: 500,
      })
    }
    for (const o of t.overloads) expect(o.href).toBe(`/people/${o.userId}/plan?week=${o.week}`)
  })

  it.each(['F1', 'F2', 'F3', 'F4'] as const)(
    '%s: BR-45 colour counts per view (r8 §4.6 minus the Manager’s 18 empty cells) and the red / green cells',
    async (f) => {
      await setupFixtures(f === 'F1' ? [] : [f])
      const ids = await goldenIds()
      const people = peopleByNick(await workloadTableAs(), ids)
      const all = colours(people, 'ALL')
      const committed = colours(people, 'COMMITTED')
      expect(all.counts, `${f} ALL`).toEqual(withoutManager(facts.colors[f].total))
      expect(committed.counts, `${f} COMMITTED`).toEqual(withoutManager(facts.colors[f].committed))
      expect((all.cellsOf.RED ?? []).sort(), `${f} reds`).toEqual(r8Cells(facts.colors[f].reds))
      expect((all.cellsOf.GREEN ?? []).sort(), `${f} greens`).toEqual(r8Cells(facts.colors[f].greens))
      if (f === 'F4') {
        // r8 G7: Cindy 10-12 is red in ALL but its level is RISK; in COMMITTED it is empty (0 / 200)
        const cindy = people.get('Cindy')!.cells['2026-10-12']!
        expect(cindy.level).toBe('RISK')
        expect(viewTone(cindy, cindy.capacity, 'COMMITTED').tone).toBe('empty')
      }
      if (f === 'F2') expect(viewTone(people.get('Cindy')!.cells['2026-10-19']!, 400, 'ALL').tone).toBe('full')
    },
  )

  it.each([
    ['F1', []],
    ['F2', ['F2']],
    ['F3', ['F3']],
    ['F4', ['F4']],
    ['F2+F3', ['F2', 'F3']],
  ] as const)('%s: FR-1007 badge per viewer (r8 §6b)', async (key, fx) => {
    await setupFixtures(fx)
    const want = Object.fromEntries(
      facts.badges[key]!.map((s) => {
        const [n, c] = s.split(' ')
        return [n!, Number(c)]
      }),
    )
    const got: Record<string, number> = {}
    for (const v of GOLDEN_VIEWERS) {
      const u = asUser(await goldenUser(v))
      const body = await okJson<WorkloadBadgeResponse>(await workloadBadgeGet())
      expect(body).toMatchObject({ from: '2026-09-28', to: '2026-10-26' })
      expect(await services.workload.badgeCount(db, u, TODAY), `${v} service = route`).toEqual(body)
      got[v] = body.overCount
    }
    expect(got).toEqual(want)
  })

  it.each([
    ['F1', []],
    ['F3', ['F3']],
  ] as const)(
    '%s: person grid parity — Σ (counted assignee cells + masked row) per week = the workload cell, as Manager and as Cindy',
    async (_label, fx) => {
      await setupFixtures(fx)
      const ids = await goldenIds()
      const people = peopleByNick(await workloadTableAs(), ids)
      for (const viewerNick of ['Manager', 'Cindy'] as const) {
        const viewer = asUser(await goldenUser(viewerNick))
        for (const n of WORKERS) {
          const target = people.get(n)!
          const g = await services.grid.buildChunk(
            db,
            viewer,
            { kind: 'person', id: target.userId },
            { from: FROM, to: TO, expand: [], zoom: 'week', includeOthers: false },
            TODAY,
          )
          const masked = g.rows.filter((r): r is GridMaskedRow => r.kind === 'masked')
          expect(masked.length, `${viewerNick} → ${n}: at most one masked row`).toBeLessThanOrEqual(1)
          if (viewerNick === 'Manager') expect(masked, 'the manager sees every project').toEqual([])
          for (const week of WEEKS) {
            let sum = masked[0]?.totals[wk(week)] ?? ZERO
            for (const r of assigneeRows(g)) {
              expect(r.userId, 'person grid rows belong to the person').toBe(target.userId)
              sum = add(sum, countedCell(g, r, week))
            }
            const c = target.cells[week]!
            expect(sum, `${viewerNick} → ${n} ${week}`).toEqual({ total: c.total, committed: c.committed })
          }
        }
      }
    },
  )

  it.each(['F3', 'F4'] as const)(
    '%s through createTimeOff (FR-906): impact.overloads = the r8 §6b line; the table then lists the same overload',
    async (f) => {
      await seedGolden(db)
      const ids = await goldenIds()
      const [leave] = goldenM9.expected[f].setup.timeOff ?? []
      expect(leave).toBeDefined()
      const owner = await goldenUser(leave!.user)
      const leaveTypeId = await repo.leaveTypes.findIdByName(db, leave!.type)
      expect(leaveTypeId).not.toBeNull()
      asUser(owner)
      pinToday()
      const r = await createTimeOff({
        leaveTypeId: leaveTypeId!,
        startDate: leave!.startDate,
        endDate: leave!.endDate,
        half: leave!.half,
      })
      expect(r.ok, JSON.stringify(r)).toBe(true)
      if (!r.ok) return
      const [o] = goldenM9.expected[f].overloads
      expect(r.impact.overloads).toHaveLength(1)
      const line = r.impact.overloads[0]!
      expect(line).toMatchObject({
        week: o!.week,
        before: { level: 'OK', excessCd: 0 },
        after: { level: o!.level, excessCd: o!.excessCd, cause: o!.cause },
        load: { total: o!.totalCd, committed: o!.committedCd },
        capacityCd: o!.capacityCd,
        standardCd: 500,
        href: `/people/${owner.id}/plan?week=${o!.week}`,
      })
      // own leave → every project of the owner is visible: no masked part, parts sum to the load
      expect(line.parts.filter((p) => p.projectId === null)).toEqual([])
      expect(line.parts.reduce((a, p) => add(a, p.load), ZERO)).toEqual(line.load)
      expect(overloadsOf(await workloadTableAs(), ids)).toEqual(expectedOverloads([f]))
    },
  )
})
