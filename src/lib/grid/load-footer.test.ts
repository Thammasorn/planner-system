// plan/m09 S3.3 — week-level person loads, BR-40/41 status and BR-45 footer tones in both grid contexts (M9-D13, X06/X67).
import { describe, expect, it } from 'vitest'
import type { GridPeriod, GridRow } from '@/lib/contracts/grid'
import { footerTotals, projectTotals } from './aggregate'
import { personDayLoads, personDayStatus } from './day-footer'
import { gridResponse } from './fixtures.test.data'
import { footerPeriodCell, periodStatus, personPeriodLoads, type PeriodStatus } from './load-footer'
import { mergeChunks } from './merge'
import { ivyResponse, personResponse } from './person.test.data'
import { buildPersonViewRows } from './rows'

const open = { showCompleted: true, collapsed: new Set<string>() }

// F3: Peter seen by Cindy — every project of Peter is hidden → only the masked row; cap 300 in 10-05 (leave)
const peter = mergeChunks([
  personResponse({
    from: '2026-09-28',
    userId: 'peter',
    person: { name: 'Peter', capacity: { '2026-10-05': 300 } },
    projects: [],
    masked: { '2026-10-05': { total: 500, committed: 500 } },
  }),
])!
// F2 Mobile 2026-10-19: Jack + Mint 500 committed each, cap 400 each (1000 vs 800)
const mobile = mergeChunks([
  gridResponse({
    from: '2026-10-19',
    projectName: 'Mobile App',
    tasks: [
      { id: 't-j', name: 'J', assignees: [{ taId: 'a-jack', userId: 'jack', cells: { '2026-10-19': 500 } }] },
      { id: 't-m', name: 'M', assignees: [{ taId: 'a-mint', userId: 'mint', cells: { '2026-10-19': 500 } }] },
    ],
    people: {
      jack: { name: 'Jack', capacity: { '2026-10-19': 400 } },
      mint: { name: 'Mint', capacity: { '2026-10-19': 400 } },
    },
  }),
])!

function statusesAt(m: typeof mobile, key: `W:${string}`, includeOthers = false): Map<string, PeriodStatus> {
  const loads = personPeriodLoads(m, m.periods, { includeOthers })
  const out = new Map<string, PeriodStatus>()
  for (const u of Object.keys(m.people)) out.set(u, periodStatus(loads.get(u)?.[key], m.people[u]!, key))
  return out
}

describe('personPeriodLoads / periodStatus / footerPeriodCell (M9 S3.3)', () => {
  it('F3 Peter as Cindy (masked only): 10-05 = { 500, 500 } vs cap 300 → OVER +200 CAPACITY, tone over', () => {
    const s = statusesAt(peter, 'W:2026-10-05')
    expect(s.get('peter')).toEqual({
      load: { total: 500, committed: 500 },
      capCd: 300,
      stdCd: 500,
      status: { level: 'OVER', excessCd: 200, cause: 'CAPACITY' },
    })
    const f = footerPeriodCell(s, 'ALL')
    expect(f).toMatchObject({ tone: 'over', palette: 'load', glyph: 'OVER', overPeople: ['peter'], loadCd: 500, capCd: 300 })
    expect(f.single?.status).toEqual({ level: 'OVER', excessCd: 200, cause: 'CAPACITY' })
  })

  it('F1 Ivy person grid 10-05 = CRM 0 + POS 125 → light, OK, single person', () => {
    const m = mergeChunks([ivyResponse()])!
    const f = footerPeriodCell(statusesAt(m, 'W:2026-10-05'), 'ALL')
    expect(f).toMatchObject({ tone: 'light', glyph: 'OK', overPeople: [], loadCd: 125, capCd: 500 })
    expect(f.single?.status.level).toBe('OK')
    // the footer number agrees (M6 footerTotals with the person context)
    expect(footerTotals(m, { includeOthers: false }).cells['W:2026-10-05']?.load).toEqual({ total: 125, committed: 125 })
  })

  it('the person footer adds the masked row (Σ assignee cells + masked)', () => {
    const m = mergeChunks([ivyResponse({ masked: { '2026-10-05': { total: 400, committed: 100 } } })])!
    expect(personPeriodLoads(m, m.periods, { includeOthers: false }).get('ivy')?.['W:2026-10-05']).toEqual({
      total: 525,
      committed: 225,
    })
    expect(footerTotals(m, { includeOthers: true }).cells['W:2026-10-05']?.load).toEqual({ total: 525, committed: 225 })
    const f = footerPeriodCell(statusesAt(m, 'W:2026-10-05'), 'ALL')
    expect(f).toMatchObject({ tone: 'over', glyph: 'RISK', loadCd: 525 })
    expect(f.single?.status).toEqual({ level: 'RISK', excessCd: 25, cause: 'WORKLOAD' })
  })

  it('F2 Mobile 10-19 (project grid): 1000 vs 800 → over, OVER, both people (sorted by name)', () => {
    const f = footerPeriodCell(statusesAt(mobile, 'W:2026-10-19'), 'ALL', (u) => mobile.people[u]?.name ?? '')
    expect(f).toMatchObject({ tone: 'over', palette: 'load', glyph: 'OVER', overPeople: ['jack', 'mint'], loadCd: 1000, capCd: 800 })
    expect(f.single).toBeNull()
  })

  it('AT_RISK view → tentative palette; COMMITTED view colours the committed part', () => {
    const s = statusesAt(mobile, 'W:2026-10-19')
    expect(footerPeriodCell(s, 'AT_RISK')).toMatchObject({ palette: 'tentative', tone: 'empty', loadCd: 0, glyph: 'OVER' })
    expect(footerPeriodCell(s, 'COMMITTED')).toMatchObject({ palette: 'load', tone: 'over', loadCd: 1000 })
  })

  it('project context + includeOthers adds otherProjects W: loads', () => {
    const m = mergeChunks([
      gridResponse({
        from: '2026-10-19',
        includeOthers: true,
        tasks: [{ id: 't', name: 'T', assignees: [{ taId: 'a', userId: 'jack', cells: { '2026-10-19': 100 } }] }],
        people: { jack: { name: 'Jack', otherProjects: { '2026-10-19': { total: 300, committed: 200 } } } },
      }),
    ])!
    expect(personPeriodLoads(m, m.periods, { includeOthers: true }).get('jack')?.['W:2026-10-19']).toEqual({
      total: 400,
      committed: 300,
    })
    expect(personPeriodLoads(m, m.periods, { includeOthers: false }).get('jack')?.['W:2026-10-19']).toEqual({
      total: 100,
      committed: 100,
    })
  })

  it('cap 0 with no load → noCapacity stripes; a missing person load = { 0, 0 }', () => {
    const m = mergeChunks([
      personResponse({ from: '2026-09-28', userId: 'u', person: { name: 'U', capacity: { '2026-10-05': 0 } }, projects: [] }),
    ])!
    const f = footerPeriodCell(statusesAt(m, 'W:2026-10-05'), 'ALL')
    expect(f).toMatchObject({ tone: 'noCapacity', glyph: 'OK', loadCd: 0, capCd: 0 })
  })
})

