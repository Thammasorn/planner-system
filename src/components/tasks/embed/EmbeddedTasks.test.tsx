// M10 S3.3 — EmbeddedTasks + useEmbedTasks (FR-1301/1302/1306, M10-D2/D6/D7/D9/D10): the embed answer seeds M3's
// cache, board columns / filters / limit, LIST through TaskList's embed option, toolbar only when editable, archived
// read-only, always-fresh refetch, and invalidateTasks reaching both caches.
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { focusManager } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { th } from '@/i18n/th'
import { getJson } from '@/lib/api'
import type { EmbedTasksResponse } from '@/lib/contracts/embed'
import type { ProjectTasksResponse } from '@/lib/contracts/tasks'
import { invalidateTasks } from '@/lib/invalidate'
import { qk } from '@/lib/query-keys'
import { TASK_VIEW_DEFAULTS, type TaskViewProps } from '@/lib/schemas/page-content'
import { buildStatusColumns } from '@/lib/tasks/board'
import { PID, response, S, T } from '../fixtures.test.data'
import { ok, renderTasks } from '../render.test.helper'
import { TaskList } from '../TaskList'
import { EmbeddedTasks } from './EmbeddedTasks'
import { useEmbedTasks } from './useEmbedTasks'

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
vi.mock('@/lib/api', () => ({ getJson: vi.fn() }))
const nav = vi.hoisted(() => ({ push: vi.fn() }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: nav.push, back: vi.fn() }) }))
vi.mock('../TaskList', () => ({ TaskList: vi.fn(() => <div data-testid="embedded-list" />) }))
vi.mock('@/lib/tasks/board', async (orig) => {
  const m = await orig<typeof import('@/lib/tasks/board')>()
  return { ...m, buildStatusColumns: vi.fn(m.buildStatusColumns) }
})
const board = vi.hoisted(() => ({ onMove: null as null | ((cardId: string, key: string) => void) }))
vi.mock('../board/TaskBoard', async (orig) => {
  const m = await orig<typeof import('../board/TaskBoard')>()
  return {
    ...m,
    TaskBoard: (p: Parameters<typeof m.TaskBoard>[0]) => {
      board.onMove = p.onMove
      return m.TaskBoard(p)
    },
  }
})

const PAGE = '7c9e6679-7425-40de-944b-e07fc1f90ae7'
const MS = '5d0c3a1e-2b4f-4c6d-8e9f-0a1b2c3d4e5f'
const HREF = `/projects/${PID}/tasks`
const fetchJson = vi.mocked(getJson)

const projectAnswer = (data: ProjectTasksResponse = response()): EmbedTasksResponse => ({
  kind: 'project',
  projectId: PID,
  projectName: 'POS Upgrade',
  tasksHref: HREF,
  data,
})

function Block(p: { props?: Partial<TaskViewProps>; editable?: boolean; onPropsChange?: () => void }) {
  return (
    <EmbeddedTasks
      projectId={PID}
      projectName="POS Upgrade"
      tasksHref={HREF}
      props={{ ...TASK_VIEW_DEFAULTS, ...p.props }}
      editable={p.editable ?? true}
      onPropsChange={p.onPropsChange ?? vi.fn()}
    />
  )
}

/** The block body as TaskViewBlock wires it: the embed query first, then the list / board. */
function Live({ children }: { children?: ReactNode }) {
  const q = useEmbedTasks(PAGE)
  return q.data?.kind === 'project' ? <>{children ?? <Block />}</> : null
}

const columns = () => [...document.querySelectorAll<HTMLElement>('[data-column-key]')]

beforeEach(() => {
  fetchJson.mockReset()
  nav.push.mockReset()
  vi.mocked(buildStatusColumns).mockClear()
  vi.mocked(TaskList).mockClear()
  a.setTaskStatus.mockImplementation((v: { taskIds: string[]; statusId: string }) =>
    ok({
      projectId: PID,
      statusId: v.statusId,
      changed: v.taskIds.map((taskId) => ({ taskId, previous: { statusId: S.todo, completedOn: null } })),
      openDescendantIds: [],
      released: null,
    }),
  )
})

