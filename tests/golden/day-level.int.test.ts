// tests/golden/day-level.int.test.ts — golden fixtures at day resolution (SPEC §5.3 BR-20…BR-24 + invariants, §5.6
// BR-40 at day level, §11.3; plan/m07 S4.3, r8 §4.7/§6.7/§6.8/§6.10). Fresh golden seed (+ F2 | F3 | F4 |
// addDayExample) per test; every read goes through GET /api/grid/project/[id] as the manager, every write through
// `saveAllocations` as the project's LEAD. Expected derived values and materialisation numbers are the r8 tables
// (largest remainder, ties to the earlier day; M7-D7 clamp-and-spill), never re-derived from src/lib/grid.
// The BR-40 day level is an independent oracle written from SPEC §5.6 (committed > cap → OVER; total > cap → RISK)
// over the route's day cells and `people[u].capacity['D:…']` (M7-D19; missing = 0), so the test does not depend on
// the implementation it checks (same stance as golden.int.test.ts).
import { describe, expect, it } from 'vitest'
import { daysOfWeek, isoWeekday, weekRange, weekStart } from '@/domain/dates'
import type { Cd, ISODate, LoadPair, PeriodKey } from '@/domain/types'
import type { GridAssigneeRow, GridResponse, GridTaskRow } from '@/lib/contracts/grid'
import { db } from '@/server/db/client'
import { addDayExample, applyFixture, DAY_EXAMPLE, seedGolden, type FixtureId } from '../../scripts/lib/fixtures'
import { asUser } from '../helpers/as-user'
import { allocationRows, assignmentVersion } from '../helpers/factories'
import {
  GOLDEN_PROJECTS,
  GOLDEN_VIEWERS,
  goldenProjectId,
  goldenUser,
  type GoldenProject,
  type GoldenViewer,
} from '../authz/_support/golden'
import { okJson } from '../authz/_support/http'
import { gridGet, save } from '../authz/rows/_m6'

const FROM: ISODate = '2026-08-31'
const TO: ISODate = '2027-01-04'
const WEEKS = weekRange(FROM, TO) // 18 golden weeks
const wk = (w: ISODate): PeriodKey => `W:${w}`
const dk = (d: ISODate): PeriodKey => `D:${d}`
const weekdays = (w: ISODate): ISODate[] => daysOfWeek(w).filter((d) => isoWeekday(d) <= 5)
const ZERO: LoadPair = { total: 0, committed: 0 }
const add = (a: LoadPair, b: LoadPair): LoadPair => ({ total: a.total + b.total, committed: a.committed + b.committed })

type Level = 'OK' | 'RISK' | 'OVER'
/** SPEC §5.6 BR-40, per person per day: committed > cap → OVER; total > cap → RISK; else OK. */
const levelOf = (load: LoadPair, cap: Cd): Level =>
  load.committed > cap ? 'OVER' : load.total > cap ? 'RISK' : 'OK'

/** The 8-week chunks of [FROM, TO) the client would request (one request per chunk). */
function chunks(): { from: ISODate; to: ISODate }[] {
  const out: { from: ISODate; to: ISODate }[] = []
  for (let i = 0; i < WEEKS.length; i += 8) {
    const from = WEEKS[i]!
    const to = i + 8 < WEEKS.length ? WEEKS[i + 8]! : TO
    out.push({ from, to })
  }
  return out
}

async function asManager(): Promise<void> {
  asUser(await goldenUser('Manager'))
}

/** The project's grid through the route, as the manager. */
async function grid(project: GoldenProject, qs: string): Promise<GridResponse> {
  await asManager()
  return okJson<GridResponse>(await gridGet(await goldenProjectId(project), qs))
}

const assigneeRows = (g: GridResponse) => g.rows.filter((r): r is GridAssigneeRow => r.kind === 'assignee')
const taskOf = (g: GridResponse, row: GridAssigneeRow): GridTaskRow => {
  const t = g.rows.find((r): r is GridTaskRow => r.kind === 'task' && r.id === row.taskId)
  expect(t, `task row of ${row.taskAssignmentId}`).toBeDefined()
  return t!
}

