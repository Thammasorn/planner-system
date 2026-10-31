import { useMemo, useState, type ReactNode } from 'react'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ThemeProvider } from '@mui/material/styles'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { describe, expect, it, vi } from 'vitest'
import { PreferencesContext, type PreferencesApi } from '@/hooks/usePreferences'
import { th } from '@/i18n/th'
import type { SidebarResponse } from '@/lib/contracts/sidebar'
import { qk } from '@/lib/query-keys'
import { DEFAULT_PREFERENCES, type Preferences } from '@/lib/schemas/preferences'
import { theme } from '@/lib/theme/theme'
import { SidebarProjects } from './SidebarProjects'

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn() }) }))
vi.mock('@/server/actions/projects', () => ({ createProject: vi.fn(), updateProject: vi.fn() }))
const api = vi.hoisted(() => ({ getJson: vi.fn(() => new Promise<never>(() => {})) })) // data comes from the cache
vi.mock('@/lib/api', () => ({ getJson: api.getJson }))

const STORE = '11111111-1111-4111-8111-111111111111'
const DW = '22222222-2222-4222-8222-222222222222'

const response = (over: Partial<SidebarResponse> = {}): SidebarResponse => ({
  projects: [
    { id: STORE, name: 'Store Analytics Dashboard', color: '#B45309', certainty: 'TENTATIVE' },
    { id: DW, name: 'Data Warehouse', color: '#0F766E', certainty: 'CONFIRMED' },
  ],
  hasArchived: true,
  canCreateProject: false,
  ...over,
})

function PrefsHarness({
  initial,
  spy,
  children,
}: {
  initial: Preferences
  spy: PreferencesApi['setPreference']
  children: ReactNode
}) {
  const [prefs, setPrefs] = useState(initial)
  const api = useMemo<PreferencesApi>(
    () => ({
      prefs,
      setPreference: (key, value) => {
        spy(key, value)
        setPrefs((p) => ({ ...p, [key]: value }))
      },
    }),
    [prefs, spy],
  )
  return <PreferencesContext value={api}>{children}</PreferencesContext>
}

function renderSidebar(
  data: SidebarResponse | undefined,
  opts: { prefs?: Preferences; pathname?: string; collapsed?: boolean } = {},
) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } })
  if (data) qc.setQueryData(qk.sidebar(), data)
  const spy = vi.fn()
  const utils = render(
    <QueryClientProvider client={qc}>
      <ThemeProvider theme={theme} storageManager={null}>
        <PrefsHarness initial={opts.prefs ?? DEFAULT_PREFERENCES} spy={spy}>
          <SidebarProjects
            collapsed={opts.collapsed ?? false}
            pathname={opts.pathname ?? '/home'}
            onNavigate={undefined}
          />
        </PrefsHarness>
      </ThemeProvider>
    </QueryClientProvider>,
  )
  return { ...utils, setPreference: spy, qc }
}

const projectList = () => screen.getByRole('list', { name: th.sidebar.projectsHeading })

