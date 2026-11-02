import { describe, expect, it } from 'vitest'
import { agendaDays } from './agenda'
import type { CalendarTask } from './bars'

const task = (id: string, startDate: string | null, dueDate: string | null, o: Partial<CalendarTask> = {}): CalendarTask => ({
  id,
  parentId: null,
  position: id,
  startDate,
  dueDate,
  completedOn: null,
  ...o,
})

describe('agendaDays (FR-812 phone agenda)', () => {
  it('days of the month with tasks starting or active, in date order', () => {
    const days = agendaDays([task('b', '2026-11-03', '2026-11-04'), task('a', null, '2026-11-03')], '2026-11')
    expect(days.map((d) => [d.date, d.starting.map((t) => t.id), d.active.map((t) => t.id)])).toEqual([
      ['2026-11-03', ['a', 'b'], []],
      ['2026-11-04', [], ['b']],
    ])
  })
  it('a task started last month is active on the 1st and stops at its end; days outside the month are dropped', () => {
    const days = agendaDays([task('x', '2026-10-30', '2026-11-02')], '2026-11')
    expect(days.map((d) => [d.date, d.starting.length, d.active.length])).toEqual([
      ['2026-11-01', 0, 1],
      ['2026-11-02', 0, 1],
    ])
  })
  it('no dates / completed with the switch off → nothing', () => {
    const tasks = [task('n', null, null), task('d', '2026-11-05', null, { completedOn: '2026-11-05' })]
    expect(agendaDays(tasks, '2026-11', { showCompleted: false })).toEqual([])
    expect(agendaDays(tasks, '2026-11').map((d) => d.date)).toEqual(['2026-11-05'])
  })
})
