import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CurrentUserProvider } from '@/components/providers/CurrentUserProvider'
import { PreferencesContext, type PreferencesApi } from '@/hooks/usePreferences'
import { th } from '@/i18n/th'
import type { CurrentUserDTO } from '@/lib/contracts/users'
import { DEFAULT_PREFERENCES } from '@/lib/schemas/preferences'
import { renderWithProviders } from '../../../tests/helpers/render'
import { Sidebar } from './Sidebar'
import { UserMenu } from './UserMenu'

const mocks = vi.hoisted(() => ({ logout: vi.fn<() => Promise<unknown>>(), navigate: vi.fn<(url: string) => void>() }))
vi.mock('@/server/actions/auth', () => ({ logout: mocks.logout }))
vi.mock('@/components/account/hard-navigate', () => ({ hardNavigate: mocks.navigate }))
vi.mock('@/server/actions/preferences', () => ({ setPreference: () => Promise.resolve({ ok: true }) }))
vi.mock('next/navigation', () => ({ usePathname: () => '/home' }))

const manager: CurrentUserDTO = {
  id: '6f1c2c38-5a8e-4a6c-9a0e-1b2c3d4e5f60',
  email: 'manager@example.com',
  name: 'Demo Manager',
  nickname: 'Manager',
  displayName: 'Manager',
  role: 'manager',
  color: '#2F5597',
}
const worker: CurrentUserDTO = { ...manager, id: '7f1c2c38-5a8e-4a6c-9a0e-1b2c3d4e5f61', role: 'worker', nickname: 'Mint', displayName: 'Mint' }

function wrap(user: CurrentUserDTO, children: ReactNode, setPreference: PreferencesApi['setPreference'] = vi.fn()) {
  return renderWithProviders(
    <PreferencesContext value={{ prefs: DEFAULT_PREFERENCES, setPreference }}>
      <CurrentUserProvider user={user}>{children}</CurrentUserProvider>
    </PreferencesContext>,
  )
}

beforeEach(() => {
  mocks.logout.mockReset()
  mocks.navigate.mockReset()
  mocks.logout.mockResolvedValue({ ok: true, redirectTo: '/login' })
})

describe('UserMenu', () => {
  it('U-MENU-01 lists account, theme and logout; choosing dark saves the theme preference', async () => {
    const user = userEvent.setup()
    const setPreference = vi.fn()
    wrap(manager, <UserMenu collapsed={false} />, setPreference)
    const button = screen.getByRole('button', { name: th.nav.userMenu })
    expect(button).toHaveTextContent('Manager')
    await user.click(button)
    const menu = await screen.findByRole('menu')
    expect(within(menu).getByRole('menuitem', { name: th.nav.account })).toHaveAttribute('href', '/account/password')
    expect(within(menu).getByRole('menuitem', { name: th.nav.logout })).toBeInTheDocument()
    for (const t of ['light', 'dark', 'system'] as const) {
      expect(within(menu).getByRole('menuitemradio', { name: th.prefs.themes[t] })).toBeInTheDocument()
    }
    expect(within(menu).getByRole('menuitemradio', { name: th.prefs.themes.system })).toHaveAttribute(
      'aria-checked',
      'true',
    )
    await user.click(within(menu).getByRole('menuitemradio', { name: th.prefs.themes.dark }))
    expect(setPreference).toHaveBeenCalledWith('theme', 'dark')
  })

  it('U-MENU-01b logout calls the action', async () => {
    const user = userEvent.setup()
    wrap(manager, <UserMenu collapsed={false} />)
    await user.click(screen.getByRole('button', { name: th.nav.userMenu }))
    await user.click(await screen.findByRole('menuitem', { name: th.nav.logout }))
    expect(mocks.logout).toHaveBeenCalledWith({})
    await vi.waitFor(() => expect(mocks.navigate).toHaveBeenCalledWith('/login'))
  })

  it('U-MENU-02 the settings nav item renders for a manager and not for a worker', () => {
    const { unmount } = wrap(manager, <Sidebar collapsed={false} />)
    const nav = screen.getByRole('navigation', { name: th.nav.sidebarLabel })
    expect(within(nav).getByRole('link', { name: th.nav.settings })).toHaveAttribute('href', '/settings/employees')
    unmount()
    wrap(worker, <Sidebar collapsed={false} />)
    const nav2 = screen.getByRole('navigation', { name: th.nav.sidebarLabel })
    expect(within(nav2).queryByRole('link', { name: th.nav.settings })).not.toBeInTheDocument()
  })
})
