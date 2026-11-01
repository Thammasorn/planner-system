import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { th } from '@/i18n/th'
import type { TaskStatusDTO, TeamTasksResponse } from '@/lib/contracts/tasks'
import { PID, STATUSES, T } from '../fixtures.test.data'
import { renderTasks } from '../render.test.helper'
import { TeamTasks } from './TeamTasks'

const m = vi.hoisted(() => ({ getJson: vi.fn(), setTaskStatus: vi.fn(), push: vi.fn(), dropOn: 'category:WAITING' }))
vi.mock('@/lib/api', () => ({ getJson: m.getJson }))
vi.mock('@/server/actions/tasks', () => ({
  setTaskStatus: m.setTaskStatus,
  completeTask: vi.fn(),
  uncompleteTask: vi.fn(),
  revertTaskStatus: vi.fn(),
}))
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: m.push }),
  useSearchParams: () => new URLSearchParams(window.location.search),
}))
vi.mock('../board/TaskBoard', async (importOriginal) => {
  const orig = await importOriginal<typeof import('../board/TaskBoard')>()
  return {
    ...orig,
    // dnd-kit cannot measure in jsdom: the stub drops the first card on the column `m.dropOn` (WAITING by default)
    TaskBoard: (p: { columns: { cards: { id: string }[] }[]; onMove(id: string, key: string): void }) => (
      <button type="button" onClick={() => p.onMove(p.columns[0]!.cards[0]!.id, m.dropOn)}>
        drop
      </button>
    ),
  }
})

const noWaiting: TaskStatusDTO[] = STATUSES.filter((s) => s.category !== 'WAITING')
const page: TeamTasksResponse = {
  cards: [
    {
      id: T.c,
      projectId: PID,
      name: 'งาน C',
      parentPath: [],
      status: STATUSES[0]!,
      assigneeIds: ['ivy'],
      dueDate: null,
      certainty: 'CONFIRMED',
      completed: false,
      blockers: { open: 0, total: 0 },
    },
  ],
  projects: [{ id: PID, name: 'POS Upgrade', color: '#B45309' }],
  statusesByProject: { [PID]: noWaiting },
  nextCursor: null,
}

beforeEach(() => {
  window.history.replaceState(null, '', '/tasks')
  m.dropOn = 'category:WAITING'
  m.getJson.mockResolvedValue(page)
})

describe('TeamTasks (FR-665/666, M3-D33/D41)', () => {
  it('lists cards grouped by project and writes filters to the URL', async () => {
    const user = userEvent.setup()
    renderTasks(<TeamTasks />)
    expect(await screen.findByRole('link', { name: 'งาน C' })).toHaveAttribute(
      'href',
      `/projects/${PID}/tasks?task=${T.c}`,
    )
    await user.click(screen.getByRole('switch', { name: th.teamTasks.filters.blocked }))
    expect(new URLSearchParams(window.location.search).get('blocked')).toBe('true')
    await waitFor(() =>
      expect(m.getJson).toHaveBeenLastCalledWith('/api/tasks?blocked=true', expect.anything()),
    )
  })

  it('reads the initial filters from the URL', async () => {
    window.history.replaceState(null, '', `/tasks?projectId=${PID}&category=TODO&category=WAITING`)
    renderTasks(<TeamTasks />)
    await waitFor(() =>
      expect(m.getJson).toHaveBeenCalledWith(
        `/api/tasks?projectId=${PID}&category=TODO&category=WAITING`,
        expect.anything(),
      ),
    )
  })

  it('syncUrl={false}: the URL stays untouched and the request still carries the filter', async () => {
    const user = userEvent.setup()
    renderTasks(<TeamTasks syncUrl={false} />)
    await screen.findByRole('link', { name: 'งาน C' })
    await user.click(screen.getByRole('switch', { name: th.teamTasks.filters.includeDone }))
    expect(window.location.search).toBe('')
    await waitFor(() =>
      expect(m.getJson).toHaveBeenLastCalledWith('/api/tasks?includeDone=true', expect.anything()),
    )
  })

  it('a board drop into a category the project lacks shows a toast and calls nothing', async () => {
    const user = userEvent.setup()
    renderTasks(<TeamTasks />, { prefs: { 'tasks.view': 'BOARD' } })
    await user.click(await screen.findByRole('button', { name: 'drop' }))
    expect(
      await screen.findByText(
        th.tasks.status.toast.noStatusInCategory('POS Upgrade', th.tasks.status.categories.WAITING),
      ),
    ).toBeInTheDocument()
    expect(m.setTaskStatus).not.toHaveBeenCalled()
  })

  it('BR-52: a board drop into เสร็จ shows the released load instead of the status toast', async () => {
    const user = userEvent.setup()
    m.dropOn = 'category:DONE'
    const done = noWaiting.find((s) => s.category === 'DONE')!
    m.setTaskStatus.mockResolvedValue({
      ok: true,
      projectId: PID,
      statusId: done.id,
      changed: [{ taskId: T.c, previous: { statusId: STATUSES[0]!.id, completedOn: null } }],
      openDescendantIds: [],
      released: { cd: 1500, weeks: 5 },
    })
    renderTasks(<TeamTasks />, { prefs: { 'tasks.view': 'BOARD' } })
    await user.click(await screen.findByRole('button', { name: 'drop' }))
    await waitFor(() => expect(m.setTaskStatus).toHaveBeenCalled())
    expect(await screen.findByText(th.tasks.toast.released('15.0', 5))).toBeInTheDocument()
  })
})
