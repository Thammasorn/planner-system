import { expect, type Locator, type Page } from '@playwright/test'
import { th } from '../../src/i18n/th'
import { waitForServerAction } from '../fixtures'
import { ShellPage } from './shell'
import { exactName } from './text'

/** `/clients` and `/clients/[id]` (FR-301..FR-303 part; plan/m02-clients-projects-authz.md S2.6 / S3.5). */
export class ClientsPage {
  readonly shell: ShellPage

  constructor(readonly page: Page) {
    this.shell = new ShellPage(page)
  }

  async goto(): Promise<void> {
    await this.shell.goto('/clients')
    await expect(this.page.getByRole('heading', { level: 1 })).toHaveText(th.clients.listTitle)
  }

  table(): Locator {
    return this.shell.main().getByRole('table')
  }
  /** Data rows of the clients table (header row excluded). */
  rows(): Locator {
    return this.table().getByRole('row').filter({ has: this.page.getByRole('link') })
  }
  row(name: string): Locator {
    return this.table()
      .getByRole('row')
      .filter({ has: this.page.getByRole('link', { name, exact: true }) })
  }
  /** Client names in table order. */
  nameLinks(): Locator {
    return this.rows().getByRole('link')
  }
  archivedChip(name: string): Locator {
    return this.row(name).getByText(th.clients.archivedChip, { exact: true })
  }

  addButton(): Locator {
    return this.shell.main().getByRole('button', { name: th.clients.create, exact: true })
  }
  dialog(): Locator {
    return this.page.getByRole('dialog')
  }
  nameField(): Locator {
    return this.dialog().getByLabel(exactName(th.clients.fields.name))
  }
  codeField(): Locator {
    return this.dialog().getByLabel(exactName(th.clients.fields.code))
  }
  saveButton(): Locator {
    return this.dialog().getByRole('button', { name: th.common.save, exact: true })
  }

  async create(name: string, code?: string): Promise<void> {
    await this.addButton().click()
    await expect(this.dialog()).toBeVisible()
    await this.nameField().fill(name)
    if (code !== undefined) await this.codeField().fill(code)
    const answered = waitForServerAction(this.page)
    await this.saveButton().click()
    await answered
  }

  archiveButton(name: string): Locator {
    return this.row(name).getByRole('button', { name: th.clients.archive, exact: true })
  }
  async archive(name: string): Promise<void> {
    const answered = waitForServerAction(this.page)
    await this.archiveButton(name).click()
    await answered
  }
}