/** The assignee row of `nickname` that carries a plan in `week` (golden: one task per person per project). */
async function rowOf(g: GridResponse, nickname: GoldenViewer, week: ISODate): Promise<GridAssigneeRow> {
  const u = await goldenUser(nickname)
  const hits = assigneeRows(g).filter((r) => r.userId === u.id && (r.cells[wk(week)]?.cd ?? 0) > 0)
  expect(hits, `${nickname} row with a plan in ${week}`).toHaveLength(1)
  return hits[0]!
}

/** Mon–Fri values of an expanded week (missing D: cell = 0). */
const dayValues = (row: GridAssigneeRow, week: ISODate): Cd[] =>
  weekdays(week).map((d) => row.cells[dk(d)]?.cd ?? 0)

/** §5.3 invariant on real data: in every expanded week of every assignee row, Σ D: cells = W: cell. */
function expectDaySumsEqualWeek(g: GridResponse, label: string): number {
  const expanded = g.periods.filter((p) => p.kind === 'WEEK' && p.expanded).map((p) => p.weekStart)
  let checked = 0
  for (const r of assigneeRows(g))
    for (const w of expanded) {
      const total = r.cells[wk(w)]?.cd ?? 0
      const days = daysOfWeek(w).reduce((a, d) => a + (r.cells[dk(d)]?.cd ?? 0), 0)
      expect(days, `${label} ${r.taskAssignmentId} Σ D:${w} = W`).toBe(total)
      if (total > 0) checked++
    }
  return checked
}

/** Per person per day (counted BR-50 per week, committed by effective certainty BR-37) over every project's day grid. */
async function dayLoads(qsOf: (c: { from: ISODate; to: ISODate }) => string): Promise<{
  load: Map<string, Map<ISODate, LoadPair>>
  cap: Map<string, Partial<Record<PeriodKey, Cd>>>
  sums: number
}> {
  const load = new Map<string, Map<ISODate, LoadPair>>()
  const cap = new Map<string, Partial<Record<PeriodKey, Cd>>>()
  let sums = 0
  for (const project of GOLDEN_PROJECTS)
    for (const c of chunks()) {
      const g = await grid(project, qsOf(c))
      sums += expectDaySumsEqualWeek(g, `${project} ${c.from}`)
      for (const [userId, p] of Object.entries(g.people)) cap.set(userId, { ...cap.get(userId), ...p.capacity })
      for (const r of assigneeRows(g)) {
        const t = taskOf(g, r)
        const m = load.get(r.userId) ?? new Map<ISODate, LoadPair>()
        for (const [key, cell] of Object.entries(r.cells)) {
          if (!key.startsWith('D:') || !cell || cell.cd === 0) continue
          const d = key.slice(2)
          // BR-50 per week (M7-D14): a day counts iff its week ≤ the task's completion week (or the task is open)
          if (t.completedWeek !== null && weekStart(d) > t.completedWeek) continue
          const pair = { total: cell.cd, committed: t.certainty === 'CONFIRMED' ? cell.cd : 0 }
          m.set(d, add(m.get(d) ?? ZERO, pair))
        }
        load.set(r.userId, m)
      }
    }
  return { load, cap, sums }
}

async function fresh(fixture?: FixtureId): Promise<void> {
  await seedGolden(db)
  if (fixture) await applyFixture(db, fixture)
}

