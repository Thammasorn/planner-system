import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { th } from '@/i18n/th'
import type { TaskStatusDTO, TeamTasksResponse } from '@/lib/contracts/tasks'
import { PID, STATUSES, T } from '../fixtures.test.data'
import { renderTasks } from '../render.test.helper'
import { TeamTasks } from './TeamTasks'

const m = vi.hoisted(() => ({
  getJson: vi.fn(),
  setTaskStatus: vi.fn(),
  push: vi.fn(),
  dropOn: 'category:WAITING',
}))
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
      hasBody: true,
      milestoneId: null,
    },
  ],
  projects: [{ id: PID, name: 'POS Upgrade', color: '#B45309' }],
  statusesByProject: { [PID]: noWaiting },
  milestonesByProject: {},
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

  it('FR-685/691 (M6.1): the name keeps opening the project panel; ↗ opens /t/<id>; 📄 marks the body', async () => {
    renderTasks(<TeamTasks />)
    const name = await screen.findByRole('link', { name: 'งาน C' })
    const li = name.closest('li')!
    expect(within(li).getByRole('link', { name: th.tasks.openAsPage })).toHaveAttribute('href', `/t/${T.c}`)
    expect(within(li).getByRole('img', { name: th.tasks.hasBody })).toBeInTheDocument()
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

describe('M8 (FR-663, M8-D15): milestone filter + ◆ on /tasks', () => {
  const CRM = '7a1c2b8e-3d4a-4b5c-9d6e-7f8a9b0c1d2e'
  const GOLIVE = '00000000-0000-4000-8000-000000000711'
  const withMilestones: TeamTasksResponse = {
    ...page,
    cards: [{ ...page.cards[0]!, milestoneId: GOLIVE, projectId: CRM }],
    projects: [
      { id: PID, name: 'POS Upgrade', color: '#B45309' },
      { id: CRM, name: 'CRM', color: '#2F5597' },
    ],
    statusesByProject: { [CRM]: noWaiting },
    milestonesByProject: { [CRM]: [{ id: GOLIVE, name: 'Go-live', date: '2026-10-30', completedOn: null }] },
  }
  const filter = () => screen.getByRole('combobox', { name: th.milestones.tasks.filter })

  beforeEach(() => {
    m.getJson.mockImplementation((url: string) =>
      Promise.resolve(
        url === `/api/projects/${CRM}/milestones`
          ? {
              projectId: CRM,
              today: '2026-09-30',
              canManage: false,
              milestones: [
                {
                  id: GOLIVE,
                  projectId: CRM,
                  name: 'Go-live',
                  date: '2026-10-30',
                  description: null,
                  completedOn: null,
                  status: 'UPCOMING',
                  late: false,
                  lateTaskCount: 0,
                  progress: { done: 0, total: 1 },
                },
              ],
            }
          : withMilestones,
      ),
    )
  })

  it('cards show "◆ name" (no lateness on /tasks)', async () => {
    renderTasks(<TeamTasks />)
    const li = (await screen.findByRole('link', { name: 'งาน C' })).closest('li')!
    expect(within(li).getByText(th.milestones.tasks.cardLabel('Go-live'))).toBeInTheDocument()
    expect(within(li).queryByText(th.milestones.late)).toBeNull()
  })

  it('without a project the milestone filter is disabled', async () => {
    renderTasks(<TeamTasks />)
    await screen.findByRole('link', { name: 'งาน C' })
    expect(filter()).toHaveAttribute('aria-disabled', 'true')
  })

  it('with CRM selected it lists CRM milestones and the request carries milestoneId; changing the project clears it', async () => {
    const user = userEvent.setup()
    window.history.replaceState(null, '', `/tasks?projectId=${CRM}`)
    renderTasks(<TeamTasks />)
    await screen.findByRole('link', { name: 'งาน C' })
    await user.click(filter())
    await user.click(await screen.findByRole('option', { name: th.milestones.tasks.cardLabel('Go-live') }))
    await waitFor(() =>
      expect(m.getJson).toHaveBeenCalledWith(
        `/api/tasks?projectId=${CRM}&milestoneId=${GOLIVE}`,
        expect.anything(),
      ),
    )
    expect(new URLSearchParams(window.location.search).get('milestoneId')).toBe(GOLIVE)
    await user.click(screen.getByRole('combobox', { name: th.teamTasks.filters.project }))
    await user.click(await screen.findByRole('option', { name: 'POS Upgrade' }))
    expect(new URLSearchParams(window.location.search).get('milestoneId')).toBeNull()
    await waitFor(() =>
      expect(m.getJson).toHaveBeenCalledWith(`/api/tasks?projectId=${PID}`, expect.anything()),
    )
  })

  it('syncUrl={false}: history.replaceState is never called', async () => {
    const user = userEvent.setup()
    const spy = vi.spyOn(window.history, 'replaceState')
    renderTasks(<TeamTasks syncUrl={false} />)
    await screen.findByRole('link', { name: 'งาน C' })
    await user.click(screen.getByRole('combobox', { name: th.teamTasks.filters.project }))
    await user.click(await screen.findByRole('option', { name: 'CRM' }))
    await user.click(filter())
    await user.click(await screen.findByRole('option', { name: th.milestones.tasks.cardLabel('Go-live') }))
    await waitFor(() =>
      expect(m.getJson).toHaveBeenCalledWith(
        `/api/tasks?projectId=${CRM}&milestoneId=${GOLIVE}`,
        expect.anything(),
      ),
    )
    expect(spy).not.toHaveBeenCalled()
    spy.mockRestore()
  })
})
