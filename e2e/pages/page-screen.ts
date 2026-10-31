import { expect, type Locator, type Page, type Response } from '@playwright/test'
import { th } from '../../src/i18n/th'
import { waitForServerAction } from '../fixtures'
import { EditorPage } from './editor'
import { ShellPage } from './shell'

/**
 * The page shell `/p/<id>` (plan/m04 S4.8, FR-504/505/507/510): header (title, icon, cover), breadcrumb, page menu,
 * template chooser, protected banner, 404 state; `editor` is the BlockNote page object.
 */
export class PageScreen {
  readonly shell: ShellPage
  readonly editor: EditorPage

  constructor(readonly page: Page) {
    this.shell = new ShellPage(page)
    this.editor = new EditorPage(page)
  }

  /** Navigates to /p/<id>; resolves with the document response (404 checks). Hydration is awaited on 2xx only. */
  async goto(id: string): Promise<Response | null> {
    const res = await this.page.goto(`/p/${id}`)
    if (res && res.ok()) await this.shell.waitForHydration()
    return res
  }

  titleInput(): Locator {
    return this.page.getByRole('textbox', { name: th.pages.titleLabel, exact: true })
  }
  /** Types a new title and commits it with Enter (renamePage action). */
  async rename(text: string): Promise<void> {
    await this.titleInput().fill(text)
    const saved = waitForServerAction(this.page)
    await this.titleInput().press('Enter')
    await saved
    await expect(this.titleInput()).toHaveValue(text)
  }
  breadcrumb(): Locator {
    return this.page.getByRole('navigation', { name: th.pages.breadcrumbLabel, exact: true })
  }
  iconButton(): Locator {
    return this.page.getByRole('button', { name: th.pages.icon.button, exact: true })
  }
  async pickIcon(emoji: string): Promise<void> {
    await this.iconButton().click()
    const saved = waitForServerAction(this.page)
    await this.page.getByRole('button', { name: emoji, exact: true }).click()
    await saved
  }
  coverAddButton(): Locator {
    return this.page.getByRole('button', { name: th.pages.cover.add, exact: true })
  }
  /** Sets the hidden file input next to "เพิ่มรูปปก" (upload → setPageCover). */
  async addCover(b64Png: string): Promise<void> {
    const chooser = this.page.waitForEvent('filechooser')
    await this.coverAddButton().click()
    const saved = waitForServerAction(this.page)
    await (
      await chooser
    ).setFiles({ name: 'cover.png', mimeType: 'image/png', buffer: Buffer.from(b64Png, 'base64') })
    await saved
  }
  cover(): Locator {
    return this.page.getByRole('img', { name: th.pages.cover.alt, exact: true })
  }
  coverRemoveButton(): Locator {
    return this.page.getByRole('button', { name: th.pages.cover.remove, exact: true })
  }
  menuButton(title: string): Locator {
    return this.shell.main().getByRole('button', { name: th.pages.menu(title), exact: true })
  }
  async openMenu(title: string): Promise<void> {
    await this.menuButton(title).click()
    await expect(this.page.getByRole('menu')).toBeVisible()
  }
  menuItem(label: string): Locator {
    return this.page.getByRole('menu').getByRole('menuitem', { name: label, exact: true })
  }
  templateRegion(): Locator {
    return this.page.getByRole('region', { name: th.pages.templates.heading, exact: true })
  }
  templateButtons(): Locator {
    return this.templateRegion().getByRole('button')
  }
  templateButton(label: string): Locator {
    return this.templateRegion().getByRole('button', { name: label, exact: true })
  }
  protectedBanner(): Locator {
    return this.page.getByText(th.pages.protectedBanner, { exact: true })
  }
  notFound(): Locator {
    return this.page.getByText(th.pages.notFound.title, { exact: true })
  }
}
