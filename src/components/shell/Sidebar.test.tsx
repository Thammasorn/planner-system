import { screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { th } from '@/i18n/th'
import type { SidebarResponse } from '@/lib/contracts/sidebar'
import { qk } from '@/lib/query-keys'
import { renderTasks } from '../tasks/render.test.helper'
import { Sidebar } from './Sidebar'

vi.mock('next/navigation', () => ({ usePathname: () => '/my', useRouter: () => ({ push: vi.fn() }) }))
vi.mock('@/server/actions/auth', () => ({ logout: vi.fn() }))
vi.mock('@/server/actions/projects', () => ({ createProject: vi.fn(), updateProject: vi.fn() }))
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
