import { expect, type Locator, type Page } from '@playwright/test'
import { th } from '../../src/i18n/th'

/**
 * App shell page object (plan/m00-scaffold.md S3.5; DOM contract in §5.S2 "UI contract").
 * Every later spec navigates through it so a shell change is fixed in one place.
 */
export class ShellPage {
  constructor(readonly page: Page) {}

  sidebar(): Locator {
    return this.page.getByTestId('app-sidebar')
  }
  /** The visible primary navigation: the permanent sidebar's on wide screens, the drawer's when it is open. */
  nav(): Locator {
    return this.page.getByRole('navigation', { name: th.nav.sidebarLabel })
  }
  navLink(label: string): Locator {
    return this.nav().getByRole('link', { name: label, exact: true })
  }
  collapseButton(): Locator {
    return this.page.getByRole('button', { name: th.nav.collapseSidebar, exact: true })
  }
  expandButton(): Locator {
    return this.page.getByRole('button', { name: th.nav.expandSidebar, exact: true })
  }
  /** ☰ — since M6.1 it lives in the screen's header bar (below 900 px), not in a separate mobile bar (M6.1-D19). */
  menuButton(): Locator {
    return this.page.getByTestId('page-header').getByRole('button', { name: th.layout.openMenu, exact: true })
  }
  skipLink(): Locator {
    return this.page.getByRole('link', { name: th.nav.skipToContent, exact: true })
  }
  main(): Locator {
    return this.page.locator('main#main')
  }

  /** Navigates and waits until the shell is hydrated, so clicks and shortcuts reach React handlers. */
  async goto(path = '/home'): Promise<void> {
    await this.page.goto(path)
    await this.waitForHydration()
  }

  /**
   * Waits on state, not time: (1) React has hydrated the sidebar (it attaches its `__reactFiber$…` key to host
   * nodes), then (2) one MessageChannel round-trip, which runs after the scheduler task React posted to flush
   * passive effects — the effect that registers the global `Cmd/Ctrl+\` listener (useHotkeys).
   */
  async waitForHydration(): Promise<void> {
    await this.page.waitForFunction(() => {
      const el = document.getElementById('app-sidebar')
      return el !== null && Object.keys(el).some((k) => k.startsWith('__reactFiber$'))
    })
    await this.page.evaluate(
      () =>
        new Promise<void>((resolve) => {
          const channel = new MessageChannel()
          channel.port1.onmessage = () => resolve()
          channel.port2.postMessage(null)
        }),
    )
  }

  async pressToggleShortcut(): Promise<void> {
    await this.page.keyboard.press('ControlOrMeta+Backslash')
  }

  async expectCollapsed(collapsed: boolean): Promise<void> {
    await expect(this.sidebar()).toHaveAttribute('data-collapsed', String(collapsed))
  }

  // M1 (plan/m01-auth-employees.md S3.4): user menu at the sidebar bottom.
  userMenuButton(): Locator {
    return this.page.getByRole('button', { name: th.nav.userMenu })
  }

  async openUserMenu(): Promise<void> {
    await this.userMenuButton().click()
    await expect(this.page.getByRole('menu')).toBeVisible()
  }

  /** Opens the user menu and picks a theme (label from th.prefs.themes); items are `menuitemradio` (UserMenu.tsx). */
  async chooseTheme(label: string): Promise<void> {
    await this.openUserMenu()
    await this.page.getByRole('menu').getByRole('menuitemradio', { name: label, exact: true }).click()
    await expect(this.page.getByRole('menu')).toBeHidden()
  }

  /** User menu → ออกจากระบบ; resolves once the browser is on /login. */
  async logout(): Promise<void> {
    await this.openUserMenu()
    await this.page.getByRole('menuitem', { name: th.nav.logout, exact: true }).click()
    await this.page.waitForURL((u) => u.pathname === '/login')
  }

  async toggleSidebar(): Promise<void> {
    await this.pressToggleShortcut()
  }
}
