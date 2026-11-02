import { act, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, expect, it, vi } from 'vitest'
import { M } from '@/components/milestones/test-data.test.helper'
import { th } from '@/i18n/th'
import type { MilestoneRef } from '@/lib/contracts/milestones'
import { formatThaiDate } from '@/lib/format'
import { qk } from '@/lib/query-keys'
import { PID, response, T } from './fixtures.test.data'
import { ok, renderTasks } from './render.test.helper'
import { openTaskPanel } from './task-param'
import { TaskPanel } from './TaskPanel'

vi.mock('@/server/actions/tasks', () => ({}))
vi.mock('@/server/actions/assignments', () => ({}))
vi.mock('@/server/actions/task-blockers', () => ({}))
vi.mock('@/server/actions/allocations', () => ({}))
const a = vi.hoisted(() => ({ linkTasksToMilestone: vi.fn(), revertTaskMilestones: vi.fn() }))
vi.mock('@/server/actions/milestones', () => a)
vi.mock('@/lib/api', () => ({ getJson: vi.fn(() => new Promise(() => {})) }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), back: vi.fn() }) }))
vi.mock('@/components/editor/TaskBody', () => ({ TaskBody: () => null }))

const MILESTONES: MilestoneRef[] = [
  { id: M.cutover, name: 'Data cutover', date: '2026-10-02', completedOn: null },
  { id: M.uat, name: 'UAT sign-off', date: '2026-10-23', completedOn: null },
]
const field = () =>
  within(screen.getByRole('complementary', { name: th.tasks.panel.label })).getByRole('combobox', {
    name: th.milestones.tasks.field,
  })

function open(data = response({ milestones: MILESTONES })) {
  window.history.replaceState(null, '', '/projects/p/tasks')
  const utils = renderTasks(<TaskPanel projectId={PID} />, {
    data,
    seed: (qc) =>
      qc.setQueryData(qk.taskBody(T.a), { taskId: T.a, projectId: PID, page: null, can: { edit: true } }),
  })
  act(() => openTaskPanel(T.a))
  return utils
}

beforeEach(() => {
  a.linkTasksToMilestone.mockReset()
  a.revertTaskMilestones.mockReset()
})

it('FR-601 / M8-D14: choosing "Data cutover" binds the task (one link call, no toast)', async () => {
  const user = userEvent.setup()
  a.linkTasksToMilestone.mockReturnValue(
    ok({
      projectId: PID,
      milestoneId: M.cutover,
      milestoneName: 'Data cutover',
      changed: [{ taskId: T.a, taskName: 'ออกแบบ', previousMilestoneId: null }],
    }),
  )
  open()
  expect(field()).toHaveTextContent(th.milestones.none)
  await user.click(field())
  await user.click(
    screen.getByRole('option', {
      name: th.milestones.tasks.groupHeader('Data cutover', formatThaiDate('2026-10-02')),
    }),
  )
  await waitFor(() =>
    expect(a.linkTasksToMilestone).toHaveBeenCalledWith({ taskIds: [T.a], milestoneId: M.cutover }),
  )
  expect(screen.queryByText(th.milestones.toast.linked(1, 'Data cutover'))).not.toBeInTheDocument()
})

it('AC-702: a late task renders the alert text (not colour alone)', () => {
  const data = response({ milestones: MILESTONES })
  data.tasks = data.tasks.map((t) =>
    t.id === T.a ? { ...t, milestoneId: M.uat, lateForMilestone: true } : t,
  )
  open(data)
  expect(
    screen.getByText(th.milestones.tasks.lateAlert('UAT sign-off', formatThaiDate('2026-10-23'))),
  ).toBeInTheDocument()
  expect(field()).toHaveTextContent('UAT sign-off')
})

it('archived (canEdit false) → the select is disabled', () => {
  const data = response({ milestones: MILESTONES })
  data.viewer = { ...data.viewer, canEdit: false, canManage: false }
  open(data)
  expect(field()).toHaveAttribute('aria-disabled', 'true')
})