describe('masked D: totals in day zoom (S3.3, C88, X85)', () => {
  const periods: GridPeriod[] = [{ key: 'D:2026-10-07', kind: 'DAY', weekStart: '2026-10-05', date: '2026-10-07' }]
  const rows: GridRow[] = [
    { kind: 'masked', userId: 'peter', label: 'งานในโปรเจคอื่น', totals: { 'D:2026-10-07': { total: 100, committed: 100 } } },
  ]
  it('a masked row adds its D: totals to its user (no extra in the person context → never counted twice)', () => {
    expect(personDayLoads(rows, periods, {}).get('peter')?.['D:2026-10-07']).toEqual({ total: 100, committed: 100 })
  })
  it('project rows are skipped (their totals duplicate the merged rows)', () => {
    const m = mergeChunks([ivyResponse({ from: '2026-10-05' })])!
    const withProjects = personDayLoads(m.rows, m.periods, {})
    const without = personDayLoads(m.rows.filter((r) => r.kind !== 'project'), m.periods, {})
    expect(withProjects).toEqual(without)
  })
  it('personPeriodLoads D: keys = personDayLoads (one sum per key, C38)', () => {
    const m = mergeChunks([
      personResponse({
        from: '2026-10-05',
        expand: ['2026-10-05'],
        userId: 'peter',
        person: { name: 'Peter' },
        projects: [
          {
            id: 'p',
            name: 'P',
            tasks: [{ id: 't', name: 'T', assignees: [{ taId: 'a', userId: 'peter', cells: { '2026-10-05': 500 } }] }],
          },
        ],
        maskedDays: { '2026-10-07': { total: 100, committed: 100 } },
      }),
    ])!
    const day = personDayLoads(m.rows, m.periods, {}).get('peter')
    const all = personPeriodLoads(m, m.periods, { includeOthers: true }).get('peter')
    for (const p of m.periods.filter((x) => x.kind === 'DAY')) expect(all?.[p.key]).toEqual(day?.[p.key])
    expect(day?.['D:2026-10-07']).toEqual({ total: 200, committed: 200 })
    // periodStatus on a D: key = personDayStatus + excess / cause on the same load / cap
    const s = periodStatus(all?.['D:2026-10-07'], m.people.peter!, 'D:2026-10-07')
    const d = personDayStatus(day, m.people.peter, 'D:2026-10-07')
    expect({ level: s.status.level, load: s.load, capCd: s.capCd }).toEqual(d)
    expect(s.status).toEqual({ level: 'OVER', excessCd: 100, cause: 'WORKLOAD' })
  })
})

describe('projectTotals (S3.3, BR-50)', () => {
  it('Σ the merged rows of each project, recomputed from the cells (optimistic writes)', () => {
    const m = mergeChunks([ivyResponse()])!
    const rows = buildPersonViewRows(m, open)
    m.cells.get('a:a-ivy-uat')?.set('W:2026-10-05', { cd: 300, resolution: 'WEEK', derived: false })
    const t = projectTotals(m, rows)
    expect(t.get('p-pos')?.['W:2026-10-05']).toEqual({ total: 300, committed: 300 })
    expect(t.get('p-crm')?.['W:2026-10-12']).toEqual({ total: 250, committed: 0 })
    expect(t.get('p-crm')?.['W:2026-10-05']).toBeUndefined()
  })
  it('collapsed projects keep their totals (computed from the model, not the visible rows)', () => {
    const m = mergeChunks([ivyResponse()])!
    const rows = buildPersonViewRows(m, { showCompleted: true, collapsed: new Set(['p:p-pos']) })
    expect(projectTotals(m, rows).get('p-pos')?.['W:2026-09-28']).toEqual({ total: 250, committed: 250 })
  })
})
