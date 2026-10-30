import { act, fireEvent, screen, waitForElementToBeRemoved, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactElement } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { PreferencesProvider } from '@/components/providers/PreferencesProvider'
import { th } from '@/i18n/th'
import { DEFAULT_PREFERENCES, type PreferenceInput } from '@/lib/schemas/preferences'
import { renderWithProviders as renderBase } from '../../../tests/helpers/render'
import { AppShell } from './AppShell'

const mocks = vi.hoisted(() => ({ setPreference: vi.fn<(i: PreferenceInput) => Promise<unknown>>() }))
vi.mock('next/navigation', () => ({ usePathname: () => '/home' }))
vi.mock('@/server/actions/preferences', () => ({ setPreference: mocks.setPreference }))
vi.mock('@/server/actions/auth', () => ({ logout: () => Promise.resolve({ ok: true, redirectTo: '/login' }) }))

function renderWithProviders(ui: ReactElement, prefs = DEFAULT_PREFERENCES) {
  return renderBase(
    <PreferencesProvider initial={prefs} enabled>
      {ui}
    </PreferencesProvider>,
  )
}

function sidebar(): HTMLElement {
  return screen.getByTestId('app-sidebar')
}

describe('AppShell', () => {
  it('renders the sidebar navigation and the main landmark', () => {
    renderWithProviders(
      <AppShell>
        <p>content</p>
      </AppShell>,
    )
    const nav = screen.getByRole('navigation', { name: th.nav.sidebarLabel })
    const home = within(nav).getByRole('link', { name: th.nav.home })
    expect(home).toHaveAttribute('href', '/home')
    expect(home).toHaveAttribute('aria-current', 'page')
    const main = screen.getByRole('main')
    expect(main).toHaveAttribute('id', 'main')
    expect(main).toHaveAttribute('tabindex', '-1')
    expect(within(main).getByText('content')).toBeInTheDocument()
    expect(sidebar()).toHaveAttribute('id', 'app-sidebar')
    expect(sidebar()).toHaveAttribute('data-collapsed', 'false')
  })

  it('collapses with the toggle button and keeps accessible names', async () => {
    const user = userEvent.setup()
    renderWithProviders(<AppShell>x</AppShell>)
    const toggle = screen.getByRole('button', { name: th.nav.collapseSidebar })
    expect(toggle).toHaveAttribute('aria-expanded', 'true')
    expect(toggle).toHaveAttribute('aria-controls', 'app-sidebar')

    await user.click(toggle)
    expect(sidebar()).toHaveAttribute('data-collapsed', 'true')
    const expand = screen.getByRole('button', { name: th.nav.expandSidebar })
    expect(expand).toHaveAttribute('aria-expanded', 'false')
    const nav = screen.getByRole('navigation', { name: th.nav.sidebarLabel })
    expect(within(nav).getByRole('link', { name: th.nav.home })).toHaveAttribute('href', '/home')
  })

  it('toggles with Cmd/Ctrl + \\ (e.code, Thai layout)', () => {
    renderWithProviders(<AppShell>x</AppShell>)
    fireEvent.keyDown(document.body, { code: 'Backslash', key: 'ฃ', ctrlKey: true })
    expect(sidebar()).toHaveAttribute('data-collapsed', 'true')
    fireEvent.keyDown(document.body, { code: 'Backslash', key: '\\', metaKey: true })
    expect(sidebar()).toHaveAttribute('data-collapsed', 'false')
  })

  it('starts from the saved sidebar.collapsed preference and saves toggles (X33)', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    mocks.setPreference.mockResolvedValue({ ok: true })
    renderWithProviders(<AppShell>x</AppShell>, { ...DEFAULT_PREFERENCES, 'sidebar.collapsed': true })
    expect(sidebar()).toHaveAttribute('data-collapsed', 'true')
    fireEvent.keyDown(document.body, { code: 'Backslash', key: '\\', ctrlKey: true })
    expect(sidebar()).toHaveAttribute('data-collapsed', 'false')
    await act(async () => {
      vi.advanceTimersByTime(300)
      await Promise.resolve()
    })
    expect(mocks.setPreference).toHaveBeenCalledWith({ key: 'sidebar.collapsed', value: false })
    vi.useRealTimers()
  })

  it('ignores the shortcut while typing', () => {
    renderWithProviders(
      <AppShell>
        <input aria-label="q" />
      </AppShell>,
    )
    const input = screen.getByRole('textbox', { name: 'q' })
    input.focus()
    fireEvent.keyDown(input, { code: 'Backslash', key: '\\', ctrlKey: true })
    expect(sidebar()).toHaveAttribute('data-collapsed', 'false')
  })

  it('opens a named modal drawer with the same navigation and closes it with Escape', async () => {
    const user = userEvent.setup()
    renderWithProviders(<AppShell>x</AppShell>)
    await user.click(screen.getByRole('button', { name: th.nav.openMenu }))
    // WAI-ARIA: every role="dialog" needs an accessible name (PLAN.md §3.9).
    const dialog = await screen.findByRole('dialog', { name: th.nav.sidebarLabel })
    expect(dialog).toHaveAttribute('aria-modal', 'true')
    const drawerNav = within(dialog).getByRole('navigation', { name: th.nav.sidebarLabel })
    expect(within(drawerNav).getByRole('link', { name: th.nav.home })).toHaveAttribute('href', '/home')

    await user.keyboard('{Escape}')
    await waitForElementToBeRemoved(() => screen.queryByRole('dialog', { name: th.nav.sidebarLabel }))
  })

  it('focuses the skip link first', async () => {
    const user = userEvent.setup()
    renderWithProviders(<AppShell>x</AppShell>)
    await user.tab()
    const skip = screen.getByRole('link', { name: th.nav.skipToContent })
    expect(skip).toHaveFocus()
    expect(skip).toHaveAttribute('href', '#main')
  })
})
