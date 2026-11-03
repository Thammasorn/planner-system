import { describe, expect, it } from 'vitest'
import { th } from '@/i18n/th'
import { formatLeaveRange, formatThaiDate } from '@/lib/format'
import { fxMilestone, gridResponse, type FxTask } from './fixtures.test.data'
import { mergeChunks } from './merge'
import { buildViewRows } from './rows'
import { cellMarks, dayParts, headerRowTooltipFor, headerTooltipFor, leaveInWeek, milestoneTooltipFor, tooltipFor } from './tooltip'

const tasks: FxTask[] = [
  {
    id: 't',
    name: 'DW',
    assignees: [
      {
        taId: 'a',
        userId: 'peter',
        cells: {
          '2026-10-05': 375,
          '2026-11-09': { days: { '2026-11-11': 67, '2026-11-12': 67, '2026-11-13': 66 } },
        },
      },
    ],
  },
  {
    id: 'd',
    name: 'done',
    completedWeek: '2026-09-28',
    assignees: [{ taId: 'b', userId: 'ivy', cells: { '2026-10-05': 100 } }],
  },
]
const m = mergeChunks([
  gridResponse({
    from: '2026-09-28',
    weeks: 8,
    tasks,
    people: {
      peter: {
        name: 'Peter',
        capacity: { '2026-10-05': 300 },
        timeOff: [{ start: '2026-10-08', end: '2026-10-09', half: null, label: 'ลาพักร้อน' }],
      },
      ivy: { name: 'Ivy', capacity: { '2026-10-12': 0 } },
    },
    holidays: [{ date: '2026-10-13', name: 'วันนวมินทรมหาราช' }],
  }),
])!
const rows = buildViewRows(m, { showCompleted: true, collapsed: new Set() })
const dw = rows.find((r) => r.key === 'a:a')!
const done = rows.find((r) => r.key === 'a:b')!

describe('tooltip + marks (FR-804/807, BR-20a, BR-50)', () => {
  it('leave overlap per week', () => {
    expect(leaveInWeek(m.people.peter!.timeOff, '2026-10-05')).toHaveLength(1)
    expect(leaveInWeek(m.people.peter!.timeOff, '2026-10-12')).toHaveLength(0)
    expect(cellMarks(m, dw, 'W:2026-10-05').leave).toBe(true)
  })

  it('exact value, leave line and fraction formula', () => {
    expect(tooltipFor(dw, 'W:2026-10-05', m, { unit: 'DAYS' })).toEqual([
      th.grid.cell.exact('3.75'),
      th.grid.cell.leave('ลาพักร้อน', formatLeaveRange('2026-10-08', '2026-10-09', null)),
    ])
    expect(tooltipFor(dw, 'W:2026-10-05', m, { unit: 'FRACTION' })[0]).toBe(
      th.units.fractionTooltip('1.25', '3.00', '3.75'),
    )
  })

  it('DAY weeks list their days (2 decimals)', () => {
    expect(dayParts({ '2026-11-12': 67, '2026-11-11': 67, '2026-11-13': 66 })).toBe(
      'พ 0.67 · พฤ 0.67 · ศ 0.66',
    )
    expect(tooltipFor(dw, 'W:2026-11-09', m, { unit: 'DAYS' })).toContain(
      th.grid.cell.dayTooltip('พ 0.67 · พฤ 0.67 · ศ 0.66'),
    )
  })

  it('weeks after completedWeek are marked not counted', () => {
    expect(cellMarks(m, done, 'W:2026-10-05').notCounted).toBe(true)
    expect(cellMarks(m, done, 'W:2026-09-28').notCounted).toBe(false)
    expect(tooltipFor(done, 'W:2026-10-05', m, { unit: 'DAYS' })).toContain(th.grid.cell.notCounted)
  })

  it('capacity 0 → noCapacity mark + line; holidays in cell and header tooltips', () => {
    expect(cellMarks(m, done, 'W:2026-10-12').noCapacity).toBe(true)
    const lines = tooltipFor(done, 'W:2026-10-12', m, { unit: 'DAYS' })
    expect(lines).toContain(th.grid.cell.noCapacity)
    expect(lines).toContain(th.grid.cell.holiday('วันนวมินทรมหาราช'))
    expect(headerTooltipFor(m, '2026-10-12')).toBe(th.grid.header.holiday('วันนวมินทรมหาราช'))
    expect(headerTooltipFor(m, '2026-10-05')).toBeNull()
  })
})

describe('milestoneTooltipFor (M8 S3.3)', () => {
  it('name, date, status, progress, late count and the first 200 characters of the description', () => {
    const m = fxMilestone('m1', '2026-10-02', {
      name: 'UAT sign-off',
      status: 'DUE_SOON',
      late: true,
      lateTaskCount: 1,
      progress: { done: 1, total: 3 },
      description: 'ก'.repeat(250),
    })
    expect(milestoneTooltipFor(m)).toEqual([
      'UAT sign-off',
      th.milestones.dateLine(formatThaiDate('2026-10-02', 'medium'), th.milestones.status.DUE_SOON),
      th.milestones.progress(1, 3),
      th.milestones.color.line(th.milestones.color.name.PURPLE, th.milestones.color.pattern.PURPLE),
      th.milestones.lateTasks(1),
      'ก'.repeat(200) + '…',
    ])
  })
  it('not late, no description → no late / description lines', () => {
    const lines = milestoneTooltipFor(fxMilestone('m1', '2026-10-02', { name: 'X', status: 'DONE' }))
    expect(lines).toHaveLength(4) // name, date · status, progress, colour (M11.1)
    expect(lines.join(' ')).not.toContain(th.milestones.late)
  })
})

describe('headerRowTooltipFor (M9 person grid, S3.4)', () => {
  it('exact value (2 decimals) of a project / masked cell, nothing for an empty one; never a name', () => {
    expect(headerRowTooltipFor({ total: 125, committed: 0 })).toEqual([th.grid.cell.exact('1.25')])
    expect(headerRowTooltipFor(undefined)).toEqual([])
    expect(headerRowTooltipFor({ total: 0, committed: 0 })).toEqual([])
  })
})
