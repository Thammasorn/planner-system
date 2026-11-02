import { act, fireEvent, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { th } from '@/i18n/th'
import type { TaskBodyView } from '@/lib/contracts/task-pages'
import { DEFAULT_UPLOAD_LIMITS } from '@/lib/files/upload-rules'
import { getJson } from '@/lib/api'
import { qk } from '@/lib/query-keys'
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
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), back: vi.fn() }) }))
// The editor is S2's (its own tests); here only the props the panel hands it matter.
const tb = vi.hoisted(() => ({
  props: [] as { view: { taskId: string }; variant: string; canEdit: boolean }[],
}))
vi.mock('@/components/editor/TaskBody', () => ({
  TaskBody: (p: { view: { taskId: string; page: unknown }; variant: string; canEdit: boolean }) => {
    tb.props.push(p)
    return (
      <div data-testid="task-body" data-variant={p.variant} data-has-page={String(p.view.page !== null)}>
        {th.editor.taskPlaceholder}
      </div>
    )
  },
}))

const bodyView = (taskId: string): TaskBodyView => ({
  taskId,
  projectId: PID,
  page: null,
  can: { edit: true },
  uploadLimits: DEFAULT_UPLOAD_LIMITS,
})

const panel = () => screen.getByRole('complementary', { name: th.tasks.panel.label })
const source = () => within(panel()).getByTestId('certainty-source')

function open(id: string, data = response(), withBody = true) {
  window.history.replaceState(null, '', '/projects/p/tasks')
  const utils = renderTasks(<TaskPanel projectId={PID} />, {
    data,
    seed: (qc) => {
      if (withBody) qc.setQueryData(qk.taskBody(id), bodyView(id))
    },
  })
  act(() => openTaskPanel(id))
  return utils
}

beforeEach(() => a.updateTask.mockReset())

describe('TaskPanel (FR-601, FR-611, BR-36)', () => {
  it('override on the task → "ตั้งที่งานนี้" (M6.1-D16: a light value, no toggle buttons)', () => {
    open(T.d)
    expect(source()).toHaveTextContent(th.tasks.certainty.source.task)
    expect(within(panel()).queryByRole('button', { pressed: true })).toBeNull()
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
    open(T.c, data)
    // scoped to the dates block: the M8 milestone Select has a hidden input of its own
    const inputs = within(panel())
      .getByTestId('task-dates')
      .querySelectorAll<HTMLInputElement>('input[aria-hidden="true"]')
    const due = inputs[1]
    expect(due).toBeDefined()
    fireEvent.change(due!, { target: { value: '01/10/2569' } })
    expect(within(panel()).getByText(th.tasks.errors.dueBeforeStart)).toBeInTheDocument()
    expect(a.updateTask).not.toHaveBeenCalled()
  })

  it('FR-684 (M6.1): the compact body (qk.taskBody view) replaces "หมายเหตุ"', () => {
    tb.props = []
    open(T.c)
    const body = within(panel()).getByTestId('task-body')
    expect(body).toHaveAttribute('data-variant', 'compact')
    expect(tb.props.at(-1)).toMatchObject({ view: { taskId: T.c }, variant: 'compact', canEdit: true })
    expect(within(panel()).queryByRole('textbox', { name: /หมายเหตุ/ })).toBeNull()
  })

  it('FR-684: a sized skeleton while the body view loads', () => {
    open(T.c, response(), false)
    expect(within(panel()).getByTestId('task-body-loading')).toBeInTheDocument()
    expect(within(panel()).queryByTestId('task-body')).toBeNull()
  })

  it('FR-684: a failed body load shows the error and a retry instead of an endless skeleton', async () => {
    vi.mocked(getJson).mockRejectedValueOnce(new Error('โหลดไม่สำเร็จ'))
    open(T.c, response(), false)
    expect(await within(panel()).findByTestId('task-body-error')).toHaveTextContent('โหลดไม่สำเร็จ')
    expect(within(panel()).getByRole('button', { name: th.common.retry })).toBeInTheDocument()
    expect(within(panel()).queryByTestId('task-body-loading')).toBeNull()
  })

  it('SPEC §8.12: the 440 px panel stacks the two date pickers (no side-by-side row, no arrow)', () => {
    open(T.c)
    const dates = within(panel()).getByTestId('task-dates')
    expect(dates).toHaveAttribute('data-layout', 'stacked')
    expect(getComputedStyle(dates).gridTemplateColumns).toBe('1fr')
  })

  it('FR-1604: controls that start a value line are marked to hang their padding (aligned value column)', () => {
    open(T.c)
    const list = within(panel()).getByRole('group', { name: th.taskPage.propertiesLabel })
    expect(within(list).getByRole('button', { name: th.tasks.panel.addSubtask })).toHaveAttribute('data-lead')
    expect(within(list).getByTestId('certainty-source').closest('button')).toHaveAttribute('data-lead')
    expect(within(list).getByTestId('task-dates')).toHaveAttribute('data-lead-input')
    const done = within(list).getByRole('checkbox', { name: th.tasks.panel.completed })
    expect(done.closest('[data-lead]')).not.toBeNull()
  })

  it('FR-684: "เปิดเป็นหน้า" is a real link to /t/<id>', () => {
    open(T.c)
    expect(within(panel()).getByRole('link', { name: th.tasks.openAsPage })).toHaveAttribute(
      'href',
      `/t/${T.c}`,
    )
  })

  it('M6.1-D16: the panel renders the shared property list', () => {
    open(T.c)
    expect(within(panel()).getByRole('group', { name: th.taskPage.propertiesLabel })).toHaveAttribute(
      'data-light-form',
    )
  })

  it('an unknown id shows only "ไม่พบงาน"', () => {
    open('99999999-9999-4999-8999-999999999999')
    expect(within(panel()).getByText(th.tasks.panel.notFound)).toBeInTheDocument()
    expect(within(panel()).queryByTestId('task-body')).toBeNull()
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
            assignees: [
              ...t.assignees,
              { assignmentId: '55555555-5555-4555-8555-555555555502', userId: 'jack' },
            ],
          }
        : t,
    )
    open(T.c, data)
    const p = within(panel())
    await user.click(p.getByRole('button', { name: th.tasks.picker.removeChip('Ivy') }))
    await waitFor(() =>
      expect(p.queryByRole('button', { name: th.tasks.picker.removeChip('Ivy') })).toBeNull(),
    )
    expect(p.getByRole('button', { name: th.tasks.picker.removeChip('Jack') })).toHaveFocus()
    await user.keyboard('{Enter}')
    await waitFor(() =>
      expect(p.queryByRole('button', { name: th.tasks.picker.removeChip('Jack') })).toBeNull(),
    )
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
