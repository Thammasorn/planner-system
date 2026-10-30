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
  menuButton(): Locator {
    return this.page.getByRole('button', { name: th.nav.openMenu, exact: true })
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
}
