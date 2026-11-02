import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderTasks } from '@/components/tasks/render.test.helper'
import { th } from '@/i18n/th'
import { HomeDashboard } from './HomeDashboard'
import { homeResponse, MANAGER } from './test-data.test.helper'

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }), usePathname: () => '/home' }))
vi.mock('@/server/actions/tasks', () => ({
  completeTask: vi.fn(),
  uncompleteTask: vi.fn(),
  revertTaskStatus: vi.fn(),
}))
const api = vi.hoisted(() => ({ getJson: vi.fn<(url: string) => Promise<unknown>>() }))
vi.mock('@/lib/api', async (orig) => ({
  ...(await orig<typeof import('@/lib/api')>()),
  getJson: (url: string) => api.getJson(url),
}))

const WORKER_CARDS = [
  th.home.myTasks.title,
  th.home.myLoad.title,
  th.home.milestones.title,
  th.home.leave.title,
  th.home.recentPages.title,
]

beforeEach(() => {
  api.getJson.mockReset()
})

const headings = () => screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent)

describe('HomeDashboard (FR-1101, M10-D34)', () => {
  it('a worker (manager: null) sees the five cards and no manager card', async () => {
    api.getJson.mockResolvedValue(homeResponse())
    renderTasks(<HomeDashboard />)
    await screen.findByRole('heading', { level: 2, name: th.home.myTasks.title })
    expect(headings()).toEqual(WORKER_CARDS)
    expect(screen.queryByRole('heading', { name: th.home.manager.overloadedTitle })).toBeNull()
    expect(api.getJson).toHaveBeenCalledWith('/api/home')
    // F3: next-week Peter is masked for Cindy — "ลา", no leave type
    const leave = screen.getByRole('region', { name: th.home.leave.title })
    expect(within(leave).getByText(/Peter/)).toHaveTextContent(th.masking.leave)
  })

  it('a manager sees the two manager cards first', async () => {
    api.getJson.mockResolvedValue(homeResponse({ manager: MANAGER }))
    renderTasks(<HomeDashboard />)
    await screen.findByRole('heading', { level: 2, name: th.home.manager.overloadedTitle })
    expect(headings()).toEqual([
      th.home.manager.overloadedTitle,
      th.home.manager.utilisationTitle,
      ...WORKER_CARDS,
    ])
    expect(screen.getByRole('link', { name: th.home.manager.openWorkload })).toHaveAttribute(
      'href',
      '/workload',
    )
  })

  it('a load error shows the alert; retry refetches', async () => {
    api.getJson.mockRejectedValueOnce(new Error('500'))
    const user = userEvent.setup()
    renderTasks(<HomeDashboard />)
    expect(await screen.findByText(th.home.loadError)).toBeInTheDocument()
    api.getJson.mockResolvedValue(homeResponse())
    await user.click(screen.getByRole('button', { name: th.home.retry }))
    await waitFor(() => expect(headings()).toEqual(WORKER_CARDS))
    expect(api.getJson).toHaveBeenCalledTimes(2)
  })
})