describe('day level — derived values (BR-20/BR-21, r8 §4.7)', () => {
  it('F1: Ivy 09-28 = 50 × 5 (AC-804 week) and Peter 10-12 = 75 × 5, dashed (derived) WEEK cells', async () => {
    await fresh()
    const pos = await grid('POS Upgrade', 'from=2026-09-28&to=2026-11-23&expand=2026-09-28')
    const ivy = await rowOf(pos, 'Ivy', '2026-09-28')
    expect(dayValues(ivy, '2026-09-28')).toEqual([50, 50, 50, 50, 50])
    for (const d of weekdays('2026-09-28'))
      expect(ivy.cells[dk(d)], d).toMatchObject({ resolution: 'WEEK', derived: true })
    expect(ivy.cells[wk('2026-09-28')]).toMatchObject({ cd: 250, resolution: 'WEEK', derived: false })
    expectDaySumsEqualWeek(pos, 'POS')

    const dw = await grid('Data Warehouse', 'from=2026-09-28&to=2026-11-23&expand=2026-10-12')
    expect(dayValues(await rowOf(dw, 'Peter', '2026-10-12'), '2026-10-12')).toEqual([75, 75, 75, 75, 75])
    expectDaySumsEqualWeek(dw, 'DW')
  })

  it('F2 (holiday Fri 10-23): week 10-19 Peter/Ivy 63,63,62,62,0 · Cindy 94,94,94,93,0 · Jack/Mint 125 × 4, 0', async () => {
    await fresh('F2')
    const qs = 'from=2026-09-28&to=2026-11-23&expand=2026-10-19'
    const dw = await grid('Data Warehouse', qs)
    expect(dayValues(await rowOf(dw, 'Peter', '2026-10-19'), '2026-10-19')).toEqual([63, 63, 62, 62, 0])
    const crm = await grid('CRM Migration', qs)
    expect(dayValues(await rowOf(crm, 'Ivy', '2026-10-19'), '2026-10-19')).toEqual([63, 63, 62, 62, 0])
    expect(dayValues(await rowOf(crm, 'Cindy', '2026-10-19'), '2026-10-19')).toEqual([94, 94, 94, 93, 0])
    const mobile = await grid('Mobile App Revamp', qs)
    for (const n of ['Jack', 'Mint'] as const) {
      const row = await rowOf(mobile, n, '2026-10-19')
      // pure BR-21 values are displayed even above 1.00/day (M7-D8)
      expect(dayValues(row, '2026-10-19'), n).toEqual([125, 125, 125, 125, 0])
      expect(row.cells[dk('2026-10-19')], n).toMatchObject({ derived: true })
    }
    for (const g of [dw, crm, mobile]) expectDaySumsEqualWeek(g, g.context.name)
  })

  it('F3 (Peter on leave Mon–Tue): DW week 10-05 = 0,0,167,167,166', async () => {
    await fresh('F3')
    const dw = await grid('Data Warehouse', 'from=2026-09-28&to=2026-11-23&expand=2026-10-05')
    const row = await rowOf(dw, 'Peter', '2026-10-05')
    expect(dayValues(row, '2026-10-05')).toEqual([0, 0, 167, 167, 166])
    const peter = await goldenUser('Peter')
    const cap = dw.people[peter.id]!.capacity
    expect(weekdays('2026-10-05').map((d) => cap[dk(d)] ?? 0)).toEqual([0, 0, 100, 100, 100])
    expectDaySumsEqualWeek(dw, 'DW')
  })

  it('F4 (Cindy on leave Mon–Wed): CRM week 10-12 = 0,0,0,125,125', async () => {
    await fresh('F4')
    const crm = await grid('CRM Migration', 'from=2026-09-28&to=2026-11-23&expand=2026-10-12')
    expect(dayValues(await rowOf(crm, 'Cindy', '2026-10-12'), '2026-10-12')).toEqual([0, 0, 0, 125, 125])
    expectDaySumsEqualWeek(crm, 'CRM')
  })
})

