// plan/m08 S3.1 (test-first): the pure ◆ model — placement (FR-705, AC-701, M8-D9), drop / click dates (FR-707,
// M8-D10/D11, X66), x → column, cache patches (M8-D8/D12) and the milestone marker views (FR-820, D24).
import { describe, expect, it } from 'vitest'
import { daysOfWeek } from '@/domain/dates'
import type { ISODate } from '@/domain/types'
import type { GridMilestone, GridResponse, GridTaskRow } from '@/lib/contracts/grid'
import { buildColumns, WEEK_W, type GridColumn } from './columns'
import { fxMilestone, gridResponse, POS_PEOPLE, POS_TASKS } from './fixtures.test.data'
import { markerEdgeColumn } from './markers'
import {
  applyLateness,
  applyMilestonePatch,
  columnAtX,
  dateForCellClick,
  dateForDrop,
  milestoneColumnKey,
  milestoneMarkerViews,
  placeMilestones,
  removeMilestone,
  sortedInsert,
} from './milestones'

const WEEKS: ISODate[] = ['2026-10-12', '2026-10-19', '2026-10-26']
const NONE = new Set<ISODate>()
const NO_DAYS = new Map<ISODate, ISODate[]>()
const weekCols = () => buildColumns(WEEKS, NONE, NO_DAYS)
const expandedCols = () =>
  buildColumns(WEEKS, new Set(['2026-10-19']), new Map([['2026-10-19', daysOfWeek('2026-10-19').slice(0, 5)]]))
const col = (cols: readonly GridColumn[], key: string): GridColumn => {
  const c = cols.find((x) => x.key === key)
  expect(c, key).toBeDefined()
  return c!
}

const ms = fxMilestone

describe('milestoneColumnKey (AC-701, M8-D9)', () => {
  it('week zoom: the W: column of the week holding the date', () => {
    expect(milestoneColumnKey('2026-10-23', weekCols())).toBe('W:2026-10-19')
  })
  it('expanded week: the D: column of the date (Friday 23)', () => {
    expect(milestoneColumnKey('2026-10-23', expandedCols())).toBe('D:2026-10-23')
  })
  it('expanded week without that day column (Sunday): the week\'s "รวม" column', () => {
    expect(milestoneColumnKey('2026-10-25', expandedCols())).toBe('W:2026-10-19')
  })
  it('outside the timeline → null', () => {
    expect(milestoneColumnKey('2031-01-01', weekCols())).toBeNull()
  })
})

describe('placeMilestones (M8-D9 stacking)', () => {
  it('week zoom: two ◆ of one week share one column, sorted by date then id', () => {
    const cols = weekCols()
    const placed = placeMilestones([ms('b', '2026-10-23'), ms('a', '2026-10-20')], cols)
    const idx = cols.findIndex((c) => c.key === 'W:2026-10-19')
    expect([...placed.keys()]).toEqual([idx])
    expect(placed.get(idx)!.map((m) => m.date)).toEqual(['2026-10-20', '2026-10-23'])
  })
  it('expanded week: one entry per day column', () => {
    const cols = expandedCols()
    const placed = placeMilestones([ms('a', '2026-10-20'), ms('b', '2026-10-23')], cols)
    expect([...placed.keys()].map((i) => cols[i]!.key)).toEqual(['D:2026-10-20', 'D:2026-10-23'])
  })
  it('same date: id order; outside the timeline: dropped', () => {
    const cols = weekCols()
    const placed = placeMilestones([ms('z', '2026-10-13'), ms('y', '2026-10-13'), ms('x', '2031-01-01')], cols)
    expect([...placed.values()].flat().map((m) => m.id)).toEqual(['y', 'z'])
  })
})

describe('dateForDrop (FR-707, X66: ±7 per week column keeping the weekday, ±1 per day column)', () => {
  it('a week column → the same weekday in that week', () => {
    const cols = weekCols()
    expect(dateForDrop('2026-10-23', col(cols, 'W:2026-10-26'))).toBe('2026-10-30')
    expect(dateForDrop('2026-10-23', col(cols, 'W:2026-10-12'))).toBe('2026-10-16')
  })
  it('a day column → its date', () => {
    expect(dateForDrop('2026-10-23', col(expandedCols(), 'D:2026-10-22'))).toBe('2026-10-22')
  })
  it('the "รวม" column of its own week → unchanged', () => {
    expect(dateForDrop('2026-10-23', col(expandedCols(), 'W:2026-10-19'))).toBe('2026-10-23')
  })
})

describe('dateForCellClick (M8-D11)', () => {
  it('a week column → its Monday; a day column → that day; the "รวม" column → Monday', () => {
    expect(dateForCellClick(col(weekCols(), 'W:2026-10-19'))).toBe('2026-10-19')
    expect(dateForCellClick(col(expandedCols(), 'D:2026-10-21'))).toBe('2026-10-21')
    expect(dateForCellClick(col(expandedCols(), 'W:2026-10-19'))).toBe('2026-10-19')
  })
})

