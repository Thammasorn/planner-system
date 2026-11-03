import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { task } from '@/components/tasks/fixtures.test.data'
import { renderTasks } from '@/components/tasks/render.test.helper'
import { th } from '@/i18n/th'
import type { MilestoneDTO } from '@/lib/contracts/milestones'
import type { TaskDTO } from '@/lib/contracts/tasks'
import type { BarInfo, CalendarTaskDTO } from './labels'
import { PlanAgenda } from './PlanAgenda'

const A = '00000000-0000-4000-8000-000000000001'
const B = '00000000-0000-4000-8000-000000000002'
const C = '00000000-0000-4000-8000-000000000003'

const TASKS: TaskDTO[] = [
  task({ id: A, name: 'Rollout สาขา', position: 'a0', startDate: '2026-11-03', dueDate: '2026-11-04' }),
  task({ id: B, name: 'UAT', position: 'a1', dueDate: '2026-11-04', completedOn: '2026-11-04' }),
  task({ id: C, name: 'ไม่มีวัน', position: 'a2' }),
]
const infos = new Map<string, BarInfo>(
  TASKS.map((t) => [t.id, { task: t, assignees: th.planCalendar.unassigned, certainty: 'CONFIRMED' }]),
)
/** M11.1: the agenda shows milestones (◆ in their colour) — M7.1's plan markers became milestones */
const MARKER: MilestoneDTO = {
  id: 'm1',
  projectId: 'p',
  name: th.milestones.fromMarkerName,
  date: '2026-11-20',
  description: null,
  completedOn: null,
  color: 'GREEN',
  status: 'UPCOMING',
  late: false,
  lateTaskCount: 0,
  progress: { done: 0, total: 0 },
}

function renderAgenda(
  o: {
    showCompleted?: boolean
    tasks?: CalendarTaskDTO[]
    month?: string
    infos?: Map<string, BarInfo>
  } = {},
) {
  const onOpen = vi.fn()
  const onOpenPage = vi.fn()
  renderTasks(
    <PlanAgenda
      month={o.month ?? '2026-11'}
      tasks={o.tasks ?? TASKS}
      infos={o.infos ?? infos}
      holidays={new Map([['2026-11-04', 'วันหยุดทดสอบ']])}
      milestonesByDate={new Map([['2026-11-20', [MARKER]]])}
      showCompleted={o.showCompleted ?? true}
      today="2026-11-04"
      onOpen={onOpen}
      onOpenPage={onOpenPage}
    />,
  )
  return { onOpen, onOpenPage }
}

describe('PlanAgenda (< 600 px, FR-812)', () => {
  it('lists the days with tasks (starting first, then ◂ running) and milestone-only days, in date order', () => {
    renderAgenda()
    const list = screen.getByRole('list', { name: th.planCalendar.agendaLabel('พฤศจิกายน 2569') })
    const days = within(list).getAllByRole('listitem').map((li) => li.getAttribute('data-testid'))
    expect(days).toEqual(['plan-agenda-2026-11-03', 'plan-agenda-2026-11-04', 'plan-agenda-2026-11-20'])
    const nov4 = screen.getByTestId('plan-agenda-2026-11-04')
    expect(nov4).toHaveAttribute('aria-current', 'date')
    expect(nov4).toHaveAttribute('data-holiday', 'true')
    expect(nov4).toHaveTextContent('วันหยุดทดสอบ')
    const rows = [...nov4.querySelectorAll('[data-task-bar]')].map((r) => r.getAttribute('data-task-bar'))
    expect(rows).toEqual([B, A]) // UAT starts on the 4th; Rollout runs on from the 3rd
    expect(nov4.querySelector(`[data-task-bar="${A}"]`)).toHaveAttribute('data-cut-left', 'true')
    expect(nov4.querySelector(`[data-task-bar="${B}"]`)).toHaveAttribute('data-done', 'true')
    expect(screen.getByTestId('plan-agenda-2026-11-20').querySelector('[data-milestone]')).toHaveAttribute(
      'data-color',
      'GREEN',
    )
  })

  it('rows open the panel; ↗ is a link; completed tasks follow the switch', async () => {
    const user = userEvent.setup()
    const { onOpen } = renderAgenda({ showCompleted: false })
    expect(document.querySelector(`[data-task-bar="${B}"]`)).toBeNull()
    const row = screen.getByTestId('plan-agenda-2026-11-03').querySelector<HTMLElement>(`[data-task-bar="${A}"]`)!
    await user.click(within(row).getByRole('button'))
    expect(onOpen).toHaveBeenCalledWith(A)
    expect(within(row).getByRole('link', { name: th.tasks.openAsPage })).toHaveAttribute('href', `/t/${A}`)
  })

  it('v3.6 BR-103a: a plan-only task is listed on its plan days with the "จากแผน" tag', () => {
    const planned: CalendarTaskDTO = { ...TASKS[2]!, planSpan: { start: '2026-11-09', end: '2026-11-13' } }
    const own = new Map(infos)
    own.set(C, { task: planned, assignees: th.planCalendar.unassigned, certainty: 'CONFIRMED' })
    renderAgenda({ tasks: [planned], infos: own })
    const start = screen
      .getByTestId('plan-agenda-2026-11-09')
      .querySelector<HTMLElement>(`[data-task-bar="${C}"]`)!
    expect(start).toHaveAttribute('data-from-plan', 'true')
    expect(within(start).getByTestId('from-plan-tag')).toHaveTextContent(th.planCalendar.fromPlanTag)
    expect(
      screen.getByTestId('plan-agenda-2026-11-13').querySelector(`[data-task-bar="${C}"]`),
    ).toHaveAttribute('data-cut-left', 'true')
    expect(screen.queryByTestId('plan-agenda-2026-11-16')).toBeNull()
  })

  it('empty month → ไม่มีงานในเดือนนี้', () => {
    renderAgenda({ tasks: [TASKS[2]!], month: '2026-12' })
    expect(screen.getByText(th.planCalendar.agendaEmpty)).toBeInTheDocument()
    expect(screen.queryByRole('list')).toBeNull()
  })
})
