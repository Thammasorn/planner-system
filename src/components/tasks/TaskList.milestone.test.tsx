import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, expect, it, vi } from 'vitest'
import { M } from '@/components/milestones/test-data.test.helper'
import { th } from '@/i18n/th'
import type { MilestoneRef } from '@/lib/contracts/milestones'
import { formatThaiDate } from '@/lib/format'
import { PID, response, T } from './fixtures.test.data'
import { ok, renderTasks } from './render.test.helper'
import { TaskList } from './TaskList'

vi.mock('@/server/actions/tasks', () => ({}))
vi.mock('@/server/actions/assignments', () => ({}))
vi.mock('@/server/actions/task-blockers', () => ({}))
const a = vi.hoisted(() => ({ linkTasksToMilestone: vi.fn(), revertTaskMilestones: vi.fn() }))
vi.mock('@/server/actions/milestones', () => a)
vi.mock('@/lib/api', () => ({ getJson: vi.fn(() => new Promise(() => {})) }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), back: vi.fn() }) }))

// out of date order on purpose; Beta is in the future (UPCOMING), cutover in 2 days (DUE_SOON, today 2026-09-30)
const MILESTONES: MilestoneRef[] = [
  { id: M.beta, name: 'Beta', date: '2026-11-13', completedOn: null },
  { id: M.cutover, name: 'Data cutover', date: '2026-10-02', completedOn: null },
]
const row = (name: string) => screen.getByRole('row', { name })

function data() {
  const d = response({ milestones: MILESTONES })
  d.tasks = d.tasks.map((t) =>
    t.id === T.a
      ? { ...t, milestoneId: M.cutover, lateForMilestone: true }
      : t.id === T.c
        ? { ...t, milestoneId: M.beta, completedOn: '2026-09-29' }
        : t,
  )
  return d
}

beforeEach(() => {
  window.history.replaceState(null, '', '/projects/p/tasks')
  a.linkTasksToMilestone.mockReset()
})

it('FR-706: a late row shows "◆ name" and the text "เลย milestone"', () => {
  renderTasks(<TaskList projectId={PID} />, { data: data() })
  const late = within(row('ออกแบบ'))
  expect(late.getByText(th.milestones.tasks.cardLabel('Data cutover'))).toBeInTheDocument()
  expect(late.getByText('เลย milestone')).toBeInTheDocument()
  expect(within(row('งาน D')).queryByText(th.milestones.late)).toBeNull()
})

it('FR-613: group by milestone → headers in date order, status + progress over all bound rows, none-group last', () => {
  renderTasks(<TaskList projectId={PID} />, {
    data: data(),
    prefs: { 'tasks.groupBy': 'milestone', 'tasks.showCompleted': false },
  })
  const headers = document.querySelectorAll('[data-group]')
  expect([...headers].map((h) => h.getAttribute('data-group'))).toEqual([
    `milestone:${M.cutover}`,
    `milestone:${M.beta}`,
    'milestone:none',
  ])
  const cutover = headers[0] as HTMLElement
  expect(
    within(cutover).getByText(
      th.milestones.tasks.groupHeader('Data cutover', formatThaiDate('2026-10-02', 'medium')),
    ),
  ).toBeInTheDocument()
  expect(within(cutover).getByText(th.milestones.status.DUE_SOON)).toBeInTheDocument()
  // Beta's only task is completed and hidden, yet progress counts it
  expect(within(headers[1] as HTMLElement).getByText(th.milestones.progress(1, 1))).toBeInTheDocument()
  expect(within(headers[2] as HTMLElement).getByText(th.tasks.groups.noMilestone)).toBeInTheDocument()
})

it('FR-614: two selected rows + "Beta" → one link call with both ids and the linked toast', async () => {
  const user = userEvent.setup()
  a.linkTasksToMilestone.mockReturnValue(
    ok({
      projectId: PID,
      milestoneId: M.beta,
      milestoneName: 'Beta',
      changed: [
        { taskId: T.b, taskName: 'ย่อย B', previousMilestoneId: null },
        { taskId: T.d, taskName: 'งาน D', previousMilestoneId: null },
      ],
    }),
  )
  renderTasks(<TaskList projectId={PID} />, { data: data() })
  await user.keyboard('{Meta>}')
  await user.click(row('ย่อย B'))
  await user.click(row('งาน D'))
  await user.keyboard('{/Meta}')
  await user.click(screen.getByRole('button', { name: th.milestones.tasks.bulkLink }))
  await user.click(
    screen.getByRole('menuitem', {
      name: th.milestones.tasks.groupHeader('Beta', formatThaiDate('2026-11-13')),
    }),
  )
  await waitFor(() => expect(a.linkTasksToMilestone).toHaveBeenCalledTimes(1))
  expect(a.linkTasksToMilestone).toHaveBeenCalledWith({ taskIds: [T.b, T.d], milestoneId: M.beta })
  expect(await screen.findByText(th.milestones.toast.linked(2, 'Beta'))).toBeInTheDocument()
})