describe('SidebarProjects', () => {
  it('lists visible projects sorted (compareThai) with ◐ only on TENTATIVE, and the archived link', () => {
    renderSidebar(response())
    const links = within(projectList()).getAllByRole('link')
    expect(links.map((l) => l.textContent)).toEqual(['Data Warehouse', 'Store Analytics Dashboard'])
    expect(links[0]).toHaveAttribute('href', `/projects/${DW}/overview`)
    const imgs = screen.getAllByRole('img', { name: th.projects.certainty.TENTATIVE })
    expect(imgs).toHaveLength(1)
    expect(within(screen.getByTestId(`sidebar-project-${STORE}`)).getByRole('img')).toHaveTextContent('◐')
    expect(screen.getByRole('link', { name: th.sidebar.archivedLink })).toHaveAttribute(
      'href',
      '/projects?archived=1',
    )
    expect(screen.queryByRole('button', { name: th.sidebar.newProject })).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: th.nav.projects })).toHaveAttribute('href', '/projects')
  })

  it('shows the + button only when the viewer can create projects', () => {
    renderSidebar(response({ canCreateProject: true }))
    expect(screen.getByRole('button', { name: th.sidebar.newProject })).toBeInTheDocument()
  })

  it('expanding saves sidebar.expanded and reveals the ภาพรวม sub-link', async () => {
    const user = userEvent.setup()
    const { setPreference } = renderSidebar(response())
    const toggle = screen.getByRole('button', { name: th.sidebar.expand('Data Warehouse') })
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByRole('link', { name: th.projects.tabs.overview })).not.toBeInTheDocument()
    await user.click(toggle)
    expect(setPreference).toHaveBeenCalledWith('sidebar.expanded', [`project:${DW}`])
    expect(screen.getByRole('link', { name: th.projects.tabs.overview })).toHaveAttribute(
      'href',
      `/projects/${DW}/overview`,
    )
    const collapse = screen.getByRole('button', { name: th.sidebar.collapse('Data Warehouse') })
    expect(collapse).toHaveAttribute('aria-expanded', 'true')
    await user.click(collapse)
    expect(setPreference).toHaveBeenLastCalledWith('sidebar.expanded', [])
  })

  it('starts expanded from the preference and prunes keys of projects no longer listed', async () => {
    const user = userEvent.setup()
    const gone = 'project:33333333-3333-4333-8333-333333333333'
    const { setPreference } = renderSidebar(response(), {
      prefs: { ...DEFAULT_PREFERENCES, 'sidebar.expanded': [`project:${STORE}`, gone, 'page:x'] },
    })
    expect(screen.getByRole('link', { name: th.projects.tabs.overview })).toHaveAttribute(
      'href',
      `/projects/${STORE}/overview`,
    )
    await user.click(screen.getByRole('button', { name: th.sidebar.expand('Data Warehouse') }))
    expect(setPreference).toHaveBeenCalledWith('sidebar.expanded', [
      `project:${STORE}`,
      'page:x',
      `project:${DW}`,
    ])
  })

  it('marks the current project link with aria-current', () => {
    renderSidebar(response(), { pathname: `/projects/${STORE}/overview` })
    expect(screen.getByRole('link', { name: 'Store Analytics Dashboard' })).toHaveAttribute(
      'aria-current',
      'page',
    )
    expect(screen.getByRole('link', { name: 'Data Warehouse' })).not.toHaveAttribute('aria-current')
    expect(screen.getByRole('link', { name: th.nav.projects })).not.toHaveAttribute('aria-current')
  })

  it('empty list and no archived link', () => {
    renderSidebar(response({ projects: [], hasArchived: false }))
    expect(screen.getByText(th.sidebar.noProjects)).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: th.sidebar.archivedLink })).not.toBeInTheDocument()
  })

  it('shows skeleton rows while loading', () => {
    renderSidebar(undefined)
    expect(projectList()).toHaveAttribute('aria-busy', 'true')
    expect(screen.getByText(th.common.loading)).toBeInTheDocument()
  })

  it('the collapsed rail shows only the projects header icon link', () => {
    renderSidebar(response({ canCreateProject: true }), { collapsed: true })
    expect(screen.getByRole('link', { name: th.nav.projects })).toHaveAttribute('href', '/projects')
    expect(screen.queryByRole('list', { name: th.sidebar.projectsHeading })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: th.sidebar.newProject })).not.toBeInTheDocument()
  })
})

describe('SidebarProjects — load error', () => {
  it('shows the error with a retry button', async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    api.getJson.mockRejectedValue(new Error('x'))
    render(
      <QueryClientProvider client={qc}>
        <ThemeProvider theme={theme} storageManager={null}>
          <SidebarProjects collapsed={false} pathname="/home" onNavigate={undefined} />
        </ThemeProvider>
      </QueryClientProvider>,
    )
    expect(await screen.findByText(th.sidebar.loadError)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: th.sidebar.retry })).toBeInTheDocument()
  })
})
