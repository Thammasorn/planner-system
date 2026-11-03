import { describe, expect, it } from 'vitest'
import { WEEK_W } from '@/lib/grid/columns'
import { MONTH_LABEL_LONG_MIN_W } from '@/lib/grid/months'
import { slotCenter, valueSlots } from '@/lib/grid/chart-geometry'
import { cell, F23, U, WEEKS } from '@/components/workload/test-data.test.helper'
import type { WorkloadGroup } from '@/lib/contracts/workload'
import {
  PERSON_COL_W,
  monthHeaderCells,
  nominalGeometry,
  sameGeometry,
  tableSlots,
  workloadMonthStarts,
  workloadSeries,
  type TableGeometry,
} from './chart'

const NOV = [
  '2026-10-19',
  '2026-10-26',
  '2026-11-02',
  '2026-11-09',
  '2026-11-16',
  '2026-11-23',
  '2026-11-30',
  '2026-12-07',
]

describe('monthHeaderCells (FR-1001 v3.5, FR-818 rule: a week belongs to the month of its Monday)', () => {
  it('groups consecutive weeks by the month of their Monday; 28/9 is September even though it ends in October', () => {
    const cells = monthHeaderCells(['2026-09-28', '2026-10-05', '2026-10-12'], null)
    expect(cells.map((c) => [c.key, c.span])).toEqual([
      ['2026-09', 1],
      ['2026-10', 2],
    ])
  })

  it('spans, month starts and labels: long "พฤศจิกายน 2569" when wide, short "ธ.ค. 69" when narrow', () => {
    const cells = monthHeaderCells(NOV, null)
    expect(cells.map((c) => [c.key, c.start, c.span, c.monthStart])).toEqual([
      ['2026-10', 0, 2, false],
      ['2026-11', 2, 5, true],
      ['2026-12', 7, 1, true],
    ])
    // nominal widths = WEEK_W per week: 5 × 64 ≥ 144 → long; 1 × 64 → short, the long name stays the accessible name
    expect(cells[1]!.width).toBe(5 * WEEK_W)
    expect(cells[1]!.label).toEqual({ text: 'พฤศจิกายน 2569', full: 'พฤศจิกายน 2569' })
    expect(cells[2]!.label).toEqual({ text: 'ธ.ค. 69', full: 'ธันวาคม 2569' })
  })

  it('uses the measured column widths for the label when the table is measured', () => {
    const g: TableGeometry = {
      personW: 200,
      contentW: 200 + NOV.length * 28,
      viewW: 900,
      cols: NOV.map((_, i) => ({ left: 200 + i * 28, width: 28 })),
    }
    const cells = monthHeaderCells(NOV, g)
    expect(cells[1]!.width).toBe(5 * 28)
    expect(cells[1]!.width).toBeLessThan(MONTH_LABEL_LONG_MIN_W)
    expect(cells[1]!.label.text).toBe('พ.ย. 69')
  })

  it('no weeks → no cells', () => {
    expect(monthHeaderCells([], null)).toEqual([])
  })
})

describe('workloadMonthStarts', () => {
  it('keys (W:<monday>) of the first week of every month except the first column', () => {
    expect([...workloadMonthStarts(NOV)]).toEqual(['W:2026-11-02', 'W:2026-12-07'])
    expect([...workloadMonthStarts(['2026-11-02'])]).toEqual([])
  })
})

