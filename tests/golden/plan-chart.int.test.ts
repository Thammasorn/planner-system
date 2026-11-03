// tests/golden/plan-chart.int.test.ts — the M7.1 load chart on F1 (SPEC §5.12 BR-104, FR-813, AC-807, §11.3;
// plan/m07.1 S5.3, M7.1-D3). The chart is computed client-side from the grid chunk (`memberLoadSeries` over
// `mergeChunks([chunk])`), so this suite builds the POS chunk through `services.grid.buildChunk` on the golden seed and
// checks the series against (a) the AC-807 numbers, (b) an oracle computed straight from the chunk rows (BR-50 counted,
// BR-37 view, BR-40 level, the footer's integer half-up pct), (c) the JSON's F1 byUserWeek (Σ over all projects =
// "รวมงานโปรเจคอื่น" on), and (d) BR-104's invariant: Σ lines per week = the footer's "ภาระรวม" — every week
// 2026-09-14…2026-10-26, both switch states, all three views.
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { viewLoad } from '@/domain/certainty'
import { overloadLevel } from '@/domain/overload'
import { loadPct } from '@/lib/load/display'
import type { Cd, ISODate, LoadPair, LoadView, PeriodKey } from '@/domain/types'
import type { GridAssigneeRow, GridResponse, GridTaskRow } from '@/lib/contracts/grid'
import { footerTotals, footerValue } from '@/lib/grid/aggregate'
import { memberLoadSeries } from '@/lib/grid/load-series'
import { mergeChunks, type GridModel } from '@/lib/grid/merge'
import { db } from '@/server/db/client'
import * as services from '@/server/services'
import { GOLDEN_PATH, seedGolden } from '../../scripts/lib/fixtures'
import { asUser } from '../helpers/as-user'
import { goldenProjectId, goldenTaskNames, goldenUser, type GoldenProject, type GoldenViewer } from '../authz/_support/golden'
import { assertNoLeak } from '../authz/_support/leak'

const TODAY: ISODate = '2026-09-30'
const FROM: ISODate = '2026-09-14'
const TO: ISODate = '2026-11-02' // exclusive
const WEEKS: ISODate[] = ['2026-09-14', '2026-09-21', '2026-09-28', '2026-10-05', '2026-10-12', '2026-10-19', '2026-10-26']
const VIEWS: LoadView[] = ['ALL', 'COMMITTED', 'AT_RISK']
const POS_PEOPLE: GoldenViewer[] = ['Cindy', 'Ivy', 'Mint']
const wk = (w: ISODate): PeriodKey => `W:${w}`

interface GoldenJson {
  expected: {
    F1: {
      byUserWeek: Partial<
        Record<GoldenViewer, Record<ISODate, { totalCd: Cd; committedCd: Cd; capacityCd: Cd }>>
      >
    }
  }
}
const F1 = (JSON.parse(readFileSync(GOLDEN_PATH, 'utf8')) as GoldenJson).expected.F1

const ZERO: LoadPair = { total: 0, committed: 0 }
const add = (a: LoadPair, b: LoadPair): LoadPair => ({ total: a.total + b.total, committed: a.committed + b.committed })

/** The footer's integer half-up percent (BR-104 = "% ใช้กำลังคน"): floor((200·load + cap) / (2·cap)); cap 0 → null. */
function pctHalfUp(loadCd: Cd, capCd: Cd): number | null {
  if (capCd <= 0) return null
  return Math.floor((200 * loadCd + capCd) / (2 * capCd))
}

async function posChunk(includeOthers: boolean, viewer: GoldenViewer = 'Cindy'): Promise<GridResponse> {
  const user = asUser(await goldenUser(viewer))
  const chunk = await services.grid.buildChunk(
    db,
    user,
    { kind: 'project', id: await goldenProjectId('POS Upgrade') },
    { from: FROM, to: TO, expand: [], zoom: 'week', includeOthers },
    TODAY,
  )
  return JSON.parse(JSON.stringify(chunk)) as GridResponse
}

