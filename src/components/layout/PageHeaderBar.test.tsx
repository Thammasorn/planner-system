// PageHeaderBar (FR-1603, AC-1603, M6.1-D19; plan/m06.1 S4.2): the heading crumb is the <h1>, long breadcrumbs collapse
// in the middle into a menu, ☰ appears only inside the shell (CSS hides it from 900 px), slots for the editor portals.
import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { th } from '@/i18n/th'
import { renderWithProviders } from '../../../tests/helpers/render'
import { HeaderActions, useHeaderSlot } from './HeaderActions'
import { collapseCrumbs, PageHeaderBar, type Crumb } from './PageHeaderBar'
import { ShellDrawerContext } from './ShellDrawer'

const crumbs = (n: number): Crumb[] =>
  Array.from({ length: n }, (_, i) => ({ label: `c${i + 1}`, href: `/x/${i + 1}` }))

describe('collapseCrumbs', () => {
  it('keeps up to three crumbs', () => {
    expect(collapseCrumbs(crumbs(3)).hidden).toEqual([])
  })

  it('first · … · last two above three', () => {
    const r = collapseCrumbs(crumbs(5))
    expect(r.shown.map((c) => c.label)).toEqual(['c1', 'c4', 'c5'])
    expect(r.hidden.map((c) => c.label)).toEqual(['c2', 'c3'])
  })
})

describe('PageHeaderBar', () => {
  it('a work screen: the last crumb is the one <h1>; earlier crumbs are links', () => {
    renderWithProviders(
      <PageHeaderBar
        crumbs={[
          { label: th.nav.projects, href: '/projects' },
          { label: 'POS Upgrade', asHeading: true },
        ]}
      />,
    )
    const bar = screen.getByTestId('page-header')
    expect(within(bar).getAllByRole('heading', { level: 1 })).toHaveLength(1)
    expect(within(bar).getByRole('heading', { level: 1 })).toHaveTextContent('POS Upgrade')
    const nav = within(bar).getByRole('navigation', { name: th.layout.breadcrumb })
    expect(within(nav).getByRole('link', { name: th.nav.projects })).toHaveAttribute('href', '/projects')
  })

  it('a document: the last crumb is plain text (aria-current), not a heading', () => {
    renderWithProviders(<PageHeaderBar crumbs={[{ label: 'POS', href: '/p' }, { label: 'Charter' }]} />)
    const bar = screen.getByTestId('page-header')
    expect(within(bar).queryByRole('heading')).toBeNull()
    expect(within(bar).getByText('Charter').closest('[aria-current="page"]')).not.toBeNull()
  })

  it('collapses five crumbs and lists the hidden ones in a menu', async () => {
    renderWithProviders(<PageHeaderBar crumbs={crumbs(5)} />)
    const nav = screen.getByRole('navigation', { name: th.layout.breadcrumb })
    expect(within(nav).queryByText('c2')).toBeNull()
    expect(within(nav).getByText('c1')).toBeInTheDocument()
    expect(within(nav).getByText('c5')).toBeInTheDocument()
    await userEvent.click(within(nav).getByRole('button', { name: th.layout.moreCrumbs }))
    const menu = await screen.findByRole('menu')
    expect(within(menu).getByRole('menuitem', { name: 'c2' })).toHaveAttribute('href', '/x/2')
    expect(within(menu).getByRole('menuitem', { name: 'c3' })).toBeInTheDocument()
  })

  it('☰ only inside the shell; it opens the drawer', async () => {
    const open = vi.fn()
    const { unmount } = renderWithProviders(<PageHeaderBar crumbs={crumbs(1)} />)
    expect(screen.queryByRole('button', { name: th.layout.openMenu })).toBeNull()
    unmount()
    renderWithProviders(
      <ShellDrawerContext.Provider value={{ open }}>
        <PageHeaderBar crumbs={crumbs(1)} />
      </ShellDrawerContext.Provider>,
    )
    await userEvent.click(screen.getByRole('button', { name: th.layout.openMenu }))
    expect(open).toHaveBeenCalledOnce()
  })

  it('HeaderActions portals into the bar; the status slot is exposed for the editor', () => {
    function Probe() {
      return <span data-testid="probe">{useHeaderSlot('status') ? 'slot' : 'none'}</span>
    }
    renderWithProviders(
      <>
        <PageHeaderBar crumbs={crumbs(1)} actions={<button type="button">own</button>} />
        <HeaderActions>
          <button type="button">ported</button>
        </HeaderActions>
        <Probe />
      </>,
    )
    const actions = screen.getByTestId('page-header-actions')
    expect(within(actions).getByRole('button', { name: 'own' })).toBeInTheDocument()
    expect(within(actions).getByRole('button', { name: 'ported' })).toBeInTheDocument()
    expect(screen.getByTestId('probe')).toHaveTextContent('slot')
  })

  it('an unmounted bar releases its slots', () => {
    function Probe() {
      return <span data-testid="probe">{useHeaderSlot('status') ? 'slot' : 'none'}</span>
    }
    const { rerender } = renderWithProviders(
      <>
        <PageHeaderBar crumbs={crumbs(1)} />
        <Probe />
      </>,
    )
    expect(screen.getByTestId('probe')).toHaveTextContent('slot')
    rerender(<Probe />)
    expect(screen.getByTestId('probe')).toHaveTextContent('none')
  })
})
