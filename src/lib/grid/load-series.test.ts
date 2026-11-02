import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { addWeeks } from '@/domain/dates'
import type { LoadView } from '@/domain/types'
import { footerTotals, footerValue } from './aggregate'
import { buildColumns } from './columns'
import { gridResponse, POS_PEOPLE, POS_TASKS, type FxPerson, type FxTask } from './fixtures.test.data'
import { periodSlots, slotWeeks } from './chart-geometry'
import { memberLoadSeries } from './load-series'
import { mergeChunks } from './merge'

const weeks = (from: string, n: number) => Array.from({ length: n }, (_, i) => addWeeks(from, i))
/** POS F1 + Cindy's CRM numbers as masked otherProjects (X29: numbers only). CRM is TENTATIVE → committed 0. */
const PEOPLE_WITH_OTHERS: Record<string, FxPerson> = {
  ...POS_PEOPLE,
  cindy: { name: 'Cindy', otherProjects: { '2026-10-05': { total: 250, committed: 0 } } },
  ivy: { name: 'Ivy', otherProjects: { '2026-10-12': { total: 250, committed: 0 } } },
}
const pos = (includeOthers = false) =>
  mergeChunks([
    gridResponse({ from: '2026-08-31', tasks: POS_TASKS, people: PEOPLE_WITH_OTHERS, includeOthers }),
    gridResponse({ from: '2026-10-26', tasks: POS_TASKS, people: PEOPLE_WITH_OTHERS, includeOthers }),
  ])!
const point = (s: ReturnType<typeof memberLoadSeries>, name: string, week: string) =>
  s.find((x) => x.name === name)!.points.find((p) => p.week === week)!

