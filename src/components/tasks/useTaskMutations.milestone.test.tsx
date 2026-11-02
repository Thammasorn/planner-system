// M8-D12/D22 (S4.11): a due-date change of a task bound to a live milestone refreshes every ◆ view.
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, expect, it, vi } from 'vitest'
import { M } from '@/components/milestones/test-data.test.helper'
import { qk } from '@/lib/query-keys'
import { PID, response, T } from './fixtures.test.data'
import { ok, renderTasks } from './render.test.helper'
import { useTaskMutations } from './useTaskMutations'

const a = vi.hoisted(() => ({ updateTask: vi.fn() }))
vi.mock('@/server/actions/tasks', () => ({ updateTask: a.updateTask }))
vi.mock('@/server/actions/assignments', () => ({}))
vi.mock('@/server/actions/task-blockers', () => ({}))

function Harness({ taskId }: { taskId: string }) {
  const m = useTaskMutations(PID)
  return (
    <button type="button" onClick={() => m.update(taskId, { dueDate: '2026-10-30' })}>
      due
    </button>
  )
}

const CAL = qk.calendar('2026-09-28', '2026-11-09')

function setup(taskId: string) {
  const data = response()
  data.tasks = data.tasks.map((t) => (t.id === T.a ? { ...t, milestoneId: M.uat } : t))
  return renderTasks(<Harness taskId={taskId} />, {
    data,
    seed: (qc) => {
      qc.setQueryData(qk.projectMilestones(PID), { milestones: [] })
      qc.setQueryData(CAL, { milestones: [] })
    },
  })
}

beforeEach(() => {
  a.updateTask.mockReset()
  a.updateTask.mockImplementation(() => ok({ task: response().tasks[0] }))
})

it('a due-date update on a bound task invalidates the milestones and the calendar', async () => {
  const user = userEvent.setup()
  const { qc } = setup(T.a)
  await user.click(screen.getByRole('button', { name: 'due' }))
  await waitFor(() => expect(qc.getQueryState(CAL)?.isInvalidated).toBe(true))
  expect(qc.getQueryState(qk.projectMilestones(PID))?.isInvalidated).toBe(true)
})

it('an unbound task leaves the calendar alone', async () => {
  const user = userEvent.setup()
  const { qc } = setup(T.c)
  await user.click(screen.getByRole('button', { name: 'due' }))
  await waitFor(() => expect(a.updateTask).toHaveBeenCalled())
  await waitFor(() => expect(qc.getQueryState(qk.projectMilestones(PID))?.isInvalidated).toBe(true))
  expect(qc.getQueryState(CAL)?.isInvalidated).toBe(false)
})
