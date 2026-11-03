import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { th } from '@/i18n/th'
import type { TeamTasksResponse } from '@/lib/contracts/tasks'
import { PID, STATUSES, T } from '../fixtures.test.data'
import { renderTasks } from '../render.test.helper'
import { TeamTasks } from './TeamTasks'

const m = vi.hoisted(() => ({ getJson: vi.fn() }))
vi.mock('@/lib/api', () => ({ getJson: m.getJson }))
vi.mock('@/server/actions/tasks', () => ({
  setTaskStatus: vi.fn(),
  completeTask: vi.fn(),
  uncompleteTask: vi.fn(),
  revertTaskStatus: vi.fn(),
}))
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(window.location.search),
}))
vi.mock('../board/TaskBoard', async (importOriginal) => {
  const orig = await importOriginal<typeof import('../board/TaskBoard')>()
  return { ...orig, TaskBoard: () => <div data-testid="task-board" /> }
})

const IVY = 'u-ivy'
const page: TeamTasksResponse = {
  cards: [
    {
      id: T.c,
      projectId: PID,
      name: 'ทำ UAT + คู่มือหน้าร้าน',
      parentPath: [],
      status: STATUSES[0]!,
      assigneeIds: [IVY],
      dueDate: null,
      certainty: 'CONFIRMED',
      completed: false,
      blockers: { open: 0, total: 0 },
      hasBody: false,
      milestoneId: null,
      startDate: null,
      completedOn: null,
      plannedCd: 0,
    },
  ],
  projects: [{ id: PID, name: 'POS Upgrade', color: '#B45309' }],
  statusesByProject: { [PID]: STATUSES },
  milestonesByProject: {},
  nextCursor: null,
}

const urls = () => m.getJson.mock.calls.map((c) => String(c[0]))

beforeEach(() => {
  window.history.replaceState(null, '', '/people/u-ivy/tasks?tab=x')
  m.getJson.mockReset()
  m.getJson.mockImplementation((url: string) =>
    url.startsWith('/api/tasks') ? Promise.resolve(page) : new Promise(() => {}),
  )
})

describe('TeamTasks fixedUserId (FR-667 person tab, X77, M9-D15)', () => {
  it('requests carry userId, no person filter, and the URL is never touched', async () => {
    const user = userEvent.setup()
    renderTasks(<TeamTasks fixedUserId={IVY} syncUrl={false} />)
    expect(await screen.findByText('ทำ UAT + คู่มือหน้าร้าน')).toBeInTheDocument()
    expect(urls().some((u) => u.startsWith('/api/tasks?') && u.includes(`userId=${IVY}`))).toBe(true)
    expect(screen.queryByRole('combobox', { name: th.teamTasks.filters.person })).toBeNull()
    await user.click(screen.getByRole('combobox', { name: th.teamTasks.filters.category }))
    await user.click(await screen.findByRole('option', { name: th.tasks.status.categories.WAITING }))
    await waitFor(() =>
      expect(urls().some((u) => u.includes('category=WAITING') && u.includes(`userId=${IVY}`))).toBe(true),
    )
    expect(window.location.search).toBe('?tab=x')
  })

  it('forcedView="BOARD" renders TaskBoard and never writes the preference', async () => {
    renderTasks(<TeamTasks fixedUserId={IVY} syncUrl={false} forcedView="BOARD" />, {
      prefs: { 'tasks.view': 'LIST' },
    })
    expect(await screen.findByTestId('task-board')).toBeInTheDocument()
    // the only writer of `tasks.view` is the view toggle, which forcedView hides
    expect(screen.queryByRole('group', { name: th.tasks.view.label })).toBeNull()
  })

  it('the hint renders', async () => {
    renderTasks(<TeamTasks fixedUserId={IVY} syncUrl={false} hint={th.people.tasks.hiddenHint} />)
    expect(screen.getByText(th.people.tasks.hiddenHint)).toBeInTheDocument()
    expect(await screen.findByText('ทำ UAT + คู่มือหน้าร้าน')).toBeInTheDocument()
  })
})
