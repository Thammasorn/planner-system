// tests/golden/golden.int.test.ts — golden fixtures through the planning grid (SPEC §11.3, PLAN §4.6; plan/m06 S5.3,
// r8 §2.1–§2.2, §4.5, §6.3). Golden seed + (F2 | F3 on their own), then for each project
// services.grid.buildChunk over [2026-08-31, 2027-01-04) — 18 weeks, an exclusive end that includes the week of
// 2026-12-28 — **and** the same window through GET /api/grid/project/[id] (deep-equal bodies), as the manager.
// Expected numbers come from docs/reference/golden-fixtures.json (`expected.F1`, `tasks[].allocationsCd`) and the r8
// lists (footer weekly totals, row totals); never from SPEC prose. The oracle below is computed independently of
// src/lib/grid (counted = BR-50 week ≤ completedWeek, committed = effective certainty CONFIRMED, BR-37); the client
// footer aggregate (`footerTotals` over `mergeChunks([route body])`, S3.7 — pure) must agree with it and with r8 §6.3.
// M9 adds F2–F4 overloads through the workload service and the person grid.
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { weekRange } from '@/domain/dates'
import type { Cd, ISODate, LoadPair, PeriodKey } from '@/domain/types'
import type { GridAssigneeRow, GridResponse, GridTaskRow } from '@/lib/contracts/grid'
import { footerTotals } from '@/lib/grid/aggregate'
import { mergeChunks } from '@/lib/grid/merge'
import { db } from '@/server/db/client'
import * as services from '@/server/services'
import { applyFixture, GOLDEN_PATH, seedGolden } from '../../scripts/lib/fixtures'
import { asUser } from '../helpers/as-user'
import {
  GOLDEN_PROJECTS,
  GOLDEN_VIEWERS,
  goldenProjectId,
  goldenUser,
  type GoldenProject,
  type GoldenViewer,
} from '../authz/_support/golden'
import { okJson } from '../authz/_support/http'
import { gridGet } from '../authz/rows/_m6'

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
