// FR-683/686, M6.1-D16/D18/D26 (plan/m06.1 S3.3): the task page — crumbs, menu per `can`, Enter in the title moves
// focus to the body, the shared full-width switch, Esc = back unless typing or a menu is open.
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useImperativeHandle, type Ref } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { th } from '@/i18n/th'
import type { TaskPageView } from '@/lib/contracts/task-pages'
import type { ProjectTasksResponse } from '@/lib/contracts/tasks'
import { getJson } from '@/lib/api'
import { copyText } from '@/lib/copy-text'
import { DEFAULT_UPLOAD_LIMITS } from '@/lib/files/upload-rules'
import { PID, response, T } from '../fixtures.test.data'
import { ok, renderTasks } from '../render.test.helper'
import { TaskPageScreen } from './TaskPageScreen'

const nav = vi.hoisted(() => ({ push: vi.fn(), back: vi.fn(), replace: vi.fn() }))
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: nav.push, back: nav.back, replace: nav.replace }),
  usePathname: () => '/t/x',
}))
const s = vi.hoisted(() => ({
  setPageFullWidth: vi.fn(),
  updateTask: vi.fn(),
  focus: vi.fn(),
  deleteTaskTree: vi.fn(),
}))
vi.mock('@/server/actions/pages', () => ({ setPageFullWidth: s.setPageFullWidth }))
vi.mock('@/server/actions/tasks', () => ({
  createTask: vi.fn(),
  updateTask: s.updateTask,
  indentTask: vi.fn(),
  outdentTask: vi.fn(),
  moveTask: vi.fn(),
  completeTask: vi.fn(),
  uncompleteTask: vi.fn(),
  setTaskStatus: vi.fn(),
  revertTaskStatus: vi.fn(),
  deleteTaskTree: s.deleteTaskTree,
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
vi.mock('@/lib/copy-text', () => ({ copyText: vi.fn(() => Promise.resolve(true)) }))
// The editor is S2's: a stub that exposes focus() through focusRef and a focusable body.
vi.mock('@/components/editor/TaskBody', () => ({
  TaskBody: (p: { variant: string; focusRef?: Ref<{ focus(): void }> }) => {
    useImperativeHandle(p.focusRef, () => ({ focus: s.focus }), [])
    return <div data-testid="task-body" data-variant={p.variant} tabIndex={-1} />
  },
}))

const view = (over: Partial<TaskPageView['body']['can']> = {}): TaskPageView => ({
  task: { id: T.b, name: 'ย่อย B', projectId: PID },
  project: { id: PID, name: 'POS Upgrade', color: '#2F5597', archived: false },
  ancestors: [{ id: T.a, name: 'ออกแบบ' }],
  body: {
    taskId: T.b,
    projectId: PID,
    page: null,
    can: { edit: true, ...over },
    uploadLimits: DEFAULT_UPLOAD_LIMITS,
  },
})

function show(v: TaskPageView = view(), data: ProjectTasksResponse | null = response()) {
  return renderTasks(<TaskPageScreen view={v} />, data ? { data } : {})
}

const header = () => screen.getByTestId('page-header')
const openMenu = async () => {
  await userEvent.click(within(header()).getByRole('button', { name: th.layout.more }))
  return screen.findByRole('menu')
}

beforeEach(() => {
  nav.push.mockReset()
  nav.back.mockReset()
  nav.replace.mockReset()
  s.deleteTaskTree.mockReset()
  s.deleteTaskTree.mockImplementation(() => new Promise(() => {}))
  s.focus.mockReset()
  s.setPageFullWidth.mockReset()
  s.updateTask.mockReset()
})

describe('TaskPageScreen (FR-683)', () => {
  it('header crumbs: project › parent › current (text); the big title is the h1 in the column', () => {
    show()
    const crumbs = within(header()).getByRole('navigation', { name: th.layout.breadcrumb })
    expect(within(crumbs).getByRole('link', { name: 'POS Upgrade' })).toHaveAttribute(
      'href',
      `/projects/${PID}/tasks`,
    )
    expect(within(crumbs).getByRole('link', { name: 'ออกแบบ' })).toHaveAttribute('href', `/t/${T.a}`)
    expect(within(crumbs).getByText('ย่อย B')).toBeInTheDocument()
    const column = screen.getByTestId('page-column')
    expect(within(column).getByRole('heading', { level: 1, name: 'ย่อย B' })).toBeInTheDocument()
    expect(within(header()).queryByRole('heading', { level: 1 })).toBeNull()
  })

  it('renders the shared properties (page variant) and the page body', () => {
    show()
    expect(screen.getByRole('group', { name: th.taskPage.propertiesLabel })).toBeInTheDocument()
    expect(screen.getByTestId('task-body')).toHaveAttribute('data-variant', 'page')
  })

  it('a sized skeleton until the live task list arrives', () => {
    show(view(), null)
    expect(screen.getByTestId('task-properties-loading')).toBeInTheDocument()
  })

  it('a failed task-list load shows the error and a retry instead of an endless skeleton', async () => {
    vi.mocked(getJson).mockRejectedValueOnce(new Error('โหลดไม่สำเร็จ'))
    show(view(), null)
    expect(await screen.findByTestId('task-properties-error')).toHaveTextContent('โหลดไม่สำเร็จ')
    expect(screen.getByRole('button', { name: th.common.retry })).toBeInTheDocument()
    expect(screen.queryByTestId('task-properties-loading')).toBeNull()
  })

  it('M6.1-D26: 🔗 copies the absolute /t/<id> URL; a failed copy says "copy link failed" (shared copyLink)', async () => {
    show()
    vi.mocked(copyText).mockResolvedValueOnce(true)
    await userEvent.click(within(header()).getByRole('button', { name: th.layout.copyLink }))
    expect(copyText).toHaveBeenLastCalledWith(`${window.location.origin}/t/${T.b}`)
    expect(await screen.findByText(th.layout.linkCopied)).toBeInTheDocument()
    vi.mocked(copyText).mockResolvedValueOnce(false)
    const menu = await openMenu()
    await userEvent.click(within(menu).getByRole('menuitem', { name: th.layout.copyLink }))
    expect(await screen.findByText(th.layout.copyLinkFailed)).toBeInTheDocument()
  })

  it('⋯ menu with edit rights: คัดลอกลิงก์ · เปิดใน panel · เต็มความกว้าง (checkbox) · ลบงาน', async () => {
    show()
    const menu = await openMenu()
    expect(within(menu).getByRole('menuitem', { name: th.layout.copyLink })).toBeInTheDocument()
    expect(within(menu).getByRole('menuitem', { name: th.taskPage.menu.openInPanel })).toHaveAttribute(
      'href',
      `/projects/${PID}/tasks?task=${T.b}`,
    )
    expect(within(menu).getByRole('menuitemcheckbox', { name: th.layout.fullWidth })).toHaveAttribute(
      'aria-checked',
      'false',
    )
    expect(within(menu).getByRole('menuitem', { name: th.taskPage.menu.delete })).toBeInTheDocument()
  })

  it('⋯ ลบงาน deletes (no confirm), shows the undo toast and replaces /t with the list without the panel', async () => {
    s.deleteTaskTree.mockImplementation((v: { taskIds: string[] }) =>
      ok({
        projectId: PID,
        batch: '11111111-1111-4111-8111-111111111111',
        rootIds: v.taskIds,
        deletedIds: v.taskIds,
        transfer: null,
      }),
    )
    show()
    const menu = await openMenu()
    await userEvent.click(within(menu).getByRole('menuitem', { name: th.taskPage.menu.delete }))
    await waitFor(() => expect(s.deleteTaskTree).toHaveBeenCalledWith({ taskIds: [T.b] }))
    expect(await screen.findByText(th.tasks.toast.deleted('ย่อย B'))).toBeInTheDocument()
    expect(screen.getByRole('button', { name: th.undo.undo })).toBeInTheDocument()
    // never back() into `?task=<deleted id>` (the panel would say ไม่พบงาน) — M6.1-D17 pushes that entry
    expect(nav.replace).toHaveBeenCalledWith(`/projects/${PID}/tasks`)
    expect(nav.back).not.toHaveBeenCalled()
    expect(nav.push).not.toHaveBeenCalled()
  })

  it('read-only (archived): no เต็มความกว้าง and no ลบงาน', async () => {
    show(view({ edit: false }), response({ viewer: { role: 'LEAD', canEdit: false, canManage: false } }))
    const menu = await openMenu()
    expect(within(menu).queryByRole('menuitemcheckbox', { name: th.layout.fullWidth })).toBeNull()
    expect(within(menu).queryByRole('menuitem', { name: th.taskPage.menu.delete })).toBeNull()
    expect(within(menu).getByRole('menuitem', { name: th.layout.copyLink })).toBeInTheDocument()
  })

  it('เต็มความกว้าง toggles the column through setPageFullWidth({ taskId })', async () => {
    s.setPageFullWidth.mockReturnValue(ok({ pageId: 'p', fullWidth: true, changed: true }))
    show()
    expect(screen.getByTestId('page-column')).toHaveAttribute('data-full-width', 'false')
    const menu = await openMenu()
    await userEvent.click(within(menu).getByRole('menuitemcheckbox', { name: th.layout.fullWidth }))
    expect(screen.getByTestId('page-column')).toHaveAttribute('data-full-width', 'true')
    await waitFor(() => expect(s.setPageFullWidth).toHaveBeenCalledWith({ taskId: T.b, fullWidth: true }))
  })

  it('Enter that commits the title moves focus into the body (FR-683)', async () => {
    const user = userEvent.setup()
    s.updateTask.mockReturnValue(ok({ projectId: PID, taskId: T.b }))
    show()
    const column = screen.getByTestId('page-column')
    await user.click(within(column).getByRole('button', { name: 'ย่อย B' }))
    const input = within(column).getByRole('textbox', { name: th.tasks.panel.name })
    await user.clear(input)
    await user.type(input, 'ย่อย B ใหม่{Enter}')
    await waitFor(() => expect(s.focus).toHaveBeenCalledOnce())
  })

  it('Esc goes back (direct entry → the project task tab)', async () => {
    show()
    act(() => screen.getByTestId('task-body').focus())
    await userEvent.keyboard('{Escape}')
    expect(nav.push).toHaveBeenCalledWith(`/projects/${PID}/tasks`)
  })

  it('← กลับ in the header does the same', async () => {
    show()
    await userEvent.click(within(header()).getByRole('button', { name: th.layout.back }))
    expect(nav.push).toHaveBeenCalledWith(`/projects/${PID}/tasks`)
  })

  it('Esc is ignored while typing in a field or while a menu is open', async () => {
    const user = userEvent.setup()
    show()
    const column = screen.getByTestId('page-column')
    await user.click(within(column).getByRole('button', { name: 'ย่อย B' }))
    fireEvent.keyDown(within(column).getByRole('textbox', { name: th.tasks.panel.name }), {
      key: 'Escape',
      code: 'Escape',
    })
    expect(nav.push).not.toHaveBeenCalled()
    await openMenu()
    fireEvent.keyDown(document.body, { key: 'Escape', code: 'Escape' })
    expect(nav.push).not.toHaveBeenCalled()
  })

  it('a task that left the list (deleted elsewhere) shows "ไม่พบงาน" instead of the properties', () => {
    const data = response()
    data.tasks = data.tasks.filter((t) => t.id !== T.b)
    show(view(), data)
    expect(screen.getByTestId('task-gone')).toHaveTextContent(th.taskPage.notFound)
    expect(screen.queryByTestId('task-body')).toBeNull()
  })
})
