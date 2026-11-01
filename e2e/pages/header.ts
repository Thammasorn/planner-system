import { expect, type Locator, type Page } from '@playwright/test'
import { th } from '../../src/i18n/th'

/**
 * The 48 px header bar of every signed-in screen (FR-1603, M6.1-D19; plan/m06.1 S7.1). DOM contract (S4.2):
 * `data-testid="page-header"`; ☰ (th.layout.openMenu, below 900 px), ← (th.layout.back), the breadcrumb
 * `nav[aria-label=th.layout.breadcrumb]` (current crumb `aria-current="page"`; a work screen's last crumb is the <h1>),
 * then `data-testid="page-header-actions"` holding the save-status slot (`page-status-slot`), the lease slot and the
 * screen's actions (🔗 th.layout.copyLink, ⋯ th.layout.more).
 */
export class HeaderBar {
  constructor(readonly page: Page) {}

  bar(): Locator {
    return this.page.getByTestId('page-header')
  }
  crumbs(): Locator {
    return this.bar().getByRole('navigation', { name: th.layout.breadcrumb, exact: true })
  }
  /** The visible crumbs' texts in order (the "…" collapse button counts as one item). */
  async crumbTexts(): Promise<string[]> {
    return this.crumbs()
      .locator('li')
      .evaluateAll((lis) =>
        lis.map((li) => {
          const clone = li.cloneNode(true) as HTMLElement
          clone.querySelectorAll('[aria-hidden]').forEach((n) => n.remove()) // the › separator
          return (clone.textContent ?? '').trim()
        }),
      )
  }
  crumbLink(label: string): Locator {
    return this.crumbs().getByRole('link', { name: label, exact: true })
  }
  current(): Locator {
    return this.crumbs().locator('[aria-current="page"]')
  }
  /** The bar's <h1> (work screens only — documents keep the big title in the column). */
  h1(): Locator {
    return this.bar().getByRole('heading', { level: 1 })
  }
  actions(): Locator {
    return this.bar().getByTestId('page-header-actions')
  }
  statusSlot(): Locator {
    return this.bar().getByTestId('page-status-slot')
  }
  /** ☰ (opens the shell drawer below 900 px). */
  menuButton(): Locator {
    return this.bar().getByRole('button', { name: th.layout.openMenu, exact: true })
  }
  backButton(): Locator {
    return this.bar().getByRole('button', { name: th.layout.back, exact: true })
  }
  copyLinkButton(): Locator {
    return this.bar().getByRole('button', { name: th.layout.copyLink, exact: true })
  }
  /** ⋯ of documents (`/t`); `/p` uses th.pages.menu(title) (PageScreen.menuButton). */
  moreButton(): Locator {
    return this.bar().getByRole('button', { name: th.layout.more, exact: true })
  }
  /**
   * Phones (FR-1603, FR-1606): the first row of the bar is 48 px even when the actions wrap below it, so ☰ and the
   * screen's name are vertically centred 24 px below the bar's top on every screen.
   */
  async expectFirstRow48(where: string): Promise<void> {
    const bar = await this.bar().boundingBox()
    const menu = await this.menuButton().boundingBox()
    const crumbs = await this.crumbs().boundingBox()
    if (!bar || !menu || !crumbs) throw new Error(`${where}: header parts have no box`)
    const mid = (b: { y: number; height: number }) => b.y + b.height / 2 - bar.y
    expect(Math.abs(mid(menu) - 24), `${where}: ☰ centre ${mid(menu)}`).toBeLessThanOrEqual(1)
    expect(Math.abs(mid(crumbs) - 24), `${where}: name row centre ${mid(crumbs)}`).toBeLessThanOrEqual(1)
    expect(bar.height, `${where}: bar height ${bar.height}`).toBeGreaterThanOrEqual(47)
  }
  async expectHeight48(): Promise<void> {
    await expect(this.bar()).toBeVisible()
    const box = await this.bar().boundingBox()
    if (!box) throw new Error('page header has no box')
    expect(Math.abs(box.height - 48), `header height ${box.height}`).toBeLessThanOrEqual(1)
  }
}
