// tests/authz/rows/grid-day.ts — M7 PERM-06 rows: the project grid read with day zoom / inline expansion (SPEC §3.2
// เปิดโปรเจค, §4.8 FR-802/FR-803, §7.4; X41/X42/X86; plan/m07 S4.1, §7.2). Written from the SPEC before S2 wires
// `expand`/`zoom` into the grid service (PLAN §4.1): red until S2. Content leaks → masking.int.test.ts › grid day (M7).
import { randomUUID } from 'node:crypto'
import { expect } from 'vitest'
import { daysOfWeek, isoWeekday } from '@/domain/dates'
import type { ISODate, PeriodKey } from '@/domain/types'
import type { GridAssigneeRow, GridResponse } from '@/lib/contracts/grid'
import type { World } from '../../helpers/world'
import { defineRow, type AuthzRow } from '../types'
import { gridGet } from './_m6'
import { BAD, DAY_RANGE, DAY_WORLD, VIEW } from './_m7'

const ROUTE = 'GET /api/grid/project/[projectId]'

/** 200 → body checks (the shape M7 adds); other statuses pass through to the matrix. */
async function expectGrid(res: Response, check: (body: GridResponse) => void): Promise<Response> {
  if (res.status === 200) check((await res.clone().json()) as GridResponse)
  return res
}

const weekdays = (w: ISODate): ISODate[] => daysOfWeek(w).filter((d) => isoWeekday(d) <= 5)
const dKey = (d: ISODate): PeriodKey => `D:${d}`
const wKey = (d: ISODate): PeriodKey => `W:${d}`

function assigneeRow(b: GridResponse, taskAssignmentId: string): GridAssigneeRow {
  const r = b.rows.find((x): x is GridAssigneeRow => x.kind === 'assignee' && x.taskAssignmentId === taskAssignmentId)
  expect(r, `assignee row ${taskAssignmentId}`).toBeDefined()
  return r!
}

/** M7-D10: an expanded week = its D: periods (Mon–Fri at least) followed by its W: period with `expanded: true`. */
function expectExpanded(b: GridResponse, w: ISODate): void {
  const keys = b.periods.map((p) => p.key)
  const wi = keys.indexOf(wKey(w))
  expect(wi, `W:${w} present`).toBeGreaterThanOrEqual(0)
  expect(b.periods[wi]).toMatchObject({ kind: 'WEEK', weekStart: w, expanded: true })
  for (const d of weekdays(w)) {
    const di = keys.indexOf(dKey(d))
    expect(di, `D:${d} present`).toBeGreaterThanOrEqual(0)
    expect(di, `D:${d} before W:${w}`).toBeLessThan(wi)
    expect(b.periods[di]).toMatchObject({ kind: 'DAY', weekStart: w, date: d })
  }
}

function expectCollapsed(b: GridResponse, w: ISODate): void {
  const p = b.periods.find((x) => x.key === wKey(w))
  expect(p, `W:${w} present`).toBeDefined()
  expect(p!.expanded, `W:${w} collapsed`).toBeUndefined()
  for (const d of daysOfWeek(w)) expect(b.periods.some((x) => x.key === dKey(d)), `no D:${d}`).toBe(false)
}

/** pWeek (WEEK 250, capacity 100 × 5) → derived 50 × 5 (BR-21); pDay (DAY) → solid days, W = Σ days (BR-20a). */
function expectLeadCells(b: GridResponse, w: World, { pWeekExpanded }: { pWeekExpanded: boolean }): void {
  const row = assigneeRow(b, w.assignments.pLeafLead.id)
  if (pWeekExpanded)
    for (const d of weekdays(w.dayWeeks.pWeek))
      expect(row.cells[dKey(d)], `pWeek ${d}`).toMatchObject({ cd: 50, resolution: 'WEEK', derived: true })
  expect(row.cells[wKey(w.dayWeeks.pDay)]).toMatchObject({
    cd: 250,
    resolution: 'DAY',
    derived: false,
    days: { '2026-11-09': 100, '2026-11-10': 100, '2026-11-11': 50 },
  })
  expect(row.cells[dKey('2026-11-09')]).toMatchObject({ cd: 100, resolution: 'DAY', derived: false })
  expect(row.cells[dKey('2026-11-11')]).toMatchObject({ cd: 50, resolution: 'DAY', derived: false })
}

export const rows: AuthzRow[] = [
  defineRow({
    id: 'GR-D-ZOOM',
    spec: 'PERM-06 §3.2 เปิดโปรเจค + FR-802 — GET /api/grid/project/{P}?zoom=day: every week expanded',
    action: ROUTE,
    mutates: false,
    with: DAY_WORLD,
    expect: VIEW,
    run: async (w) =>
      expectGrid(await gridGet(w.P.id, `${DAY_RANGE}&zoom=day`), (b) => {
        expect(b.window).toMatchObject({ from: '2026-11-02', to: '2026-11-16', zoom: 'day' })
        expectExpanded(b, w.dayWeeks.pWeek)
        expectExpanded(b, w.dayWeeks.pDay)
        expectLeadCells(b, w, { pWeekExpanded: true })
      }),
  }),
  defineRow({
    id: 'GR-D-EXPAND',
    spec: 'PERM-06 + FR-803 — expand=2026-11-09 expands only that week (inline expansion)',
    action: ROUTE,
    mutates: false,
    with: DAY_WORLD,
    expect: VIEW,
    run: async (w) =>
      expectGrid(await gridGet(w.P.id, `${DAY_RANGE}&expand=2026-11-09`), (b) => {
        expect(b.window).toMatchObject({ expand: ['2026-11-09'], zoom: 'week' })
        expectCollapsed(b, w.dayWeeks.pWeek)
        expectExpanded(b, w.dayWeeks.pDay)
        expectLeadCells(b, w, { pWeekExpanded: false })
      }),
  }),
  defineRow({
    id: 'GR-D-ARCH',
    spec: 'PERM-06 + X42 — archived A with zoom=day stays readable, nothing editable',
    action: ROUTE,
    mutates: false,
    with: DAY_WORLD,
    expect: VIEW,
    run: async (w) =>
      expectGrid(await gridGet(w.A.id, `${DAY_RANGE}&zoom=day`), (b) => {
        expect(b.context).toMatchObject({ id: w.A.id, archived: true, canEdit: false })
        const row = assigneeRow(b, w.assignments.aTaskMember.id)
        expect(row.editable).toBe(false)
        expect(row.cells[dKey('2026-11-09')]).toMatchObject({ cd: 50, resolution: 'DAY', derived: false })
      }),
  }),
  defineRow({
    id: 'GR-D-BADQ',
    spec: 'PERM-06 + X41 — expand=2026-11-10 (not a Monday) is a 400 for everyone (parse precedes authz)',
    action: ROUTE,
    mutates: false,
    with: DAY_WORLD,
    expect: BAD,
    run: (w) => gridGet(w.P.id, `${DAY_RANGE}&expand=2026-11-10`),
  }),
  defineRow({
    id: 'GR-D-MISSING',
    spec: 'PERM-06 + X41 — an unknown project id with zoom=day is a 404 for everyone',
    action: ROUTE,
    mutates: false,
    with: DAY_WORLD,
    expect: { M: '404', L: '404', Me: '404', W: '404' },
    run: () => gridGet(randomUUID(), `${DAY_RANGE}&zoom=day`),
  }),
]