describe('memberLoadSeries (BR-104, AC-807)', () => {
  const W = weeks('2026-09-21', 4)

  it('people in footer order (Cindy, Ivy, Mint) with names', () => {
    const s = memberLoadSeries(pos(), W, { view: 'ALL', includeOthers: false })
    expect(s.map((x) => [x.userId, x.name])).toEqual([
      ['cindy', 'Cindy'],
      ['ivy', 'Ivy'],
      ['mint', 'Mint'],
    ])
    expect(s[0]!.points.map((p) => p.week)).toEqual(W)
  })
  it('POS F1 week 2026-09-28 → Cindy 250, Ivy 250, Mint 0; 2026-10-05 Ivy 125', () => {
    const s = memberLoadSeries(pos(), W, { view: 'ALL', includeOthers: false })
    expect(point(s, 'Cindy', '2026-09-28')).toEqual({
      week: '2026-09-28',
      loadCd: 250,
      capacityCd: 500,
      pct: 50,
      level: 'OK',
    })
    expect(point(s, 'Ivy', '2026-09-28').loadCd).toBe(250)
    expect(point(s, 'Mint', '2026-09-28').loadCd).toBe(0)
    expect(point(s, 'Ivy', '2026-10-05').loadCd).toBe(125)
    expect(point(s, 'Ivy', '2026-10-05').pct).toBe(25)
    expect(point(s, 'Cindy', '2026-10-05').loadCd).toBe(0)
  })
  it('includeOthers → Cindy 2026-10-05 = 250 (CRM, numbers only); tentative → RISK-free, COMMITTED view 0', () => {
    const s = memberLoadSeries(pos(true), W, { view: 'ALL', includeOthers: true })
    expect(point(s, 'Cindy', '2026-10-05')).toMatchObject({ loadCd: 250, pct: 50, level: 'OK' })
    const c = memberLoadSeries(pos(true), W, { view: 'COMMITTED', includeOthers: true })
    expect(point(c, 'Cindy', '2026-10-05').loadCd).toBe(0)
    // switch off ignores otherProjects even when the chunk carries them
    expect(
      point(memberLoadSeries(pos(true), W, { view: 'ALL', includeOthers: false }), 'Cindy', '2026-10-05')
        .loadCd,
    ).toBe(0)
  })
  it('levels (BR-40): committed > cap → OVER; total > cap → RISK; cap 0 → pct null', () => {
    const tasks: FxTask[] = [
      { id: 'a', name: 'a', assignees: [{ taId: 'x', userId: 'cindy', cells: { '2026-09-28': 600 } }] },
      {
        id: 'b',
        name: 'b',
        certainty: 'TENTATIVE',
        assignees: [{ taId: 'y', userId: 'ivy', cells: { '2026-09-28': 600, '2026-10-05': 100 } }],
      },
    ]
    const people = { cindy: { name: 'Cindy' }, ivy: { name: 'Ivy', capacity: { '2026-10-05': 0 } } }
    const m = mergeChunks([gridResponse({ from: '2026-09-28', weeks: 2, tasks, people })])!
    const s = memberLoadSeries(m, ['2026-09-28', '2026-10-05'], { view: 'ALL', includeOthers: false })
    expect(point(s, 'Cindy', '2026-09-28')).toMatchObject({ level: 'OVER', pct: 120 })
    expect(point(s, 'Ivy', '2026-09-28')).toMatchObject({ level: 'RISK', pct: 120 })
    expect(point(s, 'Ivy', '2026-10-05')).toMatchObject({
      loadCd: 100,
      capacityCd: 0,
      pct: null,
      level: 'RISK',
    })
    const atRisk = memberLoadSeries(m, ['2026-09-28'], { view: 'AT_RISK', includeOthers: false })
    expect(point(atRisk, 'Cindy', '2026-09-28').loadCd).toBe(0)
    expect(point(atRisk, 'Ivy', '2026-09-28').loadCd).toBe(600)
  })
  it('weeks absent from the model → all null (gaps, never 0)', () => {
    const s = memberLoadSeries(pos(), ['2027-06-07'], { view: 'ALL', includeOthers: false })
    expect(s[0]!.points[0]).toEqual({
      week: '2027-06-07',
      loadCd: null,
      capacityCd: null,
      pct: null,
      level: null,
    })
  })
  it('BR-50: a completed task stops counting after its completion week', () => {
    const tasks: FxTask[] = [
      {
        id: 'd',
        name: 'd',
        completedWeek: '2026-09-28',
        assignees: [{ taId: 'z', userId: 'cindy', cells: { '2026-09-28': 100, '2026-10-05': 200 } }],
      },
    ]
    const m = mergeChunks([
      gridResponse({ from: '2026-09-28', weeks: 2, tasks, people: { cindy: { name: 'Cindy' } } }),
    ])!
    const s = memberLoadSeries(m, ['2026-09-28', '2026-10-05'], { view: 'ALL', includeOthers: false })
    expect(s[0]!.points.map((p) => p.loadCd)).toEqual([100, 0])
  })

  it('property: Σ series = footer ภาระรวม for every week, both switch states and all three views', () => {
    const FROM = '2026-09-28'
    const WK = weeks(FROM, 3)
    const users = ['cindy', 'ivy', 'mint'] as const
    const load = fc
      .tuple(fc.integer({ min: 0, max: 400 }), fc.integer({ min: 0, max: 400 }))
      .map(([a, b]) => ({ total: a + b, committed: a }))
    const arb = fc.record({
      tasks: fc.array(
        fc.record({
          tentative: fc.boolean(),
          done: fc.option(fc.constantFrom(...WK), { nil: null }),
          assignees: fc.uniqueArray(fc.constantFrom(...users), { maxLength: 3 }),
          cells: fc.array(fc.array(fc.integer({ min: 0, max: 500 }), { minLength: 3, maxLength: 3 }), {
            minLength: 3,
            maxLength: 3,
          }),
        }),
        { maxLength: 5 },
      ),
      others: fc.array(fc.array(fc.option(load, { nil: undefined }), { minLength: 3, maxLength: 3 }), {
        minLength: 3,
        maxLength: 3,
      }),
      caps: fc.array(fc.integer({ min: 0, max: 500 }), { minLength: 3, maxLength: 3 }),
      includeOthers: fc.boolean(),
      view: fc.constantFrom<LoadView>('ALL', 'COMMITTED', 'AT_RISK'),
    })
    fc.assert(
      fc.property(arb, ({ tasks, others, caps, includeOthers, view }) => {
        const fx: FxTask[] = tasks.map((t, i) => ({
          id: `t${i}`,
          name: `t${i}`,
          certainty: t.tentative ? 'TENTATIVE' : 'CONFIRMED',
          completedWeek: t.done,
          assignees: t.assignees.map((u, k) => ({
            taId: `a${i}${u}`,
            userId: u,
            cells: Object.fromEntries(WK.map((w, j) => [w, t.cells[k]![j]!])),
          })),
        }))
        const people: Record<string, FxPerson> = Object.fromEntries(
          users.map((u, k) => [
            u,
            {
              name: u.toUpperCase(),
              defaultCapacity: caps[k]!,
              otherProjects: Object.fromEntries(WK.map((w, j) => [w, others[k]![j]])),
            },
          ]),
        )
        const m = mergeChunks([gridResponse({ from: FROM, weeks: 3, tasks: fx, people, includeOthers })])!
        const series = memberLoadSeries(m, WK, { view, includeOthers })
        const footer = footerTotals(m, { includeOthers })
        expect(series.map((s) => s.userId)).toEqual(footer.people)
        WK.forEach((w, j) => {
          const sum = series.reduce((a, s) => a + s.points[j]!.loadCd!, 0)
          expect(sum).toBe(footerValue(footer.cells[`W:${w}`]!, view).loadCd)
          for (const s of series) expect(Number.isInteger(s.points[j]!.loadCd)).toBe(true)
        })
      }),
      { numRuns: 200 },
    )
  })
})