describe('tableSlots — the chart geometry is the table header geometry', () => {
  it('maps every week header rect (table content coordinates) to a week slot with the same left / width', () => {
    const g: TableGeometry = {
      personW: 187.5,
      contentW: 1000,
      viewW: 800,
      cols: [
        { left: 187.5, width: 70.25 },
        { left: 257.75, width: 70.25 },
        { left: 328, width: 80 },
      ],
    }
    const slots = tableSlots(['2026-09-28', '2026-10-05', '2026-10-12'], g)
    expect(slots).toEqual([
      {
        index: 0,
        key: 'W:2026-09-28',
        role: 'week',
        weekStart: '2026-09-28',
        date: '2026-09-28',
        left: 187.5,
        width: 70.25,
      },
      {
        index: 1,
        key: 'W:2026-10-05',
        role: 'week',
        weekStart: '2026-10-05',
        date: '2026-10-05',
        left: 257.75,
        width: 70.25,
      },
      {
        index: 2,
        key: 'W:2026-10-12',
        role: 'week',
        weekStart: '2026-10-12',
        date: '2026-10-12',
        left: 328,
        width: 80,
      },
    ])
    // every slot carries a value (one point per week), centred on the header cell
    expect(valueSlots(slots).map(slotCenter)).toEqual([187.5 + 70.25 / 2, 257.75 + 70.25 / 2, 368])
  })

  it('a missing rect (weeks changed before the next measure) falls back to the nominal column', () => {
    const slots = tableSlots(['2026-09-28', '2026-10-05'], {
      personW: 200,
      contentW: 400,
      viewW: 400,
      cols: [],
    })
    expect(slots.map((s) => [s.left, s.width])).toEqual([
      [200, WEEK_W],
      [200 + WEEK_W, WEEK_W],
    ])
  })

  it('nominalGeometry = person column + WEEK_W per week (before the first measure / jsdom)', () => {
    const g = nominalGeometry(3)
    expect(g.personW).toBe(PERSON_COL_W)
    expect(g.cols).toEqual([0, 1, 2].map((i) => ({ left: PERSON_COL_W + i * WEEK_W, width: WEEK_W })))
    expect(g.contentW).toBe(PERSON_COL_W + 3 * WEEK_W)
    expect(g.viewW).toBe(0)
  })

  it('sameGeometry ignores sub-pixel noise (< 0.5 px) and detects real changes', () => {
    const a = nominalGeometry(2)
    expect(sameGeometry(a, { ...a, cols: a.cols.map((c) => ({ ...c, left: c.left + 0.2 })) })).toBe(true)
    expect(sameGeometry(a, { ...a, viewW: 10 })).toBe(false)
    expect(sameGeometry(a, nominalGeometry(3))).toBe(false)
    expect(sameGeometry(null, a)).toBe(false)
  })
})

describe('workloadSeries — one line per person shown in the table, from the cells /api/workload returned', () => {
  const groups = F23.groups

  it('table order (position groups, then people); load by view, capacity, integer % half-up, BR-40 level', () => {
    const series = workloadSeries(groups, F23.weeks, 'ALL')
    expect(series.map((s) => s.userId)).toEqual(groups.flatMap((g) => g.people.map((p) => p.userId)))
    const jack = series.find((s) => s.userId === U.jack)!
    const p = jack.points.find((x) => x.week === '2026-10-19')!
    expect(p).toEqual({ week: '2026-10-19', loadCd: 500, capacityCd: 400, pct: 125, level: 'OVER' })
  })

  it('views: COMMITTED = committed, AT_RISK = total − committed; level stays BR-40 of the pair (X67)', () => {
    const g: WorkloadGroup[] = [
      {
        positionId: null,
        name: 'x',
        people: [
          {
            userId: 'u1',
            name: 'A',
            positionId: null,
            active: true,
            deactivatedOn: null,
            cells: { [WEEKS[0]!]: cell(450, 250, 400) },
          },
        ],
      },
    ]
    const at = (v: 'ALL' | 'COMMITTED' | 'AT_RISK') => workloadSeries(g, [WEEKS[0]!], v)[0]!.points[0]!
    expect(at('ALL')).toMatchObject({ loadCd: 450, pct: 113, level: 'RISK' })
    expect(at('COMMITTED')).toMatchObject({ loadCd: 250, pct: 63, level: 'RISK' })
    expect(at('AT_RISK')).toMatchObject({ loadCd: 200, pct: 50, level: 'RISK' })
  })

  it('capacity 0 → pct null (a gap in % mode); a week without a cell → every field null', () => {
    const g: WorkloadGroup[] = [
      {
        positionId: null,
        name: 'x',
        people: [
          {
            userId: 'u1',
            name: 'A',
            positionId: null,
            active: true,
            deactivatedOn: null,
            cells: { [WEEKS[0]!]: cell(200, 200, 0) },
          },
        ],
      },
    ]
    const [s] = workloadSeries(g, [WEEKS[0]!, WEEKS[1]!], 'ALL')
    expect(s!.points[0]).toMatchObject({ loadCd: 200, capacityCd: 0, pct: null, level: 'OVER' })
    expect(s!.points[1]).toEqual({ week: WEEKS[1], loadCd: null, capacityCd: null, pct: null, level: null })
  })

  it('carries only names and numbers — never a project id or name (masking, §3.3)', () => {
    const json = JSON.stringify(workloadSeries(groups, F23.weeks, 'ALL'))
    for (const name of Object.values(F23.projects).map((p) => p.name)) expect(json.includes(name)).toBe(false)
    for (const id of Object.keys(F23.projects)) expect(json.includes(id)).toBe(false)
  })
})