describe('useEmbedTasks (M10-D2/D10)', () => {
  it('a project answer seeds qk.projectTasks(P) with the tasks-tab payload', async () => {
    const data = response()
    fetchJson.mockResolvedValue(projectAnswer(data))
    const { qc } = renderTasks(<Live />)
    await screen.findByRole('region', { name: th.tasks.board.label })
    expect(fetchJson).toHaveBeenCalledWith(`/api/pages/${PAGE}/embed/tasks`, expect.anything())
    expect(qc.getQueryData(qk.projectTasks(PID))).toEqual(data)
    expect(qc.getQueryData(qk.pageEmbedTasks(PAGE))).toEqual({
      kind: 'project',
      projectId: PID,
      projectName: 'POS Upgrade',
      tasksHref: HREF,
    })
  })

  it('window focus fetches the embed again even when fresh (refetchOnWindowFocus: always)', async () => {
    fetchJson.mockResolvedValue(projectAnswer())
    renderTasks(<Live />)
    await waitFor(() => expect(fetchJson).toHaveBeenCalledTimes(1))
    act(() => {
      focusManager.setFocused(false)
      focusManager.setFocused(true)
    })
    await waitFor(() => expect(fetchJson).toHaveBeenCalledTimes(2))
    focusManager.setFocused(undefined)
  })

  it('invalidateTasks refetches both qk.projectTasks(P) and the embed', async () => {
    fetchJson.mockImplementation((url: string) =>
      Promise.resolve(url.includes('/embed/') ? projectAnswer() : response()),
    )
    const { qc } = renderTasks(<Live />)
    await screen.findByRole('region', { name: th.tasks.board.label })
    fetchJson.mockClear()
    await act(() => invalidateTasks(qc, PID))
    const urls = fetchJson.mock.calls.map(([u]) => u)
    expect(urls).toContain(`/api/pages/${PAGE}/embed/tasks`)
    expect(urls).toContain(`/api/projects/${PID}/tasks`)
  })

  it('a wiki answer seeds nothing', async () => {
    fetchJson.mockResolvedValue({ kind: 'wiki' })
    const { qc } = renderTasks(<Live />)
    await waitFor(() => expect(qc.getQueryData(qk.pageEmbedTasks(PAGE))).toEqual({ kind: 'wiki' }))
    expect(qc.getQueryData(qk.projectTasks(PID))).toBeUndefined()
  })
})

describe('EmbeddedTasks board (FR-1302, M10-D6)', () => {
  it('renders one column per status in status order', () => {
    renderTasks(<Block props={{ view: 'BOARD', showDone: true }} />, { data: response() })
    expect(columns().map((c) => c.getAttribute('data-column-key'))).toEqual(
      [S.todo, S.doing, S.waitData, S.blocked, S.done].map((s) => `status:${s}`),
    )
  })

  it('statusIds: an unknown id is ignored (one column); all unknown → no status filter', () => {
    const unknown = '9f8e7d6c-5b4a-4f3e-8d2c-1b0a9f8e7d6c'
    const { unmount } = renderTasks(<Block props={{ view: 'BOARD', statusIds: `${unknown},${S.doing}` }} />, {
      data: response({ tasks: response().tasks.map((t) => ({ ...t, statusId: S.doing })) }),
    })
    expect(columns()).toHaveLength(1)
    expect(columns()[0]).toHaveAttribute('data-column-key', `status:${S.doing}`)
    unmount()
    renderTasks(<Block props={{ view: 'BOARD', statusIds: unknown }} />, { data: response() })
    expect(columns()).toHaveLength(4) // every non-DONE column (showDone off)
  })

  it('cuts each column to `limit` cards and links to the tasks tab with the total', () => {
    const many = response({
      tasks: Array.from({ length: 12 }, (_, i) => ({
        ...response().tasks[2]!,
        id: `00000000-0000-4000-8000-0000000007${String(i).padStart(2, '0')}`,
        name: `งาน ${i}`,
        position: `a${String(i).padStart(2, '0')}`,
        assignees: [],
      })),
    })
    renderTasks(<Block props={{ view: 'BOARD', limit: 10 }} />, { data: many })
    const todo = columns().find((c) => c.getAttribute('data-column-key') === `status:${S.todo}`)!
    expect(within(todo).getAllByRole('article')).toHaveLength(10)
    const link = screen.getByRole('link', { name: th.editor.liveBlocks.seeAll(12) })
    expect(link).toHaveAttribute('href', HREF)
    expect(screen.getByRole('link', { name: th.editor.liveBlocks.openTasksTab })).toHaveAttribute(
      'href',
      HREF,
    )
  })

  it('a move goes through M3 setTaskStatus', async () => {
    renderTasks(<Block props={{ view: 'BOARD' }} />, { data: response() })
    act(() => board.onMove?.(T.c, `status:${S.doing}`))
    await waitFor(() =>
      expect(a.setTaskStatus).toHaveBeenCalledWith({
        taskIds: [T.c],
        statusId: S.doing,
        withChildren: false,
      }),
    )
  })

  it('a valid milestoneId reaches buildStatusColumns; an unknown one falls back to ALL', () => {
    const data = response({
      milestones: [{ id: MS, name: 'Go-live', date: '2026-10-30', completedOn: null }],
    })
    const { unmount } = renderTasks(<Block props={{ view: 'BOARD', milestoneId: MS }} />, { data })
    expect(vi.mocked(buildStatusColumns).mock.lastCall?.[2]).toMatchObject({ milestone: MS })
    unmount()
    renderTasks(<Block props={{ view: 'BOARD', milestoneId: MS }} />, { data: response() })
    expect(vi.mocked(buildStatusColumns).mock.lastCall?.[2]).toMatchObject({ milestone: 'ALL' })
  })

  it('a card opens the project tasks tab with ?task=', () => {
    renderTasks(<Block props={{ view: 'BOARD' }} />, { data: response() })
    fireEvent.click(screen.getByRole('article', { name: 'งาน C' }))
    expect(nav.push).toHaveBeenCalledWith(`${HREF}?task=${T.c}`)
  })

  it('nothing left after the filters → the empty text', () => {
    renderTasks(<Block props={{ view: 'BOARD', assigneeId: 'nobody' }} />, { data: response() })
    expect(screen.getByText(th.editor.liveBlocks.empty)).toBeInTheDocument()
  })
})

