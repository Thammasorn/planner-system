import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, it, vi } from 'vitest'
import { useUndo } from '@/components/undo/useUndo'
import { th } from '@/i18n/th'
import type { SetTaskStatusResult, TaskCard } from '@/lib/contracts/tasks'
import { PID, S, STATUSES, T } from '../fixtures.test.data'
import { ok, renderTasks } from '../render.test.helper'
import { useSetTaskStatus } from './useSetTaskStatus'

const m = vi.hoisted(() => ({ setTaskStatus: vi.fn(), revertTaskStatus: vi.fn() }))
vi.mock('@/server/actions/tasks', () => ({
  setTaskStatus: m.setTaskStatus,
  completeTask: vi.fn(),
  uncompleteTask: vi.fn(),
  revertTaskStatus: m.revertTaskStatus,
}))

const done = STATUSES.find((s) => s.id === S.done)!
const card: TaskCard = {
  id: T.a,
  projectId: PID,
  name: 'งาน A',
  parentPath: [],
  status: STATUSES[0]!,
  assigneeIds: [],
  dueDate: null,
  certainty: 'CONFIRMED',
  completed: false,
  blockers: { open: 0, total: 0 },
}
const prev = { statusId: S.todo, completedOn: null }

function Harness() {
  const s = useSetTaskStatus()
  const undo = useUndo()
  return (
    <>
      <button type="button" onClick={() => s.setStatus(card, done)}>
        set
      </button>
      <button type="button" onClick={() => void undo.undo()}>
        undo
      </button>
    </>
  )
}

it('FR-608 "ติ๊กทั้งหมด" on /tasks pushes its own undo entry that reverts the cascaded children', async () => {
  const user = userEvent.setup()
  m.setTaskStatus.mockImplementation((input: { withChildren?: boolean }) =>
    ok<SetTaskStatusResult>(
      input.withChildren
        ? {
            projectId: PID,
            statusId: S.done,
            changed: [
              { taskId: T.b, previous: prev },
              { taskId: T.c, previous: prev },
            ],
            openDescendantIds: [],
          }
        : {
            projectId: PID,
            statusId: S.done,
            changed: [{ taskId: T.a, previous: prev }],
            openDescendantIds: [T.b, T.c],
          },
    ),
  )
  m.revertTaskStatus.mockImplementation(() =>
    ok<SetTaskStatusResult>({ projectId: PID, statusId: null, changed: [], openDescendantIds: [] }),
  )
  renderTasks(<Harness />)
  await user.click(screen.getByRole('button', { name: 'set' }))
  await user.click(await screen.findByRole('button', { name: th.tasks.toast.completeAll }))
  await waitFor(() =>
    expect(m.setTaskStatus).toHaveBeenLastCalledWith({
      taskIds: [T.a],
      statusId: S.done,
      withChildren: true,
    }),
  )
  expect(await screen.findByText(th.tasks.toast.completedMany(2))).toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: 'undo' }))
  await waitFor(() =>
    expect(m.revertTaskStatus).toHaveBeenCalledWith({
      items: [
        { taskId: T.b, ...prev },
        { taskId: T.c, ...prev },
      ],
    }),
  )
})