describe('day level — BR-40 per day (X06, r8 §6.7)', () => {
  const zoomDay = (c: { from: ISODate; to: ISODate }) => `from=${c.from}&to=${c.to}&zoom=day`

  async function levels(): Promise<Map<string, Map<ISODate, Level>> & { sums?: number }> {
    const { load, cap, sums } = await dayLoads(zoomDay)
    const out = new Map<string, Map<ISODate, Level>>()
    for (const [userId, days] of load) {
      const m = new Map<ISODate, Level>()
      for (const [d, l] of days) m.set(d, levelOf(l, cap.get(userId)?.[dk(d)] ?? 0))
      out.set(userId, m)
    }
    return Object.assign(out, { sums })
  }
  const notOk = (m: Map<ISODate, Level> | undefined) =>
    Object.fromEntries([...(m ?? new Map<ISODate, Level>())].filter(([, l]) => l !== 'OK'))

  it('F1: zoom=day over the 18 golden weeks (one request per 8-week chunk) → no day above OK; Σ D = W everywhere', async () => {
    await fresh()
    const all = await levels()
    expect(all.sums, 'non-empty expanded assignee weeks checked (the 57 golden WEEK rows)').toBe(57)
    for (const n of GOLDEN_VIEWERS) expect(notOk(all.get((await goldenUser(n)).id)), n).toEqual({})
  })

  it('F2: Jack and Mint OVER on 10-19…10-22 (125 / 100), nobody else above OK', async () => {
    await fresh('F2')
    const all = await levels()
    const over = { '2026-10-19': 'OVER', '2026-10-20': 'OVER', '2026-10-21': 'OVER', '2026-10-22': 'OVER' }
    for (const n of GOLDEN_VIEWERS)
      expect(notOk(all.get((await goldenUser(n)).id)), n).toEqual(n === 'Jack' || n === 'Mint' ? over : {})
  })

  it('F3: Peter OVER on 10-07…10-09, nobody else above OK', async () => {
    await fresh('F3')
    const all = await levels()
    const over = { '2026-10-07': 'OVER', '2026-10-08': 'OVER', '2026-10-09': 'OVER' }
    for (const n of GOLDEN_VIEWERS)
      expect(notOk(all.get((await goldenUser(n)).id)), n).toEqual(n === 'Peter' ? over : {})
  })

  it('F4: Cindy RISK (tentative CRM) on 10-15 and 10-16, nobody else above OK', async () => {
    await fresh('F4')
    const all = await levels()
    for (const n of GOLDEN_VIEWERS)
      expect(notOk(all.get((await goldenUser(n)).id)), n).toEqual(
        n === 'Cindy' ? { '2026-10-15': 'RISK', '2026-10-16': 'RISK' } : {},
      )
  })
})

describe('day level — BR-22 materialisation with clamp-and-spill (M7-D7, r8 G1/G2)', () => {
  /** One DAY edit through saveAllocations as `lead`; returns the stored DAY values Mon–Fri of `week`. */
  async function editDay(
    project: GoldenProject,
    lead: GoldenViewer,
    person: GoldenViewer,
    week: ISODate,
    date: ISODate,
    cd: Cd,
  ): Promise<{ stored: Cd[]; before: { total: Cd; derived: Cd }; warnings: string[] }> {
    const g = await grid(project, `from=2026-09-28&to=2026-11-23&expand=${week}`)
    const row = await rowOf(g, person, week)
    const before = { total: row.cells[wk(week)]!.cd, derived: row.cells[dk(date)]?.cd ?? 0 }
    asUser(await goldenUser(lead))
    const r = await save({
      items: [
        {
          taskAssignmentId: row.taskAssignmentId,
          baseVersion: await assignmentVersion(row.taskAssignmentId),
          changes: [{ granularity: 'DAY', period: date, cd }],
        },
      ],
      clientOpId: `golden-m7-${person}-${date}`,
    })
    expect(r.ok, JSON.stringify(r)).toBe(true)
    const rows = await allocationRows(row.taskAssignmentId, week)
    expect(rows.every((x) => x.granularity === 'DAY'), 'DELETE WEEK → INSERT DAY').toBe(true)
    // R20 / BR-26: every stored day ≤ 1.00, zeros are not stored
    for (const x of rows) expect(x.cd > 0 && x.cd <= 100, `${x.periodStart} = ${x.cd}`).toBe(true)
    const byDate = new Map(rows.map((x) => [x.periodStart, x.cd]))
    return {
      stored: weekdays(week).map((d) => byDate.get(d) ?? 0),
      before,
      warnings: r.ok ? r.warnings.map((x) => x.code) : [],
    }
  }

  it('F2 Jack (Mobile LEAD) Mon 10-19 = 1.0 → [100,100,100,100,75] (spill onto the holiday), total 475', async () => {
    await fresh('F2')
    const r = await editDay('Mobile App Revamp', 'Jack', 'Jack', '2026-10-19', '2026-10-19', 100)
    expect(r.stored).toEqual([100, 100, 100, 100, 75])
    expect(r.stored.reduce((a, b) => a + b, 0)).toBe(r.before.total - r.before.derived + 100)
    expect(r.warnings).toContain('SPILLED_OVER_DAY_LIMIT')
  })

  it('F3 Peter (DW LEAD) Wed 10-07 = 0.5 → [100,33,50,100,100] (spill onto the leave days), total 383', async () => {
    await fresh('F3')
    const r = await editDay('Data Warehouse', 'Peter', 'Peter', '2026-10-05', '2026-10-07', 50)
    expect(r.stored).toEqual([100, 33, 50, 100, 100])
    expect(r.stored.reduce((a, b) => a + b, 0)).toBe(r.before.total - r.before.derived + 50)
    expect(r.warnings).toContain('SPILLED_OVER_DAY_LIMIT')
  })

  it('F4 Cindy (CRM LEAD) Thu 10-15 = 1.0 → [25,0,0,100,100], total 225', async () => {
    await fresh('F4')
    const r = await editDay('CRM Migration', 'Cindy', 'Cindy', '2026-10-12', '2026-10-15', 100)
    expect(r.stored).toEqual([25, 0, 0, 100, 100])
    expect(r.stored.reduce((a, b) => a + b, 0)).toBe(r.before.total - r.before.derived + 100)
    expect(r.warnings).toContain('SPILLED_OVER_DAY_LIMIT')
  })
})