describe('EmbeddedTasks list, toolbar and archived (M10-D7/D9/D31)', () => {
  it('a load error shows the live-block error text and a retry that refetches (SPEC P4)', async () => {
    fetchJson.mockRejectedValueOnce(new Error('boom'))
    renderTasks(<Block props={{ view: 'LIST' }} />)
    expect(await screen.findByText(th.editor.liveBlocks.error)).toBeInTheDocument()
    expect(screen.queryByText('boom')).toBeNull()
    fetchJson.mockResolvedValue(response())
    fireEvent.click(screen.getByRole('button', { name: th.editor.liveBlocks.retry }))
    expect(await screen.findByTestId('embedded-list')).toBeInTheDocument()
    expect(fetchJson).toHaveBeenLastCalledWith(`/api/projects/${PID}/tasks`, expect.anything())
  })

  it('LIST renders TaskList with the embed option (no panel)', () => {
    renderTasks(<Block props={{ view: 'LIST', limit: 50 }} />, { data: response() })
    expect(screen.getByTestId('embedded-list')).toBeInTheDocument()
    const props = vi.mocked(TaskList).mock.lastCall?.[0]
    expect(props?.projectId).toBe(PID)
    expect(props?.embed?.limit).toBe(50)
    props?.embed?.onOpenTask(T.c)
    expect(nav.push).toHaveBeenCalledWith(`${HREF}?task=${T.c}`)
    expect(document.querySelector('[data-testid="task-panel"]')).toBeNull()
  })

  it('the LIST filter folds assignee and showDone', () => {
    renderTasks(<Block props={{ view: 'LIST', assigneeId: 'ivy' }} />, { data: response() })
    const filter = vi.mocked(TaskList).mock.lastCall?.[0].embed?.filter
    const tasks = response().tasks
    expect(tasks.filter((t) => filter?.(t)).map((t) => t.id)).toEqual([T.c])
    expect(filter?.({ ...tasks[2]!, statusId: S.done })).toBe(false)
  })

  it('editable → toolbar; switching the view writes the prop', () => {
    const onPropsChange = vi.fn()
    renderTasks(<Block props={{ view: 'BOARD' }} onPropsChange={onPropsChange} />, { data: response() })
    fireEvent.click(screen.getByRole('button', { name: th.editor.liveBlocks.view.LIST }))
    expect(onPropsChange).toHaveBeenCalledWith({ view: 'LIST' })
  })

  it('the filter popover writes showDone', () => {
    const onPropsChange = vi.fn()
    renderTasks(<Block props={{ view: 'BOARD' }} onPropsChange={onPropsChange} />, { data: response() })
    fireEvent.click(screen.getByRole('button', { name: th.editor.liveBlocks.filters.button }))
    fireEvent.click(screen.getByRole('switch', { name: th.editor.liveBlocks.filters.showDone }))
    expect(onPropsChange).toHaveBeenCalledWith({ showDone: true })
  })

  it('not editable → no toolbar, data still renders', () => {
    renderTasks(<Block props={{ view: 'BOARD' }} editable={false} />, { data: response() })
    expect(screen.queryByRole('toolbar')).toBeNull()
    expect(screen.getByRole('article', { name: 'งาน C' })).toBeInTheDocument()
  })

  it('archived viewer → read-only alert and no column quick add', () => {
    renderTasks(<Block props={{ view: 'BOARD' }} />, {
      data: response({ viewer: { role: 'LEAD', canEdit: false, canManage: false } }),
    })
    expect(screen.getByText(th.editor.liveBlocks.readOnlyArchived)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /เพิ่มงาน/ })).toBeNull()
  })
})
