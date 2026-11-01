import { act, fireEvent, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { th } from '@/i18n/th'
import { unassign } from '@/server/actions/assignments'
import { PID, response, T } from './fixtures.test.data'
import { renderTasks } from './render.test.helper'
import { openTaskPanel } from './task-param'
import { TaskList } from './TaskList'
import { TaskPanel } from './TaskPanel'

const a = vi.hoisted(() => ({ updateTask: vi.fn() }))
vi.mock('@/server/actions/tasks', () => ({
  createTask: vi.fn(),
  updateTask: a.updateTask,
  indentTask: vi.fn(),
  outdentTask: vi.fn(),
  moveTask: vi.fn(),
  completeTask: vi.fn(),
  uncompleteTask: vi.fn(),
  setTaskStatus: vi.fn(),
  revertTaskStatus: vi.fn(),
  deleteTaskTree: vi.fn(),
  restoreTaskBatch: vi.fn(),
}))
vi.mock('@/server/actions/assignments', () => ({
  assign: vi.fn(),
  unassign: vi.fn(),
  restoreAssignmentBatch: vi.fn(),
}))
vi.mock('@/server/actions/task-blockers', () => ({ addTaskBlocker: vi.fn(), removeTaskBlocker: vi.fn() }))
vi.mock('@/server/actions/allocations', () => ({ planAssignmentRange: vi.fn(), saveAllocations: vi.fn() }))
vi.mock('@/lib/api', () => ({ getJson: vi.fn(() => new Promise(() => {})) }))

const panel = () => screen.getByRole('complementary', { name: th.tasks.panel.label })
const source = () => within(panel()).getByTestId('certainty-source')

function open(id: string, data = response()) {
  window.history.replaceState(null, '', '/projects/p/tasks')
  const utils = renderTasks(<TaskPanel projectId={PID} />, { data })
  act(() => openTaskPanel(id))
  return utils
}

beforeEach(() => a.updateTask.mockReset())

describe('TaskPanel (FR-601, FR-611, BR-36)', () => {
  it('override on the task → "ตั้งที่งานนี้"', () => {
    open(T.d)
    expect(source()).toHaveTextContent(th.tasks.certainty.source.task)
    expect(within(panel()).getByRole('button', { name: th.tasks.certainty.tentative })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
  })

  it('override on the parent → "สืบทอดจาก \'ออกแบบ\'"', () => {
    const data = response()
    data.tasks = data.tasks.map((t) => (t.id === T.a ? { ...t, certaintyOverride: 'TENTATIVE' } : t))
    open(T.b, data)
    expect(source()).toHaveTextContent(th.tasks.certainty.source.ancestor('ออกแบบ'))
  })

  it('no override → "ตามโปรเจค"', () => {
    open(T.c)
    expect(source()).toHaveTextContent(th.tasks.certainty.source.project)
  })

  it('a due date before the start date shows the error and saves nothing', () => {
    const data = response()
    data.tasks = data.tasks.map((t) => (t.id === T.c ? { ...t, startDate: '2026-10-10' } : t))
    const { container } = open(T.c, data)
    const inputs = container.querySelectorAll<HTMLInputElement>('aside input[aria-hidden="true"]')
    const due = inputs[1]
    expect(due).toBeDefined()
    fireEvent.change(due!, { target: { value: '01/10/2569' } })
    expect(within(panel()).getByText(th.tasks.errors.dueBeforeStart)).toBeInTheDocument()
    expect(a.updateTask).not.toHaveBeenCalled()
  })

  it('an unknown id shows only "ไม่พบงาน"', () => {
    open('99999999-9999-4999-8999-999999999999')
    expect(within(panel()).getByText(th.tasks.panel.notFound)).toBeInTheDocument()
    expect(within(panel()).queryByText(th.tasks.panel.notes)).toBeNull()
  })

  it('Esc closes the panel and drops ?task=', async () => {
    open(T.c)
    expect(panel()).toBeInTheDocument()
    await userEvent.keyboard('{Escape}')
    expect(screen.queryByRole('complementary')).toBeNull()
    expect(new URLSearchParams(window.location.search).get('task')).toBeNull()
  })

  it('closing from inside the panel (✕ or Esc) puts focus back on the task row', async () => {
    const user = userEvent.setup()
    window.history.replaceState(null, '', '/projects/p/tasks')
    renderTasks(
      <>
        <TaskList projectId={PID} />
        <TaskPanel projectId={PID} />
      </>,
      { data: response() },
    )
    const rowC = () => screen.getByRole('row', { name: 'งาน C' })
    act(() => openTaskPanel(T.c))
    await user.click(within(panel()).getByRole('button', { name: th.tasks.panel.close }))
    expect(screen.queryByRole('complementary')).toBeNull()
    await waitFor(() => expect(rowC()).toHaveFocus())
    act(() => openTaskPanel(T.c))
    act(() => within(panel()).getByRole('button', { name: th.tasks.panel.close }).focus())
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('complementary')).toBeNull()
    await waitFor(() => expect(rowC()).toHaveFocus())
  })

  it('Esc in the subtask quick add gives focus back to "+ เพิ่มงานย่อย"', async () => {
    const user = userEvent.setup()
    open(T.a)
    await user.click(within(panel()).getByRole('button', { name: th.tasks.panel.addSubtask }))
    expect(within(panel()).getByRole('textbox', { name: th.tasks.panel.addSubtask })).toHaveFocus()
    await user.keyboard('{Escape}')
    expect(panel()).toBeInTheDocument()
    await waitFor(() =>
      expect(within(panel()).getByRole('button', { name: th.tasks.panel.addSubtask })).toHaveFocus(),
    )
  })

  it('× on an assignee chip hands focus to the next chip, then to "+ คน" (never <body>)', async () => {
    const user = userEvent.setup()
    vi.mocked(unassign).mockReturnValue(new Promise(() => {}))
    const data = response()
    data.tasks = data.tasks.map((t) =>
      t.id === T.c
        ? {
            ...t,
            assignees: [...t.assignees, { assignmentId: '55555555-5555-4555-8555-555555555502', userId: 'jack' }],
          }
        : t,
    )
    open(T.c, data)
    const p = within(panel())
    await user.click(p.getByRole('button', { name: th.tasks.picker.removeChip('Ivy') }))
    await waitFor(() => expect(p.queryByRole('button', { name: th.tasks.picker.removeChip('Ivy') })).toBeNull())
    expect(p.getByRole('button', { name: th.tasks.picker.removeChip('Jack') })).toHaveFocus()
    await user.keyboard('{Enter}')
    await waitFor(() => expect(p.queryByRole('button', { name: th.tasks.picker.removeChip('Jack') })).toBeNull())
    expect(p.getByRole('button', { name: th.tasks.panel.addAssignee })).toHaveFocus()
  })

  it('the close button closes the panel', async () => {
    open(T.c)
    await userEvent.click(within(panel()).getByRole('button', { name: th.tasks.panel.close }))
    expect(screen.queryByRole('complementary')).toBeNull()
  })

  it('FR-612: a leaf lists "วางแผน" per assignee; it opens the plan dialog with the task dates as defaults', async () => {
    const data = response()
    data.tasks = data.tasks.map((t) =>
      t.id === T.c ? { ...t, startDate: '2026-11-11', dueDate: '2026-11-24' } : t,
    )
    open(T.c, data)
    await userEvent.click(within(panel()).getByRole('button', { name: th.plan.buttonFor('Ivy') }))
    const dialog = await screen.findByRole('dialog', { name: th.plan.title('Ivy', 'งาน C') })
    expect(within(dialog).getByRole('textbox', { name: th.plan.totalLabel })).toHaveValue('')
    expect(within(dialog).getByRole('button', { name: th.plan.apply })).toBeDisabled()
  })

  it('FR-612: no "วางแผน" on an unassigned leaf or a parent', () => {
    open(T.d)
    expect(within(panel()).queryByTestId('plan-buttons')).toBeNull()
    open(T.a)
    expect(screen.queryAllByTestId('plan-buttons')).toHaveLength(0)
  })
})