describe('day level — addDayExample (SPEC A.2, M7-D16, r8 §6.10) and F1 week totals', () => {
  /** Counted (BR-50) total / committed over every project's week-zoom grid; per project and per (user, week). */
  async function weekTotals(): Promise<{
    grand: LoadPair
    byProject: Map<GoldenProject, LoadPair>
    byUserWeek: Map<string, Map<ISODate, Cd>>
  }> {
    let grand = ZERO
    const byProject = new Map<GoldenProject, LoadPair>()
    const byUserWeek = new Map<string, Map<ISODate, Cd>>()
    for (const project of GOLDEN_PROJECTS) {
      const g = await grid(project, `from=${FROM}&to=${TO}`)
      let sum = ZERO
      for (const r of assigneeRows(g)) {
        const t = taskOf(g, r)
        const m = byUserWeek.get(r.userId) ?? new Map<ISODate, Cd>()
        for (const week of WEEKS) {
          const cd = r.cells[wk(week)]?.cd ?? 0
          if (cd === 0 || (t.completedWeek !== null && week > t.completedWeek)) continue
          sum = add(sum, { total: cd, committed: t.certainty === 'CONFIRMED' ? cd : 0 })
          m.set(week, (m.get(week) ?? 0) + cd)
        }
        byUserWeek.set(r.userId, m)
      }
      byProject.set(project, sum)
      grand = add(grand, sum)
    }
    return { grand, byProject, byUserWeek }
  }

  it('F1 week-level totals are unchanged by M7: 19 500 / 11 625', async () => {
    await fresh()
    expect((await weekTotals()).grand).toEqual({ total: 19_500, committed: 11_625 })
  })

  it('F1 + addDayExample: 19 600 / 11 725, Mobile 5 975, Jack 09-07 = 300, Mint 09-07 = 50; Kickoff rows are DAY cells', async () => {
    await fresh()
    await addDayExample(db)
    const t = await weekTotals()
    expect(t.grand).toEqual({ total: 19_600, committed: 11_725 })
    expect(t.byProject.get('Mobile App Revamp')?.total).toBe(5_975)
    const jack = await goldenUser('Jack')
    const mint = await goldenUser('Mint')
    expect(t.byUserWeek.get(jack.id)?.get('2026-09-07')).toBe(300)
    expect(t.byUserWeek.get(mint.id)?.get('2026-09-07')).toBe(50)

    const g = await grid('Mobile App Revamp', `from=${FROM}&to=2026-10-26&zoom=day`)
    const kickoff = g.rows.find((r): r is GridTaskRow => r.kind === 'task' && r.name === DAY_EXAMPLE.task)
    expect(kickoff, DAY_EXAMPLE.task).toBeDefined()
    const rows = assigneeRows(g).filter((r) => r.taskId === kickoff!.id)
    expect(rows.map((r) => r.userId).sort()).toEqual([jack.id, mint.id].sort())
    for (const r of rows) {
      expect(r.cells[dk(DAY_EXAMPLE.day)]).toMatchObject({ cd: 50, resolution: 'DAY', derived: false })
      expect(r.cells[wk('2026-09-07')]).toMatchObject({ cd: 50, resolution: 'DAY', days: { [DAY_EXAMPLE.day]: 50 } })
    }
    expectDaySumsEqualWeek(g, 'Mobile')
  })
})