describe('columnAtX', () => {
  it('binary search on offsets (week width 64)', () => {
    const cols = weekCols()
    expect(cols.map((c) => c.offset)).toEqual([0, WEEK_W, 2 * WEEK_W])
    expect(columnAtX(cols, 0)).toBe(0)
    expect(columnAtX(cols, 63)).toBe(0)
    expect(columnAtX(cols, 64)).toBe(1)
    expect(columnAtX(cols, 1000)).toBe(2)
    expect(columnAtX(cols, -20)).toBe(0)
  })
  it('mixed widths (day 44 / รวม 52)', () => {
    const cols = expandedCols()
    const fri = cols.findIndex((c) => c.key === 'D:2026-10-23')
    expect(columnAtX(cols, cols[fri]!.offset + 1)).toBe(fri)
    expect(columnAtX(cols, cols[fri]!.offset - 1)).toBe(fri - 1)
  })
  it('no columns → -1', () => {
    expect(columnAtX([], 10)).toBe(-1)
  })
})

function withMilestones(milestones: GridMilestone[], lateTask?: string): GridResponse {
  const r = gridResponse({ from: '2026-09-28', tasks: POS_TASKS, people: POS_PEOPLE })
  return {
    ...r,
    milestones,
    rows: r.rows.map((x) =>
      x.kind === 'task' && x.id === lateTask ? { ...x, milestoneId: 'm1', lateForMilestone: false } : x,
    ),
  }
}
const taskRow = (r: GridResponse, id: string) =>
  r.rows.find((x): x is GridTaskRow => x.kind === 'task' && x.id === id)!

describe('applyMilestonePatch / removeMilestone / sortedInsert (optimistic, M8-D8)', () => {
  it('moves the date and keeps milestones sorted; other milestones keep their identity', () => {
    const a = ms('m1', '2026-10-02')
    const b = ms('m2', '2026-10-09')
    const r = withMilestones([a, b])
    const next = applyMilestonePatch(r, 'm1', { date: '2026-10-16', status: 'UPCOMING' })
    expect(next.milestones.map((m) => [m.id, m.date])).toEqual([
      ['m2', '2026-10-09'],
      ['m1', '2026-10-16'],
    ])
    expect(next.milestones[0]).toBe(b)
    expect(next.rows).toBe(r.rows)
  })
  it('unknown id → same object', () => {
    const r = withMilestones([ms('m1', '2026-10-02')])
    expect(applyMilestonePatch(r, 'nope', { name: 'x' })).toBe(r)
    expect(removeMilestone(r, 'nope')).toBe(r)
  })
  it('removeMilestone drops one', () => {
    const r = withMilestones([ms('m1', '2026-10-02'), ms('m2', '2026-10-09')])
    expect(removeMilestone(r, 'm1').milestones.map((m) => m.id)).toEqual(['m2'])
  })
  it('sortedInsert places by date then id and replaces an existing id', () => {
    const list = [ms('a', '2026-10-02'), ms('c', '2026-10-09')]
    expect(sortedInsert(list, ms('b', '2026-10-05')).map((m) => m.id)).toEqual(['a', 'b', 'c'])
    expect(sortedInsert(list, ms('a', '2026-10-20')).map((m) => m.id)).toEqual(['c', 'a'])
  })
})

describe('applyLateness (M8-D12)', () => {
  it('flips only the listed task row and ◆', () => {
    const r = withMilestones([ms('m1', '2026-10-02'), ms('m2', '2026-10-09')], 't-uat')
    const next = applyLateness(r, {
      tasks: [{ taskId: 't-uat', lateForMilestone: true }],
      milestones: [{ id: 'm1', late: true, lateTaskCount: 1 }],
    })
    expect(taskRow(next, 't-uat').lateForMilestone).toBe(true)
    expect(taskRow(next, 't-pos')).toBe(taskRow(r, 't-pos'))
    expect(next.milestones[0]).toMatchObject({ id: 'm1', late: true, lateTaskCount: 1 })
    expect(next.milestones[1]).toBe(r.milestones[1])
  })
  it('null / undefined / nothing changed → the same object', () => {
    const r = withMilestones([ms('m1', '2026-10-02')], 't-uat')
    expect(applyLateness(r, null)).toBe(r)
    expect(applyLateness(r, undefined)).toBe(r)
    expect(
      applyLateness(r, {
        tasks: [{ taskId: 't-uat', lateForMilestone: false }],
        milestones: [{ id: 'm1', late: false, lateTaskCount: 0 }],
      }),
    ).toBe(r)
  })
})

describe('milestoneMarkerViews (FR-820, D24)', () => {
  it('one non-editable MILESTONE line per milestone, on the column edge of its ◆ (BR-102)', () => {
    const views = milestoneMarkerViews([ms('m1', '2026-10-23', { name: 'UAT sign-off' })])
    expect(views).toEqual([
      { id: 'ms:m1', source: 'MILESTONE', tone: 'MILESTONE', date: '2026-10-23', label: 'UAT sign-off', editable: false },
    ])
    const cols = expandedCols()
    expect(cols[markerEdgeColumn('2026-10-23', cols)!]!.key).toBe(milestoneColumnKey('2026-10-23', cols))
  })
})