// NFR-13 (plan/m07.1 §1.1, S3.8 / S4.5, e2e P10): "chart < 200 ms for 20 people × 26 weeks". The e2e smoke has no
// 20-person fixture (measured end to end in M12); this node-level check times the chart's data path on a generated
// 20 × 26 model (40 tasks, every week allocated) so a regression in memberLoadSeries / slotWeeks shows up in CI.
describe('NFR-13: the chart data for 20 people × 26 weeks well under 200 ms', () => {
  it('slotWeeks + memberLoadSeries (both views, with otherProjects): median of 5 runs < 200 ms', () => {
    const FROM = '2026-08-31'
    const WK = weeks(FROM, 32)
    const users = Array.from({ length: 20 }, (_, i) => `u${i}`)
    const people: Record<string, FxPerson> = Object.fromEntries(
      users.map((u, i) => [
        u,
        {
          name: `Person ${i}`,
          otherProjects: Object.fromEntries(WK.map((w) => [w, { total: 100, committed: 50 }])),
        },
      ]),
    )
    const tasks: FxTask[] = users.flatMap((u, i) =>
      [0, 1].map((k) => ({
        id: `t-${i}-${k}`,
        name: `Task ${i}.${k}`,
        ...(k === 1 ? { certainty: 'TENTATIVE' as const } : {}),
        assignees: [
          {
            taId: `a-${i}-${k}`,
            userId: u,
            cells: Object.fromEntries(WK.map((w, j) => [w, 25 * ((i + j + k) % 9)])),
          },
        ],
      })),
    )
    const m = mergeChunks(
      [0, 8, 16, 24].map((o) =>
        gridResponse({ from: addWeeks(FROM, o), tasks, people, includeOthers: true }),
      ),
    )!
    const cs = buildColumns(WK, new Set(), new Map())
    const runs: number[] = []
    let series: ReturnType<typeof memberLoadSeries> = []
    for (let r = 0; r < 5; r++) {
      const t0 = performance.now()
      // 26 rendered week columns at the virtualizer's x (frozen 352 px)
      const rendered = cs.slice(0, 26).map((c, i) => ({ index: i, start: 352 + c.offset, size: c.width }))
      const ws = slotWeeks(periodSlots(cs, rendered))
      for (const view of ['ALL', 'COMMITTED'] as const)
        series = memberLoadSeries(m, ws, { view, includeOthers: true })
      runs.push(performance.now() - t0)
    }
    expect(series).toHaveLength(20)
    expect(series[0]!.points).toHaveLength(26)
    expect(series.every((s) => s.points.every((p) => p.loadCd !== null))).toBe(true)
    const median = [...runs].sort((a, b) => a - b)[2]!
    expect(median).toBeLessThan(200)
  })
})
