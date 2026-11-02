import { expect, type Locator, type Page } from '@playwright/test'
import { th } from '../../src/i18n/th'
import type { MyBucketKey } from '../../src/lib/contracts/tasks'
import { waitForServerAction } from '../fixtures'
import { ShellPage } from './shell'
import { TaskListPage } from './tasks'

export type MyView = 'weeks' | 'list' | 'board'

/**
 * `/my` งานของฉัน (FR-1009 basic, M6.1-D25; plan/m06.1 S7.1). DOM contract (S3.5): one `section` per project (named by
 * the project) with a list of items — ☐ (th.tasks.completeCheckbox), the name link (→ project tasks + panel), 📄,
 * ↗ (th.tasks.openAsPage → /t/<id>) and the status chip (menu since M6.1).
 * M9 (FR-1009, M9-D15/D17; plan/m09 S6.1): the sections are the buckets `section[data-my-bucket=<key>]` (heading
 * th.my.buckets[key] + th.my.countLabel(n)) in the order สัปดาห์นี้ / สัปดาห์หน้า / หลังจากนั้น / ยังไม่วางแผน (the last
 * hidden when empty); items carry `data-testid="my-planned"` (th.my.planned) and th.my.fromWeek for later buckets.
 * The view switch ตามสัปดาห์ · ลิสต์ · บอร์ด (group th.my.view.label, `?view=`) renders M3's TeamTasks for ลิสต์/บอร์ด.
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

  // ── M9 buckets + views (plan/m09 S6.1) ────────────────────────────────────────────────────────────────────
  bucket(key: MyBucketKey): Locator {
    return this.shell.main().locator(`section[data-my-bucket="${key}"]`)
  }
  /** Task-name links of a bucket in display order (the ↗ page links excluded). */
  bucketTaskLinks(key: MyBucketKey): Locator {
    return this.bucket(key).getByRole('listitem').locator('a[href]:not([data-open-page])')
  }
  planned(name: string): Locator {
    return this.item(name).getByTestId('my-planned')
  }
  /** ☐ → the task leaves its bucket at once; resolves once completeTask answered. */
  async tick(name: string): Promise<void> {
    const answered = waitForServerAction(this.page)
    await this.checkbox(name).click()
    await answered
  }
  viewButton(v: MyView): Locator {
    return this.page
      .getByRole('group', { name: th.my.view.label })
      .getByRole('button', { name: th.my.view[v], exact: true })
  }
  /** Switches the /my view (URL `?view=`, no server action) and waits for its content. */
  async setView(v: MyView): Promise<void> {
    await this.viewButton(v).click()
    await expect(this.viewButton(v)).toHaveAttribute('aria-pressed', 'true')
    if (v === 'board') await expect(new TaskListPage(this.page).board()).toBeVisible()
    else if (v === 'weeks') await expect(this.bucket('THIS_WEEK')).toBeVisible()
    else await expect(this.shell.main().getByRole('listitem').first()).toBeVisible()
  }
}
