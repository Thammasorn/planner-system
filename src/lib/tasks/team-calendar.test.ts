import { describe, expect, it } from 'vitest'
import type { TeamTaskCard } from '@/lib/contracts/tasks'
import { barSpan, monthBars, noDateTasks } from '@/lib/plan-calendar/bars'
import { agendaDays } from '@/lib/plan-calendar/agenda'
import { teamCalendarTasks } from './team-calendar'

function card(id: string, o: Partial<TeamTaskCard> = {}): TeamTaskCard {
  return {
    id,
    projectId: 'p1',
    name: id,
    parentPath: [],
    status: { id: 's', name: 'ยังไม่เริ่ม', color: 'GRAY', category: 'TODO' },
    assigneeIds: [],
    dueDate: null,
    startDate: null,
    completedOn: null,
    certainty: 'CONFIRMED',
    completed: false,
    blockers: { open: 0, total: 0 },
    hasBody: false,
    milestoneId: null,
    plannedCd: 0,
    ...o,
  }
}

describe('teamCalendarTasks (FR-669, BR-103a)', () => {
  it('merges each card with its own span; spans of other tasks are ignored', () => {
    const tasks = teamCalendarTasks(
      [card('a'), card('b', { dueDate: '2026-11-20' })],
      [
        { taskId: 'a', start: '2026-11-02', end: '2026-11-06' },
        { taskId: 'b', start: '2026-11-09', end: '2026-11-13' },
        { taskId: 'hidden', start: '2026-11-02', end: '2026-11-03' },
      ],
    )
    expect(tasks.map((t) => [t.id, t.planSpan])).toEqual([
      ['a', { start: '2026-11-02', end: '2026-11-06' }],
      ['b', { start: '2026-11-09', end: '2026-11-13' }],
    ])
    // a: plan only → both sides from the plan; b: the explicit due wins, its start comes from the plan
    expect(barSpan(tasks[0]!)).toEqual({ start: '2026-11-02', end: '2026-11-06', startFromPlan: true, endFromPlan: true })
    expect(barSpan(tasks[1]!)).toEqual({ start: '2026-11-09', end: '2026-11-20', startFromPlan: true, endFromPlan: false })
  })

  it('explicit dates win over the plan; no dates and no plan → ไม่มีวันที่', () => {
    const tasks = teamCalendarTasks(
      [card('dated', { startDate: '2026-11-03', dueDate: '2026-11-04' }), card('none')],
      [{ taskId: 'dated', start: '2026-10-01', end: '2026-12-31' }],
    )
    expect(barSpan(tasks[0]!)).toEqual({ start: '2026-11-03', end: '2026-11-04', startFromPlan: false, endFromPlan: false })
    expect(noDateTasks(tasks).map((t) => t.id)).toEqual(['none'])
  })

  it('without spans (still loading or failed) falls back to the explicit dates', () => {
    const tasks = teamCalendarTasks([card('a', { dueDate: '2026-11-05' })], undefined)
    expect(tasks[0]!.planSpan).toBeNull()
    expect(barSpan(tasks[0]!)).toMatchObject({ start: '2026-11-05', end: '2026-11-05' })
  })

  it('keeps the cards order for lanes and the agenda (the /tasks order, not a tree)', () => {
    const tasks = teamCalendarTasks(
      [
        card('z', { projectId: 'p2', startDate: '2026-11-03', dueDate: '2026-11-03' }),
        card('a', { startDate: '2026-11-03', dueDate: '2026-11-03' }),
      ],
      [],
    )
    const week = monthBars(tasks, '2026-11', { showCompleted: true }).find((w) => w.week === '2026-11-02')!
    expect(week.segments.map((s) => [s.taskId, s.lane])).toEqual([
      ['z', 0],
      ['a', 1],
    ])
    expect(agendaDays(tasks, '2026-11')[0]!.starting.map((t) => t.id)).toEqual(['z', 'a'])
  })

  it('carries completion for the done styling and the card for the panel', () => {
    const c = card('d', { completed: true, completedOn: '2026-11-02', dueDate: '2026-11-02' })
    const [t] = teamCalendarTasks([c], [])
    expect(t!.completedOn).toBe('2026-11-02')
    expect(t!.card).toBe(c)
    expect(monthBars([t!], '2026-11', { showCompleted: false }).flatMap((w) => w.segments)).toEqual([])
  })
})
