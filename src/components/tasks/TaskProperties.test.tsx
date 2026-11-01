// FR-683/684, M6.1-D16 (plan/m06.1 S3.1): one property list for the task panel and the task page — light rows labelled
// from th.taskPage.properties, certainty as a light value + menu, subtasks with ☐ / status / people / ↗ / + เพิ่มงานย่อย.
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { th } from '@/i18n/th'
import type { ProjectTasksResponse } from '@/lib/contracts/tasks'
import { buildTaskRows } from '@/lib/tasks/tree'
import { PID, response, T } from './fixtures.test.data'
import { ok, renderTasks } from './render.test.helper'
import { TaskProperties } from './TaskProperties'

const a = vi.hoisted(() => ({ updateTask: vi.fn(), createTask: vi.fn() }))
vi.mock('@/server/actions/tasks', () => ({
  createTask: a.createTask,
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

beforeEach(() => {
  a.updateTask.mockReset()
  a.createTask.mockReset()
  window.history.replaceState(null, '', '/projects/p/tasks')
})

function show(id: string, variant: 'panel' | 'page' = 'panel', data: ProjectTasksResponse = response()) {
  const task = buildTaskRows(data.tasks).find((r) => r.id === id)!
  renderTasks(<TaskProperties projectId={PID} task={task} data={data} variant={variant} />, { data })
  return screen.getByRole('group', { name: th.taskPage.propertiesLabel })
}

const row = (list: HTMLElement, label: string) => within(list).getByRole('group', { name: label })

describe('TaskProperties (M6.1-D16)', () => {
  it('renders every property row with its label (light form)', () => {
    const list = show(T.c)
    expect(list).toHaveAttribute('data-light-form')
    for (const label of [
      th.taskPage.properties.status,
      th.taskPage.properties.done,
      th.taskPage.properties.dates,
      th.taskPage.properties.certainty,
      th.taskPage.properties.assignees,
      th.taskPage.properties.blockedBy,
      th.taskPage.properties.blocking,
      th.taskPage.properties.subtasks,
    ])
      expect(row(list, label)).toBeInTheDocument()
  })

  it('certainty: a light value with its source; the menu writes the override (ToggleButtons are gone)', async () => {
    const user = userEvent.setup()
    a.updateTask.mockReturnValue(ok({ projectId: PID, taskId: T.c }))
    const list = show(T.c)
    const r = row(list, th.taskPage.properties.certainty)
    expect(within(r).getByTestId('certainty-source')).toHaveTextContent(th.tasks.certainty.source.project)
    expect(within(r).queryByRole('button', { pressed: true })).toBeNull()
    await user.click(within(r).getByRole('button', { name: new RegExp(th.tasks.certainty.confirmed) }))
    const menu = await screen.findByRole('menu', { name: th.tasks.certainty.menuLabel })
    expect(within(menu).getByRole('menuitemradio', { name: th.tasks.certainty.inherit })).toHaveAttribute(
      'aria-checked',
      'true',
    )
    await user.click(within(menu).getByRole('menuitemradio', { name: th.tasks.certainty.tentative }))
    await waitFor(() =>
      expect(a.updateTask).toHaveBeenCalledWith(
        expect.objectContaining({ taskId: T.c, patch: { certaintyOverride: 'TENTATIVE' } }),
      ),
    )
  })

  it('an override on the task is checked in the menu and named as its source', async () => {
    const user = userEvent.setup()
    const r = row(show(T.d), th.taskPage.properties.certainty)
    expect(within(r).getByTestId('certainty-source')).toHaveTextContent(th.tasks.certainty.source.task)
    await user.click(within(r).getByRole('button', { name: new RegExp(th.tasks.certainty.tentative) }))
    expect(await screen.findByRole('menuitemradio', { name: th.tasks.certainty.tentative })).toHaveAttribute(
      'aria-checked',
      'true',
    )
  })

  it('subtasks: ☐, name, status, people and ↗ per child; panel variant opens the child in the panel', async () => {
    const user = userEvent.setup()
    const r = row(show(T.a), th.taskPage.properties.subtasks)
    const item = within(r).getByRole('listitem')
    expect(
      within(item).getByRole('checkbox', { name: th.tasks.completeCheckbox('ย่อย B') }),
    ).toBeInTheDocument()
    expect(within(item).getByRole('link', { name: th.tasks.openAsPage })).toHaveAttribute('href', `/t/${T.b}`)
    expect(within(item).getByText(th.tasks.unassigned)).toBeInTheDocument()
    await user.click(within(item).getByRole('button', { name: 'ย่อย B' }))
    expect(new URLSearchParams(window.location.search).get('task')).toBe(T.b)
  })

  it('dates: stacked in the panel variant (440 px, any viewport); side by side on the page from sm up', () => {
    const panelDates = within(show(T.c, 'panel')).getByTestId('task-dates')
    expect(panelDates).toHaveAttribute('data-layout', 'stacked')
    expect(getComputedStyle(panelDates).gridTemplateColumns).toBe('1fr')
    const arrow = panelDates.querySelector(`[aria-label="${th.taskPage.dateTo}"]`)
    expect(arrow).not.toBeNull()
    expect(getComputedStyle(arrow!).display).toBe('none')
  })

  it('dates: the page variant keeps the inline start → due layout', () => {
    expect(within(show(T.c, 'page')).getByTestId('task-dates')).toHaveAttribute('data-layout', 'inline')
  })

  it('page variant: subtask names link to their task page', () => {
    const r = row(show(T.a, 'page'), th.taskPage.properties.subtasks)
    expect(within(r).getByRole('link', { name: 'ย่อย B' })).toHaveAttribute('href', `/t/${T.b}`)
  })

  it('"+ เพิ่มงานย่อย" quick adds under the task with only a name (FR-602)', async () => {
    const user = userEvent.setup()
    a.createTask.mockReturnValue(new Promise(() => {}))
    const r = row(show(T.c), th.taskPage.properties.subtasks)
    await user.click(within(r).getByRole('button', { name: th.tasks.panel.addSubtask }))
    await user.keyboard('ย่อยใหม่{Enter}')
    await waitFor(() =>
      expect(a.createTask).toHaveBeenCalledWith(expect.objectContaining({ parentId: T.c, name: 'ย่อยใหม่' })),
    )
  })

  it('archived (canEdit false): every control is read-only', () => {
    const data = response({ viewer: { role: 'LEAD', canEdit: false, canManage: false } })
    const list = show(T.a, 'panel', data)
    expect(within(list).queryByRole('button', { name: th.tasks.panel.addSubtask })).toBeNull()
    expect(within(list).queryByRole('button', { name: th.tasks.blockers.add })).toBeNull()
    expect(within(row(list, th.taskPage.properties.done)).getByRole('checkbox')).toBeDisabled()
    expect(within(row(list, th.taskPage.properties.certainty)).getByRole('button')).toBeDisabled()
    expect(within(row(list, th.taskPage.properties.status)).queryByRole('button')).toBeNull()
  })
})
