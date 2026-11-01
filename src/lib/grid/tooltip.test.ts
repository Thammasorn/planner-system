import { describe, expect, it } from 'vitest'
import { th } from '@/i18n/th'
import { formatLeaveRange } from '@/lib/format'
import { gridResponse, type FxTask } from './fixtures.test.data'
import { mergeChunks } from './merge'
import { buildViewRows } from './rows'
import { cellMarks, dayParts, headerTooltipFor, leaveInWeek, tooltipFor } from './tooltip'

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
