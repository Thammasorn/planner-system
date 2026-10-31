import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { installCmdkShims } from '@/components/palette/jsdom.test.helper'
import { th } from '@/i18n/th'
import type { SidebarResponse } from '@/lib/contracts/sidebar'
import { qk } from '@/lib/query-keys'
import { CommandPalette } from '@/components/palette/CommandPalette'
import { PaletteProvider } from '@/components/palette/PaletteProvider'
import { CurrentUserContext } from '@/hooks/useCurrentUser'
import { renderTasks } from '../tasks/render.test.helper'
import { WORKER } from '../pages/render.test.helper'
import { Sidebar } from './Sidebar'

const nav = vi.hoisted(() => ({ push: vi.fn() }))
vi.mock('next/navigation', () => ({ usePathname: () => '/my', useRouter: () => ({ push: nav.push }) }))
vi.mock('@/server/actions/auth', () => ({ logout: vi.fn() }))
vi.mock('@/server/actions/projects', () => ({ createProject: vi.fn(), updateProject: vi.fn() }))
const pageActions = vi.hoisted(() => ({
  createPage: vi.fn(),
  deletePage: vi.fn(),
  duplicatePage: vi.fn(),
  restorePageBatch: vi.fn(),
  setPageProtected: vi.fn(),
  movePage: vi.fn(),
}))
vi.mock('@/server/actions/pages', () => pageActions)
vi.mock('@/lib/api', () => ({ getJson: vi.fn(() => new Promise(() => {})) }))

const data: SidebarResponse = { projects: [], hasArchived: false, canCreateProject: false, myTaskCount: 2 }

function renderSidebar(collapsed = false, seed = true) {
  renderTasks(<Sidebar collapsed={collapsed} />, {
    seed: (qc) => {
      if (seed) qc.setQueryData(qk.sidebar(), data)
    },
  })
  return screen.getByRole('navigation', { name: th.nav.sidebarLabel })
}

beforeAll(installCmdkShims)

describe('Sidebar M3 nav (X33, M3-D40)', () => {
  it('"งานของฉัน" carries the count as text and "งานของทีม" follows it', () => {
    const nav = renderSidebar()
    const links = within(nav).getAllByRole('link')
    const my = within(nav).getByRole('link', { name: `${th.nav.my} 2` })
    expect(my).toHaveAttribute('href', '/my')
    expect(my).toHaveAttribute('aria-current', 'page')
    const i = links.indexOf(my)
    expect(links[i + 1]).toHaveAttribute('href', '/tasks')
    expect(links[i + 1]).toHaveAccessibleName(th.nav.teamTasks)
    expect(links[i - 1]).toHaveAttribute('href', '/home')
  })

  it('collapsed rail: the count is in the accessible name', () => {
    const nav = renderSidebar(true)
    expect(within(nav).getByRole('link', { name: `${th.nav.my} 2` })).toBeInTheDocument()
  })

  it('no count while loading', () => {
    const nav = renderSidebar(false, false)
    expect(within(nav).getByRole('link', { name: th.nav.my })).toBeInTheDocument()
  })
})

describe('Sidebar M4 (M4-D27, X08, FR-506)', () => {
  const PAGE = '00000000-0000-4000-8000-000000000077'

  function renderM4(collapsed = false) {
    renderTasks(
      <CurrentUserContext value={WORKER}>
        <PaletteProvider>
          <Sidebar collapsed={collapsed} />
          <CommandPalette />
        </PaletteProvider>
      </CurrentUserContext>,
      { seed: (qc) => qc.setQueryData(qk.sidebar(), data) },
    )
    return screen.getByRole('navigation', { name: th.nav.sidebarLabel })
  }

  it('the search button comes first, reads ค้นหา… with the ⌘K hint and opens the palette', async () => {
    const sidebar = renderM4()
    const search = within(sidebar).getByRole('button', { name: th.palette.open })
    expect(search).toHaveTextContent(th.palette.open)
    expect(search).toHaveTextContent(th.palette.shortcut)
    expect(within(sidebar).getAllByRole('button')[0]).toBe(search)
    await userEvent.click(search)
    expect(await screen.findByRole('dialog', { name: th.palette.dialogLabel })).toBeInTheDocument()
  })

  it('the collapsed rail keeps the search button (icon only)', () => {
    const sidebar = renderM4(true)
    const search = within(sidebar).getByRole('button', { name: th.palette.open })
    expect(search).not.toHaveTextContent(th.palette.shortcut)
    expect(within(sidebar).queryByRole('heading', { name: th.sidebar.wikiHeading })).toBeNull()
  })

  it('a worker sees the Wiki ทีม heading after the projects section, and its + creates a wiki page', async () => {
    pageActions.createPage.mockReturnValue(
      Promise.resolve({
        ok: true,
        page: { id: PAGE },
        space: 'WORKSPACE',
        projectId: null,
        href: `/p/${PAGE}`,
      }),
    )
    const sidebar = renderM4()
    const heading = within(sidebar).getByRole('heading', { name: th.sidebar.wikiHeading })
    const projects = within(sidebar).getByTestId('sidebar-projects')
    expect(projects.compareDocumentPosition(heading) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    await userEvent.click(within(sidebar).getByRole('button', { name: th.sidebar.newWikiPage }))
    expect(pageActions.createPage).toHaveBeenCalledWith({
      space: 'WORKSPACE',
      projectId: null,
      parentId: null,
    })
    await waitFor(() => expect(nav.push).toHaveBeenCalledWith(`/p/${PAGE}`))
  })
})