/** Oracle: u's counted (BR-50) POS load at week w split by certainty (BR-37), + otherProjects when the switch is on. */
function oracleLoad(g: GridResponse, userId: string, w: ISODate, includeOthers: boolean): LoadPair {
  const tasks = new Map(g.rows.filter((r): r is GridTaskRow => r.kind === 'task').map((t) => [t.id, t]))
  let load = ZERO
  for (const r of g.rows) {
    if (r.kind !== 'assignee' || r.userId !== userId) continue
    const a: GridAssigneeRow = r
    const task = tasks.get(a.taskId)!
    const cd = a.cells[wk(w)]?.cd ?? 0
    const counted = task.completedWeek === null || w <= task.completedWeek
    if (counted && cd > 0) load = add(load, { total: cd, committed: task.certainty === 'CONFIRMED' ? cd : 0 })
  }
  if (includeOthers) load = add(load, g.people[userId]?.otherProjects?.[wk(w)] ?? ZERO)
  return load
}

function modelOf(g: GridResponse): GridModel {
  const m = mergeChunks([g])
  expect(m, 'client model').not.toBeNull()
  return m!
}

describe('M7.1 load chart on F1 (BR-104, FR-813, AC-807)', () => {
  it('AC-807: week 28/9 Cindy 2.5 · Ivy 2.5 · Mint 0; week 5/10 Ivy 1.25; switch on → Cindy 5/10 = 2.5 (CRM); lines in footer order', async () => {
    await seedGolden(db)
    const ids = new Map<string, GoldenViewer>()
    for (const n of POS_PEOPLE) ids.set((await goldenUser(n)).id, n)
    const g = await posChunk(true)
    const m = modelOf(g)

    const off = memberLoadSeries(m, WEEKS, { view: 'ALL', includeOthers: false })
    // one line per footer person, in footerTotals order (M7.1-D4): Cindy, Ivy, Mint
    expect(off.map((l) => l.userId)).toEqual(footerTotals(m, { includeOthers: false }).people)
    expect(off.map((l) => ids.get(l.userId))).toEqual(POS_PEOPLE)
    for (const l of off) expect(l.points.map((p) => p.week), ids.get(l.userId)).toEqual(WEEKS)
    const at = (series: typeof off, who: GoldenViewer, w: ISODate) =>
      series.find((l) => ids.get(l.userId) === who)!.points.find((p) => p.week === w)!

    expect(at(off, 'Cindy', '2026-09-28').loadCd).toBe(250)
    expect(at(off, 'Ivy', '2026-09-28').loadCd).toBe(250)
    expect(at(off, 'Mint', '2026-09-28').loadCd).toBe(0)
    expect(at(off, 'Ivy', '2026-10-05').loadCd).toBe(125)
    expect(at(off, 'Cindy', '2026-10-05').loadCd).toBe(0)

    const on = memberLoadSeries(m, WEEKS, { view: 'ALL', includeOthers: true })
    expect(at(on, 'Cindy', '2026-10-05').loadCd).toBe(250)
    expect(at(on, 'Cindy', '2026-10-05').capacityCd).toBe(500)
    expect(at(on, 'Cindy', '2026-10-05').pct).toBe(50)
    // CRM is TENTATIVE: 250 total, 0 committed → still OK against 500 (BR-40)
    expect(at(on, 'Cindy', '2026-10-05').level).toBe('OK')
  })

  it('every point = the chunk oracle (load, capacity, pct, level); switch on = F1 byUserWeek; pct = loadPct (M11.1 % mode)', async () => {
    await seedGolden(db)
    const nick = new Map<string, GoldenViewer>()
    for (const n of POS_PEOPLE) nick.set((await goldenUser(n)).id, n)
    for (const includeOthers of [false, true]) {
      const g = await posChunk(includeOthers)
      const m = modelOf(g)
      for (const view of VIEWS) {
        const days = memberLoadSeries(m, WEEKS, { view, includeOthers })
        for (const line of days) {
          const who = nick.get(line.userId)!
          for (const p of line.points) {
            const label = `${who} ${p.week} ${view} others=${includeOthers}`
            const pair = oracleLoad(g, line.userId, p.week, includeOthers)
            const cap = g.people[line.userId]!.capacity[wk(p.week)] ?? 0
            expect(p.loadCd, label).toBe(viewLoad(pair, view))
            expect(p.capacityCd, label).toBe(cap)
            expect(p.pct, label).toBe(pctHalfUp(viewLoad(pair, view), cap))
            // M11.1 (BR-104 % mode): the chart's percent is the shared load-display helper's
            expect(p.pct, `${label} loadPct`).toBe(loadPct(viewLoad(pair, view), cap))
            expect(p.level, label).toBe(overloadLevel(pair, cap))
            expect(Number.isInteger(p.loadCd), label).toBe(true)
            if (includeOthers) {
              // POS + every other project = the person's whole F1 week (r8 byUserWeek; absent = 0)
              const f1 = F1.byUserWeek[who]?.[p.week]
              expect(p.loadCd, `${label} = F1 byUserWeek`).toBe(
                viewLoad({ total: f1?.totalCd ?? 0, committed: f1?.committedCd ?? 0 }, view),
              )
              if (f1) expect(p.capacityCd, `${label} F1 capacity`).toBe(f1.capacityCd)
            }
          }
        }
      }
    }
  })

  it('BR-104: Σ lines per week = the footer "ภาระรวม" for 2026-09-14…2026-10-26, both switch states, all three views', async () => {
    await seedGolden(db)
    for (const includeOthers of [false, true]) {
      const m = modelOf(await posChunk(includeOthers))
      const footer = footerTotals(m, { includeOthers })
      for (const view of VIEWS) {
        const series = memberLoadSeries(m, WEEKS, { view, includeOthers })
        for (const [i, w] of WEEKS.entries()) {
          const sum = series.reduce((acc, l) => acc + (l.points[i]!.loadCd ?? 0), 0)
          const cell = footer.cells[wk(w)]
          expect(cell, `footer ${w}`).toBeDefined()
          expect(sum, `Σ series ${w} ${view} others=${includeOthers}`).toBe(footerValue(cell!, view).loadCd)
          const cap = series.reduce((acc, l) => acc + (l.points[i]!.capacityCd ?? 0), 0)
          expect(cap, `Σ capacity ${w}`).toBe(cell!.capacityCd)
        }
      }
    }
  })

  it('AC-807 Mint (POS member, not CRM): the same chart numbers as Cindy sees, and the series carry nothing of CRM', async () => {
    await seedGolden(db)
    const cindy = await goldenUser('Cindy')
    const asMint = memberLoadSeries(modelOf(await posChunk(true, 'Mint')), WEEKS, {
      view: 'ALL',
      includeOthers: true,
    })
    const asCindy = memberLoadSeries(modelOf(await posChunk(true, 'Cindy')), WEEKS, {
      view: 'ALL',
      includeOthers: true,
    })
    expect(asMint).toEqual(asCindy)
    expect(asMint.find((l) => l.userId === cindy.id)?.points.find((p) => p.week === '2026-10-05')?.loadCd).toBe(250)
    const NOT_MINT: GoldenProject[] = ['CRM Migration', 'Data Warehouse', 'Store Analytics Dashboard']
    const hidden: string[] = ['CRM Migration', 'ย้ายข้อมูลลูกค้า', ...goldenTaskNames(NOT_MINT)]
    for (const n of NOT_MINT) hidden.push(await goldenProjectId(n))
    assertNoLeak(asMint, hidden)
  })

  it('M7.1-D5: weeks outside the loaded chunk are gaps (null), never 0', async () => {
    await seedGolden(db)
    const m = modelOf(await posChunk(false))
    const series = memberLoadSeries(m, ['2026-10-26', '2026-11-02', '2026-11-09', '2026-11-16'], {
      view: 'ALL',
      includeOthers: false,
    })
    for (const l of series) {
      expect(l.points[0]!.loadCd).not.toBeNull()
      for (const p of l.points.slice(1))
        expect(p, `${l.userId} ${p.week}`).toMatchObject({ loadCd: null, capacityCd: null, pct: null, level: null })
    }
  })
})
