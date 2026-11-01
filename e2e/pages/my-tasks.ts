import { expect, type Locator, type Page } from '@playwright/test'
import { th } from '../../src/i18n/th'
import { waitForServerAction } from '../fixtures'
import { ShellPage } from './shell'

/**
 * `/my` งานของฉัน (FR-1009 basic, M6.1-D25; plan/m06.1 S7.1). DOM contract (S3.5): one `section` per project (named by
 * the project) with a list of items — ☐ (th.tasks.completeCheckbox), the name link (→ project tasks + panel), 📄,
 * ↗ (th.tasks.openAsPage → /t/<id>) and the status chip (menu since M6.1).
 */
export class MyTasksPage {
  readonly shell: ShellPage

  constructor(readonly page: Page) {
    this.shell = new ShellPage(page)
  }

  async goto(): Promise<void> {
    await this.shell.goto('/my')
    await expect(this.page.getByRole('heading', { level: 1, name: th.my.title })).toBeVisible()
    await expect(
      this.shell.main().getByRole('listitem').first().or(this.shell.main().getByText(th.my.empty)),
    ).toBeVisible()
  }
  item(name: string): Locator {
    return this.shell
      .main()
      .getByRole('listitem')
      .filter({ has: this.page.getByRole('link', { name, exact: true }) })
  }
  checkbox(name: string): Locator {
    return this.item(name).getByRole('checkbox', { name: th.tasks.completeCheckbox(name), exact: true })
  }
  openAsPageLink(name: string): Locator {
    return this.item(name).getByRole('link', { name: th.tasks.openAsPage, exact: true })
  }
  hasBodyMarker(name: string): Locator {
    return this.item(name).getByRole('img', { name: th.tasks.hasBody, exact: true })
  }
  statusChip(name: string, status: string): Locator {
    return this.item(name).getByRole('button', { name: th.tasks.status.menuLabel(status), exact: true })
  }
  /** The open StatusMenu's option `status` (picked by click/tap); resolves when the action answered. */
  async pickStatusOption(status: string, how: 'click' | 'tap' = 'click'): Promise<void> {
    // the option's name also carries the category caption: match the status line itself
    const option = this.page
      .getByRole('listbox', { name: th.tasks.status.label, exact: true })
      .getByRole('option')
      .filter({ has: this.page.getByText(status, { exact: true }) })
      .first()
    const answered = waitForServerAction(this.page)
    if (how === 'tap') await option.tap()
    else await option.click()
    await answered
  }
}
