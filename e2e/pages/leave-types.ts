import { expect, type Locator, type Page } from '@playwright/test'
import { th } from '../../src/i18n/th'
import { waitForServerAction } from '../fixtures'
import { exactName } from './text'

const T = th.leaveTypes

/**
 * `/settings/leave-types` (plan/m05 S3.7, FR-902, M5-D10). DOM contract (S3): a list named th.leaveTypes.title; each
 * row (`data-leave-type-id`) holds a colour button, the name as a button (click → inline rename), the chips
 * "ซ่อนแล้ว" (archived) and "ใช้อยู่ n รายการ", เลื่อนขึ้น / เลื่อนลง, ซ่อน / เลิกซ่อน and ลบ. The add form is a
 * `form` named th.leaveTypes.add (name field + colour swatches + เพิ่มประเภท).
 */
export class LeaveTypesPage {
  constructor(readonly page: Page) {}

  async goto(): Promise<void> {
    await this.page.goto('/settings/leave-types')
    await expect(this.addButton()).toBeEnabled()
  }

  main(): Locator {
    return this.page.locator('main#main')
  }
  list(): Locator {
    return this.main().getByRole('list', { name: T.title, exact: true })
  }
  rows(): Locator {
    return this.list().locator('[data-leave-type-id]')
  }
  /** The row whose name button reads exactly `name`. */
  row(name: string): Locator {
    return this.rows().filter({ has: this.page.getByRole('button', { name, exact: true }) })
  }
  /** Retrying assertion: the list shows exactly these names, in this order. */
  async expectOrder(names: readonly string[]): Promise<void> {
    await expect(this.rows()).toHaveCount(names.length)
    for (const [i, name] of names.entries())
      await expect(this.rows().nth(i).getByRole('button', { name, exact: true })).toBeVisible()
  }
  archivedChip(name: string): Locator {
    return this.row(name).getByText(T.archivedChip, { exact: true })
  }

  private form(): Locator {
    return this.main().getByRole('form', { name: T.add, exact: true })
  }
  addButton(): Locator {
    return this.form().getByRole('button', { name: T.add, exact: true })
  }

  async add(name: string): Promise<void> {
    await this.form()
      .getByRole('textbox', { name: exactName(T.name) })
      .fill(name)
    const answered = waitForServerAction(this.page)
    await this.addButton().click()
    await answered
    await expect(this.row(name)).toBeVisible()
  }

  async moveUp(name: string): Promise<void> {
    const answered = waitForServerAction(this.page)
    await this.row(name).getByRole('button', { name: th.common.moveUp, exact: true }).click()
    await answered
  }

  /** ลบ: deletes an unused type, or archives one in use (toast archivedInstead) — no confirm either way. */
  async delete(name: string): Promise<void> {
    const answered = waitForServerAction(this.page)
    await this.row(name).getByRole('button', { name: T.delete, exact: true }).click()
    await answered
  }
}
