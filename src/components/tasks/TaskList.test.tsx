import { act, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { th } from '@/i18n/th'
import { PID, response, S, T } from './fixtures.test.data'
import { ok, renderTasks } from './render.test.helper'
import { TaskList } from './TaskList'

const a = vi.hoisted(() => ({
  createTask: vi.fn(),
  updateTask: vi.fn(),
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
vi.mock('@/server/actions/tasks', () => a)
vi.mock('@/server/actions/assignments', () => ({
  assign: vi.fn(),
  unassign: vi.fn(),
  restoreAssignmentBatch: vi.fn(),
}))
vi.mock('@/server/actions/task-blockers', () => ({ addTaskBlocker: vi.fn(), removeTaskBlocker: vi.fn() }))
vi.mock('@/lib/api', () => ({ getJson: vi.fn(() => new Promise(() => {})) }))
const nav = vi.hoisted(() => ({ push: vi.fn() }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: nav.push, back: vi.fn() }) }))

const statusResult = (
  taskIds: string[],
  statusId: string,
  released: { cd: number; weeks: number } | null = null,
) =>
  ok({
    projectId: PID,
    statusId,
    changed: taskIds.map((taskId) => ({ taskId, previous: { statusId: S.todo, completedOn: null } })),
    openDescendantIds: [],
    released,
  })

const row = (name: string) => screen.getByRole('row', { name })

beforeEach(() => {
  window.history.replaceState(null, '', '/projects/p/tasks')
  nav.push.mockReset()
  a.indentTask.mockReturnValue(ok({ changed: false }))
  a.completeTask.mockImplementation((v: { taskIds: string[] }) => statusResult(v.taskIds, S.done))
  a.setTaskStatus.mockImplementation((v: { taskIds: string[]; statusId: string }) =>
    statusResult(v.taskIds, v.statusId),
  )
  a.deleteTaskTree.mockImplementation((v: { taskIds: string[] }) =>
    ok({
      projectId: PID,
      batch: '11111111-1111-4111-8111-111111111111',
      rootIds: v.taskIds,
      deletedIds: [T.a, T.b],
      transfer: null,
    }),
  )
})

describe('TaskList (FR-603/606/607/614, §8.6)', () => {
  it('renders a treegrid whose rows expose aria-level', () => {
    renderTasks(<TaskList projectId={PID} />, { data: response() })
    expect(screen.getByRole('treegrid', { name: th.tasks.listLabel })).toBeInTheDocument()
    expect(row('ออกแบบ')).toHaveAttribute('aria-level', '1')
    expect(row('ออกแบบ')).toHaveAttribute('aria-expanded', 'true')
    expect(row('ย่อย B')).toHaveAttribute('aria-level', '2')
  })

  it('shows "รอมอบหมาย" on an unassigned leaf and the ◐ marker on a tentative task', () => {
    renderTasks(<TaskList projectId={PID} />, { data: response() })
    expect(within(row('ย่อย B')).getByText(th.tasks.unassigned)).toBeInTheDocument()
    expect(within(row('งาน C')).queryByText(th.tasks.unassigned)).toBeNull()
    expect(within(row('งาน D')).getByRole('img', { name: th.tasks.tentativeMarker })).toBeInTheDocument()
  })

  it('Tab on a row calls indentTask', async () => {
    const user = userEvent.setup()
    renderTasks(<TaskList projectId={PID} />, { data: response() })
    act(() => row('งาน C').focus())
    await user.keyboard('{Tab}')
    await waitFor(() => expect(a.indentTask).toHaveBeenCalledWith({ taskId: T.c }))
    expect(row('งาน C')).toHaveFocus()
  })

  it('Tab on the first root row (no previous sibling) makes no call', async () => {
    const user = userEvent.setup()
    renderTasks(<TaskList projectId={PID} />, { data: response() })
    act(() => row('ออกแบบ').focus())
    await user.keyboard('{Tab}')
    expect(a.indentTask).not.toHaveBeenCalled()
  })

  it('Tab in a grouped view makes no call and shows the info toast', async () => {
    const user = userEvent.setup()
    renderTasks(<TaskList projectId={PID} />, { data: response(), prefs: { 'tasks.groupBy': 'assignee' } })
    act(() => row('งาน C').focus())
    await user.keyboard('{Tab}')
    expect(await screen.findByText(th.tasks.treeOpsDisabled)).toBeInTheDocument()
    expect(a.indentTask).not.toHaveBeenCalled()
    expect(screen.queryByRole('button', { name: th.tasks.dragHandle })).toBeNull()
  })

  it('Mod+Enter completes the selection', async () => {
    const user = userEvent.setup()
    renderTasks(<TaskList projectId={PID} />, { data: response() })
    await user.click(row('งาน C'))
    await user.click(row('งาน D'))
    await user.keyboard('{Control>}')
    await user.click(row('งาน C'))
    await user.keyboard('{/Control}')
    act(() => row('งาน C').focus())
    await user.keyboard('{Control>}{Enter}{/Control}')
    await waitFor(() =>
      expect(a.completeTask).toHaveBeenCalledWith({ taskIds: [T.c, T.d], withChildren: false }),
    )
    expect(await screen.findByText(th.tasks.toast.completedMany(2))).toBeInTheDocument()
  })

  it('BR-52: Mod+Enter on a task with future load shows the released load instead of "ติ๊กเสร็จแล้ว"', async () => {
    const user = userEvent.setup()
    a.completeTask.mockImplementation((v: { taskIds: string[] }) =>
      statusResult(v.taskIds, S.done, { cd: 1875, weeks: 5 }),
    )
    renderTasks(<TaskList projectId={PID} />, { data: response() })
    await user.click(row('งาน C'))
    act(() => row('งาน C').focus())
    await user.keyboard('{Control>}{Enter}{/Control}')
    await waitFor(() => expect(a.completeTask).toHaveBeenCalledWith({ taskIds: [T.c], withChildren: false }))
    expect(await screen.findByText(th.tasks.toast.released('18.8', 5))).toBeInTheDocument()
    expect(screen.queryByText(th.tasks.toast.completed)).toBeNull()
  })

  it('BR-52: the FR-608 "ติ๊กทั้งหมด" follow-up shows the released load of the cascade', async () => {
    const user = userEvent.setup()
    a.completeTask.mockImplementation((v: { taskIds: string[] }) =>
      ok({
        projectId: PID,
        statusId: S.done,
        changed: v.taskIds.map((taskId) => ({ taskId, previous: { statusId: S.todo, completedOn: null } })),
        openDescendantIds: [T.b],
        released: null,
      }),
    )
    a.setTaskStatus.mockImplementation((v: { taskIds: string[]; statusId: string }) =>
      statusResult([T.b], v.statusId, { cd: 300, weeks: 2 }),
    )
    renderTasks(<TaskList projectId={PID} />, { data: response() })
    act(() => row('ออกแบบ').focus())
    await user.keyboard('{Control>}{Enter}{/Control}')
    await user.click(await screen.findByRole('button', { name: th.tasks.toast.completeAll }))
    await waitFor(() =>
      expect(a.setTaskStatus).toHaveBeenCalledWith({ taskIds: [T.a], statusId: S.done, withChildren: true }),
    )
    expect(await screen.findByText(th.tasks.toast.released('3.0', 2))).toBeInTheDocument()
  })

  it('BR-52: bulk เปลี่ยนสถานะ → เสร็จ shows the released load', async () => {
    const user = userEvent.setup()
    a.setTaskStatus.mockImplementation((v: { taskIds: string[]; statusId: string }) =>
      statusResult(v.taskIds, v.statusId, { cd: 300, weeks: 2 }),
    )
    renderTasks(<TaskList projectId={PID} />, { data: response() })
    await user.click(row('งาน C'))
    await user.keyboard('{Control>}')
    await user.click(row('งาน D'))
    await user.keyboard('{/Control}')
    await user.click(screen.getByRole('button', { name: th.tasks.bulk.setStatus }))
    await user.click(await screen.findByRole('option', { name: new RegExp(th.tasks.status.defaults.done) }))
    await waitFor(() =>
      expect(a.setTaskStatus).toHaveBeenCalledWith(
        expect.objectContaining({ taskIds: [T.c, T.d], statusId: S.done }),
      ),
    )
    expect(await screen.findByText(th.tasks.toast.released('3.0', 2))).toBeInTheDocument()
  })

  it('BR-52: the status chip → เสร็จ shows the released load', async () => {
    const user = userEvent.setup()
    a.setTaskStatus.mockImplementation((v: { taskIds: string[]; statusId: string }) =>
      statusResult(v.taskIds, v.statusId, { cd: 300, weeks: 2 }),
    )
    renderTasks(<TaskList projectId={PID} />, { data: response() })
    await user.click(
      within(row('งาน C')).getByRole('button', { name: new RegExp(th.tasks.status.defaults.todo) }),
    )
    await user.click(await screen.findByRole('option', { name: new RegExp(th.tasks.status.defaults.done) }))
    await waitFor(() =>
      expect(a.setTaskStatus).toHaveBeenCalledWith(
        expect.objectContaining({ taskIds: [T.c], statusId: S.done }),
      ),
    )
    expect(await screen.findByText(th.tasks.toast.released('3.0', 2))).toBeInTheDocument()
  })

  it('Delete with a parent and its child selected deletes only the parent', async () => {
    const user = userEvent.setup()
    renderTasks(<TaskList projectId={PID} />, { data: response() })
    await user.click(row('ออกแบบ'))
    await user.keyboard('{Shift>}')
    await user.click(row('ย่อย B'))
    await user.keyboard('{/Shift}')
    expect(row('ย่อย B')).toHaveAttribute('aria-selected', 'true')
    act(() => row('ออกแบบ').focus())
    await user.keyboard('{Delete}')
    await waitFor(() => expect(a.deleteTaskTree).toHaveBeenCalledWith({ taskIds: [T.a] }))
    expect(await screen.findByText(th.tasks.toast.deletedWithChildren('ออกแบบ', 1))).toBeInTheDocument()
  })

  it('Delete on a parent moves focus past its children to the next surviving row (AC-603)', async () => {
    const user = userEvent.setup()
    a.deleteTaskTree.mockReturnValue(new Promise(() => {}))
    renderTasks(<TaskList projectId={PID} />, { data: response() })
    act(() => row('ออกแบบ').focus())
    await user.keyboard('{Delete}')
    await waitFor(() => expect(a.deleteTaskTree).toHaveBeenCalledWith({ taskIds: [T.a] }))
    // the row below ออกแบบ is its child ย่อย B, which goes with it: focus lands on งาน C, never on <body>
    await waitFor(() => expect(row('งาน C')).toHaveFocus())
    expect(screen.queryByRole('row', { name: 'ย่อย B' })).toBeNull()
  })

  it('the inline quick add is a row › gridcell inside the treegrid (M3-D22)', async () => {
    const user = userEvent.setup()
    renderTasks(<TaskList projectId={PID} />, { data: response() })
    act(() => row('งาน C').focus())
    await user.keyboard('{Enter}')
    const input = await screen.findByRole('textbox', { name: th.tasks.quickAdd.label })
    expect(input).toHaveFocus()
    const grid = screen.getByRole('treegrid', { name: th.tasks.listLabel })
    expect(grid).toContainElement(input)
    const cell = input.closest('[role="gridcell"]')
    expect(cell).not.toBeNull()
    expect(cell?.parentElement).toHaveAttribute('role', 'row')
    expect(cell?.parentElement).toHaveAttribute('aria-level', '1')
  })

  it('Shift+click selects the range in display order', async () => {
    const user = userEvent.setup()
    renderTasks(<TaskList projectId={PID} />, { data: response() })
    await user.click(row('ย่อย B'))
    await user.keyboard('{Shift>}')
    await user.click(row('งาน D'))
    await user.keyboard('{/Shift}')
    expect(row('ออกแบบ')).toHaveAttribute('aria-selected', 'false')
    for (const n of ['ย่อย B', 'งาน C', 'งาน D']) expect(row(n)).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('toolbar', { name: th.tasks.bulk.selected(3) })).toBeInTheDocument()
  })

  it('Space opens the panel through ?task=', async () => {
    const user = userEvent.setup()
    renderTasks(<TaskList projectId={PID} />, { data: response() })
    act(() => row('งาน C').focus())
    await user.keyboard(' ')
    expect(new URLSearchParams(window.location.search).get('task')).toBe(T.c)
  })

  it('M6.1-D17: Shift+Space opens the task page; Space alone still opens the panel', async () => {
    const user = userEvent.setup()
    renderTasks(<TaskList projectId={PID} />, { data: response() })
    act(() => row('งาน C').focus())
    await user.keyboard('{Shift>} {/Shift}')
    expect(nav.push).toHaveBeenCalledWith(`/t/${T.c}`)
    expect(new URLSearchParams(window.location.search).get('task')).toBeNull()
  })

  it('M6.1-D17: a plain row click selects the row and opens the panel; Cmd/Ctrl/Shift+click only select', async () => {
    const user = userEvent.setup()
    renderTasks(<TaskList projectId={PID} />, { data: response() })
    await user.click(row('งาน C'))
    expect(row('งาน C')).toHaveAttribute('aria-selected', 'true')
    expect(new URLSearchParams(window.location.search).get('task')).toBe(T.c)
    window.history.replaceState(null, '', '/projects/p/tasks')
    await user.keyboard('{Meta>}')
    await user.click(row('งาน D'))
    await user.keyboard('{/Meta}')
    expect(row('งาน D')).toHaveAttribute('aria-selected', 'true')
    expect(new URLSearchParams(window.location.search).get('task')).toBeNull()
    await user.keyboard('{Shift>}')
    await user.click(row('ออกแบบ'))
    await user.keyboard('{/Shift}')
    expect(new URLSearchParams(window.location.search).get('task')).toBeNull()
  })

  it('FR-685: ↗ on every row is a real link to /t/<id>; the row menu has "เปิดเป็นหน้า"', async () => {
    const user = userEvent.setup()
    renderTasks(<TaskList projectId={PID} />, { data: response() })
    expect(within(row('งาน C')).getByRole('link', { name: th.tasks.openAsPage })).toHaveAttribute(
      'href',
      `/t/${T.c}`,
    )
    await user.click(within(row('งาน C')).getByRole('button', { name: th.tasks.rowMenu.label }))
    await user.click(await screen.findByRole('menuitem', { name: th.tasks.rowMenu.openPage }))
    expect(nav.push).toHaveBeenCalledWith(`/t/${T.c}`)
  })

  it('FR-691: 📄 beside the name only when the task has a body', () => {
    const data = response()
    data.tasks = data.tasks.map((t) => (t.id === T.c ? { ...t, hasBody: true } : t))
    renderTasks(<TaskList projectId={PID} />, { data })
    expect(within(row('งาน C')).getByRole('img', { name: th.tasks.hasBody })).toHaveAttribute(
      'title',
      th.tasks.hasBody,
    )
    expect(within(row('งาน D')).queryByRole('img', { name: th.tasks.hasBody })).toBeNull()
  })

  it('S opens the status menu; picking calls setTaskStatus', async () => {
    const user = userEvent.setup()
    renderTasks(<TaskList projectId={PID} />, { data: response() })
    act(() => row('งาน C').focus())
    await user.keyboard('s')
    const item = await screen.findByRole('option', {
      name: new RegExp(th.tasks.status.defaults.doing),
    })
    await user.click(item)
    await waitFor(() =>
      expect(a.setTaskStatus).toHaveBeenCalledWith({
        taskIds: [T.c],
        statusId: S.doing,
        withChildren: false,
      }),
    )
    expect(
      await screen.findByText(th.tasks.status.toast.changed(th.tasks.status.defaults.doing)),
    ).toBeInTheDocument()
  })

  it('shows the blocker badge', () => {
    const data = response()
    data.tasks = data.tasks.map((t) => (t.id === T.c ? { ...t, blockers: { open: 1, total: 1 } } : t))
    data.blockerEdges = [{ id: '22222222-2222-4222-8222-222222222222', taskId: T.c, blockerTaskId: T.d }]
    renderTasks(<TaskList projectId={PID} />, { data })
    expect(within(row('งาน C')).getByText(th.tasks.blockers.badgeWaiting(1))).toBeInTheDocument()
  })

  it('archived: read-only banner, no quick add', () => {
    renderTasks(<TaskList projectId={PID} />, {
      data: response({ viewer: { role: 'LEAD', canEdit: false, canManage: false } }),
    })
    expect(screen.getByText(th.tasks.readOnlyArchived)).toBeInTheDocument()
    expect(screen.queryByRole('textbox', { name: th.tasks.quickAdd.label })).toBeNull()
  })

  it('archived: Tab leaves the treegrid (no focus trap) and Mod+Enter changes nothing', async () => {
    const user = userEvent.setup()
    a.completeTask.mockClear()
    a.indentTask.mockClear()
    renderTasks(
      <>
        <TaskList projectId={PID} />
        <button type="button">after</button>
      </>,
      { data: response({ viewer: { role: 'LEAD', canEdit: false, canManage: false } }) },
    )
    act(() => row('งาน C').focus())
    await user.keyboard('{Control>}{Enter}{/Control}')
    expect(a.completeTask).not.toHaveBeenCalled()
    expect(row('งาน C')).not.toHaveAttribute('data-completed')
    await user.keyboard('{Tab}')
    expect(screen.getByRole('button', { name: 'after' })).toHaveFocus()
    expect(a.indentTask).not.toHaveBeenCalled()
  })

  it('roving focus: the focused row is the only tab stop in the treegrid (M3-D22)', () => {
    const data = response()
    data.tasks = data.tasks.map((t) => (t.id === T.c ? { ...t, blockers: { open: 1, total: 1 } } : t))
    data.blockerEdges = [{ id: '22222222-2222-4222-8222-222222222222', taskId: T.c, blockerTaskId: T.d }]
    renderTasks(<TaskList projectId={PID} />, { data })
    const grid = screen.getByRole('treegrid', { name: th.tasks.listLabel })
    // the controls a row renders: name, status chip, blocker badge (with names), +คน, × chip
    expect(within(row('งาน C')).getByText(th.tasks.blockers.badgeWaiting(1))).toBeInTheDocument()
    expect(within(row('งาน C')).getByRole('button', { name: th.tasks.panel.addAssignee })).toBeInTheDocument()
    const stops = [...grid.querySelectorAll<HTMLElement>('a[href], button, input, [tabindex]')].filter(
      (el) => el.tabIndex >= 0 && !(el as HTMLButtonElement).disabled,
    )
    expect(stops).toEqual([row('ออกแบบ')])
  })

  it('F2 renames; Esc cancels and gives focus back to the row', async () => {
    const user = userEvent.setup()
    renderTasks(<TaskList projectId={PID} />, { data: response() })
    act(() => row('งาน C').focus())
    await user.keyboard('{F2}')
    expect(screen.getByRole('textbox', { name: th.tasks.panel.name })).toHaveFocus()
    await user.keyboard('{Escape}')
    await waitFor(() => expect(row('งาน C')).toHaveFocus())
  })

  it('Alt+↓ moves the row among its siblings and keeps focus on it (M3-D10)', async () => {
    const user = userEvent.setup()
    a.moveTask.mockReturnValue(new Promise(() => {}))
    renderTasks(<TaskList projectId={PID} />, { data: response() })
    act(() => row('งาน C').focus())
    await user.keyboard('{Alt>}{ArrowDown}{/Alt}')
    await waitFor(() => expect(a.moveTask).toHaveBeenCalledWith(expect.objectContaining({ taskId: T.c })))
    expect(row('งาน C')).toHaveFocus()
  })

  it('Shift+F10 opens the row menu with ย้ายขึ้น / ย้ายลง', async () => {
    const user = userEvent.setup()
    renderTasks(<TaskList projectId={PID} />, { data: response() })
    act(() => row('งาน C').focus())
    await user.keyboard('{Shift>}{F10}{/Shift}')
    const menu = await screen.findByRole('menu')
    expect(within(menu).getByRole('menuitem', { name: th.tasks.rowMenu.moveUp })).toBeInTheDocument()
    expect(within(menu).getByRole('menuitem', { name: th.tasks.rowMenu.moveDown })).toBeInTheDocument()
  })

  it('grouped: the group header puts its title and its count in cells', () => {
    renderTasks(<TaskList projectId={PID} />, { data: response(), prefs: { 'tasks.groupBy': 'certainty' } })
    const header = screen
      .getAllByRole('row')
      .find((r) => within(r).queryByRole('columnheader', { name: th.tasks.groups.tentative }))
    expect(header).toBeDefined()
    expect(within(header!).getByRole('gridcell')).toHaveTextContent(th.my.countLabel(1))
  })

  it('N focuses quick add; Enter creates tasks at the end', async () => {
    const user = userEvent.setup()
    a.createTask.mockImplementation((v: { name: string }) =>
      ok({
        task: {
          ...response().tasks[2]!,
          id: '33333333-3333-4333-8333-333333333333',
          name: v.name,
          assignees: [],
        },
        transfer: null,
      }),
    )
    renderTasks(<TaskList projectId={PID} />, { data: response() })
    await user.keyboard('n')
    const input = screen.getByRole('textbox', { name: th.tasks.quickAdd.label })
    expect(input).toHaveFocus()
    await user.keyboard('X{Enter}')
    await waitFor(() =>
      expect(a.createTask).toHaveBeenCalledWith({ projectId: PID, parentId: null, name: 'X' }),
    )
    expect(input).toHaveFocus()
  })

  it('Enter that commits a rename also opens quick add below the row (M3-D18)', async () => {
    const user = userEvent.setup()
    a.updateTask.mockReturnValue(ok({}))
    renderTasks(<TaskList projectId={PID} />, { data: response() })
    act(() => row('งาน C').focus())
    await user.keyboard('{F2}')
    await user.keyboard('{Control>}a{/Control}ใหม่{Enter}')
    await waitFor(() => expect(a.updateTask).toHaveBeenCalledWith({ taskId: T.c, patch: { name: 'ใหม่' } }))
    await waitFor(() => expect(screen.getByRole('textbox', { name: th.tasks.quickAdd.label })).toHaveFocus())
  })

  it('bulk bar: ยกเลิกการเลือก gives focus back to the active row', async () => {
    const user = userEvent.setup()
    renderTasks(<TaskList projectId={PID} />, { data: response() })
    await user.click(row('งาน C'))
    await user.keyboard('{Control>}')
    await user.click(row('งาน D'))
    await user.keyboard('{/Control}')
    await user.click(screen.getByRole('button', { name: th.tasks.bulk.clear }))
    await waitFor(() => expect(row('งาน D')).toHaveFocus())
    expect(row('งาน C')).toHaveAttribute('aria-selected', 'false')
  })

  it('bulk bar: ลบ moves focus to the next surviving row', async () => {
    const user = userEvent.setup()
    a.deleteTaskTree.mockReturnValue(new Promise(() => {}))
    renderTasks(<TaskList projectId={PID} />, { data: response() })
    await user.click(row('ออกแบบ'))
    await user.keyboard('{Control>}')
    await user.click(row('งาน C'))
    await user.keyboard('{/Control}')
    act(() => row('ออกแบบ').focus())
    await user.click(screen.getByRole('button', { name: th.tasks.bulk.delete }))
    await waitFor(() => expect(a.deleteTaskTree).toHaveBeenCalledWith({ taskIds: [T.a, T.c] }))
    await waitFor(() => expect(row('งาน D')).toHaveFocus())
  })
})
