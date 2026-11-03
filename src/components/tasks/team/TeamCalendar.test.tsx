import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { th } from '@/i18n/th'
import type { PersonOption } from '@/lib/contracts/people'
import type { TeamTaskCard } from '@/lib/contracts/tasks'
import { PID, STATUSES, T } from '../fixtures.test.data'
import { renderTasks } from '../render.test.helper'
import { TeamCalendar } from './TeamCalendar'

const m = vi.hoisted(() => ({ getJson: vi.fn(), push: vi.fn() }))
vi.mock('@/lib/api', () => ({ getJson: m.getJson }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: m.push }) }))

const CRM = '7a1c2b8e-3d4a-4b5c-9d6e-7f8a9b0c1d2e'
function card(id: string, name: string, o: Partial<TeamTaskCard> = {}): TeamTaskCard {
  return {
    id,
    projectId: PID,
    name,
    parentPath: [],
    status: STATUSES[0]!,
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
const projects: Record<string, { name: string; color: string }> = {
  [PID]: { name: 'POS Upgrade', color: '#B45309' },
  [CRM]: { name: 'CRM', color: '#2F5597' },
}
const ivy: PersonOption = {
  id: 'ivy',
  name: 'Ivy Ivy',
  nickname: 'Ivy',
  positionId: null,
  positionName: null,
  color: null,
  active: true,
}
const cards = [
  card(T.a, 'งานมีวันที่', { startDate: '2026-11-03', dueDate: '2026-11-05', assigneeIds: ['ivy'] }),
  card(T.b, 'งานจากแผน', { projectId: CRM }),
  card(T.c, 'งานไม่มีวันที่'),
]

function renderCal(onOpen = vi.fn(), projectId?: string) {
  return renderTasks(
    <TeamCalendar
      cards={cards}
      projectOf={(id) => projects[id] ?? { name: '', color: '' }}
      people={new Map([['ivy', ivy]])}
      projectId={projectId}
      onOpen={onOpen}
      initialMonth="2026-11"
    />,
  )
}

beforeEach(() => {
  m.getJson.mockReset()
  m.getJson.mockResolvedValue({
    from: '2026-10-26',
    to: '2026-12-07',
    spans: [{ taskId: T.b, start: '2026-11-09', end: '2026-11-13' }],
  })
})

describe('TeamCalendar (M11.4, FR-669)', () => {
  it('asks the team spans route for the month grid (Mondays), with the project filter', async () => {
    renderCal(vi.fn(), CRM)
    await waitFor(() =>
      expect(m.getJson).toHaveBeenCalledWith(
        `/api/tasks/plan-spans?from=2026-10-26&to=2026-12-07&projectId=${CRM}`,
        expect.anything(),
      ),
    )
    expect(screen.getByTestId('plan-calendar-month')).toHaveTextContent('2569')
  })

  it('draws explicit-date bars and plan-only bars (จากแผน), each with its project dot and name', async () => {
    renderCal()
    const planBar = await waitFor(() => {
      const el = document.querySelector<HTMLElement>(`[data-task-bar="${T.b}"]`)
      expect(el).not.toBeNull()
      return el!
    })
    expect(planBar).toHaveAttribute('data-from-plan', 'true')
    expect(within(planBar).getByTestId('from-plan-tag')).toBeInTheDocument()
    expect(within(planBar).getByRole('button')).toHaveAccessibleName(
      expect.stringContaining(th.teamTasks.calendar.projectOf('CRM')),
    )
    const dated = document.querySelector<HTMLElement>(`[data-task-bar="${T.a}"]`)!
    expect(dated).not.toHaveAttribute('data-from-plan')
    expect(within(dated).getByTestId('bar-project-dot')).toBeInTheDocument()
    expect(dated).toHaveTextContent('งานมีวันที่ · Ivy')
    expect(dated.style.getPropertyValue('--bar-color')).toBe('#B45309')
  })

  it('lists tasks without dates or plan in ไม่มีวันที่; a bar click opens the panel, ↗ is the page', async () => {
    const user = userEvent.setup()
    const onOpen = vi.fn()
    renderCal(onOpen)
    const side = await screen.findByTestId('plan-no-dates')
    await waitFor(() => expect(within(side).getByText('งานไม่มีวันที่')).toBeInTheDocument())
    expect(within(side).queryByText('งานจากแผน')).not.toBeInTheDocument()
    const dated = document.querySelector<HTMLElement>(`[data-task-bar="${T.a}"]`)!
    await user.click(within(dated).getByRole('button'))
    expect(onOpen).toHaveBeenCalledWith(cards[0])
    expect(within(dated).getByRole('link', { name: th.tasks.openAsPage })).toHaveAttribute('href', `/t/${T.a}`)
  })

  it('a failed spans read keeps the explicit dates and says so', async () => {
    m.getJson.mockRejectedValue(new Error('boom'))
    renderCal()
    expect(await screen.findByText(th.teamTasks.calendar.spansError)).toBeInTheDocument()
    expect(document.querySelector(`[data-task-bar="${T.a}"]`)).not.toBeNull()
  })
})
