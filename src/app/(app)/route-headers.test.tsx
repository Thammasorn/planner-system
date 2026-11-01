// One header-bar check per signed-in route (FR-1603, AC-1603; plan/m06.1 S4.4): each screen renders the 48 px
// `page-header` with the breadcrumb of the plan's route table, and exactly one <h1> (work screens: the last crumb).
// Server pages run with their data sources mocked; the heavy client views they wrap are stubbed.
import { screen, within } from '@testing-library/react'
import type { ReactElement } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { UndoProvider } from '@/components/undo/UndoProvider'
import { th } from '@/i18n/th'
import { renderWithProviders } from '../../../tests/helpers/render'

vi.mock('next/navigation', () => ({
  usePathname: () => mocks.pathname,
  useRouter: () => ({ push: vi.fn(), back: vi.fn(), refresh: vi.fn() }),
  useSelectedLayoutSegment: () => 'overview',
}))
const mocks = vi.hoisted(() => ({
  pathname: '/home',
  manager: true,
  projects: [] as unknown[],
}))
vi.mock('@/server/session', () => ({
  requirePageUser: () => Promise.resolve({ id: 'u1', role: mocks.manager ? 'manager' : 'worker' }),
  requireManagerPage: () => Promise.resolve({ id: 'u1', role: 'manager' }),
}))
vi.mock('@/server/authz', () => ({ isManager: () => mocks.manager }))
vi.mock('@/server/db/client', () => ({ db: {} }))
vi.mock('@/server/services', () => ({
  projects: { listProjectsForViewer: () => Promise.resolve(mocks.projects) },
  clients: { listClientsForViewer: () => Promise.resolve([]) },
}))
vi.mock('@/server/actions/projects', () => ({ createProject: vi.fn(), updateProject: vi.fn() }))
vi.mock('@/server/actions/clients', () => ({}))
vi.mock('@/components/tasks/MyTasks', () => ({ MyTasks: () => <div data-testid="my-tasks" /> }))
vi.mock('@/components/tasks/team/TeamTasks', () => ({ TeamTasks: () => <div data-testid="team-tasks" /> }))

const bar = () => screen.getByTestId('page-header')
const crumbsText = () =>
  within(within(bar()).getByRole('navigation', { name: th.layout.breadcrumb }))
    .getAllByRole('listitem')
    .map((li) => li.textContent?.replace('›', '').trim())

async function renderRoute(page: () => Promise<ReactElement> | ReactElement) {
  renderWithProviders(<UndoProvider>{await page()}</UndoProvider>)
}

describe('header bar on every signed-in route (S4.4)', () => {
  it('/home — หน้าหลัก', async () => {
    const { default: Page } = await import('./home/page')
    await renderRoute(() => Page())
    expect(crumbsText()).toEqual([th.home.title])
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1)
    expect(within(bar()).getByRole('heading', { level: 1 })).toHaveTextContent(th.home.title)
  })

  it('/my — งานของฉัน', async () => {
    const { default: Page } = await import('./my/page')
    await renderRoute(() => Page())
    expect(within(bar()).getByRole('heading', { level: 1 })).toHaveTextContent(th.my.title)
    expect(screen.getByTestId('my-tasks')).toBeInTheDocument()
  })

  it('/tasks — งานของทีม', async () => {
    const { default: Page } = await import('./tasks/page')
    await renderRoute(() => Page())
    expect(within(bar()).getByRole('heading', { level: 1 })).toHaveTextContent(th.teamTasks.title)
  })

  it('/projects — the list title; สร้างโปรเจค (manager) in the actions', async () => {
    mocks.manager = true
    const { default: Page } = await import('./projects/page')
    await renderRoute(() => Page({ searchParams: Promise.resolve({}) } as unknown as PageProps<'/projects'>))
    expect(within(bar()).getByRole('heading', { level: 1 })).toHaveTextContent(th.projects.listTitle)
    const actions = screen.getByTestId('page-header-actions')
    expect(within(actions).getByRole('button', { name: th.projects.create })).toBeInTheDocument()
  })

  it('/projects?archived=1 — โปรเจค › archived list', async () => {
    const { default: Page } = await import('./projects/page')
    await renderRoute(() =>
      Page({ searchParams: Promise.resolve({ archived: '1' }) } as unknown as PageProps<'/projects'>),
    )
    expect(crumbsText()).toEqual([th.nav.projects, th.projects.archivedListTitle])
    expect(within(bar()).queryByRole('button', { name: th.projects.create })).toBeNull()
  })

  it('/clients — ลูกค้า', async () => {
    const { default: Page } = await import('./clients/page')
    await renderRoute(() => Page({ searchParams: Promise.resolve({}) } as unknown as PageProps<'/clients'>))
    expect(within(bar()).getByRole('heading', { level: 1 })).toHaveTextContent(th.clients.listTitle)
    expect(within(bar()).getByRole('button', { name: th.clients.create })).toBeInTheDocument()
  })

  it('/settings/* — ตั้งค่า › the current tab', async () => {
    mocks.pathname = '/settings/holidays'
    const { default: Layout } = await import('./settings/layout')
    await renderRoute(() => Layout({ children: <p>content</p> }))
    expect(crumbsText()).toEqual([th.nav.settings, th.nav.holidays])
    expect(within(bar()).getByRole('heading', { level: 1 })).toHaveTextContent(th.nav.holidays)
    expect(within(bar()).getByRole('link', { name: th.nav.settings })).toHaveAttribute(
      'href',
      '/settings/employees',
    )
  })

  it('not-found screens name themselves in the bar', async () => {
    const { default: NotFound } = await import('./projects/not-found')
    await renderRoute(() => NotFound())
    expect(within(bar()).getByRole('heading', { level: 1 })).toHaveTextContent(th.projects.notFound.title)
    expect(screen.getByRole('link', { name: th.projects.notFound.back })).toHaveAttribute('href', '/projects')
  })
})
