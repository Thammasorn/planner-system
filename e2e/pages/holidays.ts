import { expect, type Locator, type Page } from '@playwright/test'
import { th } from '../../src/i18n/th'
import { waitForServerAction } from '../fixtures'
import { escapeRegExp } from './text'

const T = th.holidays
const I = th.holidays.import

/**
 * `/settings/holidays` (plan/m05 S3.6, FR-901, M5-D11). DOM contract (S3): the year's holidays in a table named
 * th.holidays.title (date · name · edit/delete icon buttons); "นำเข้าจาก CSV" opens a dialog named
 * th.holidays.import.title with a file input labelled `chooseFile`, the line errors in `data-testid="import-errors"`,
 * a preview table (one row per CSV row: date · name (+ "เดิม: …") · status text ใหม่ / อัปเดตชื่อ / ไม่เปลี่ยน) and the
 * confirm button th.holidays.import.confirm(n), enabled only with zero errors.
 */
export class HolidaysPage {
  constructor(readonly page: Page) {}

  async goto(): Promise<void> {
    await this.page.goto('/settings/holidays')
    await expect(this.importButton()).toBeEnabled()
  }

  main(): Locator {
    return this.page.locator('main#main')
  }
  table(): Locator {
    return this.main().getByRole('table', { name: T.title, exact: true })
  }
  /** Data row of the holiday named exactly `name`. */
  row(name: string): Locator {
    return this.table()
      .locator('tbody')
      .getByRole('row')
      .filter({ has: this.page.getByRole('cell', { name, exact: true }) })
  }

  importButton(): Locator {
    return this.main().getByRole('button', { name: I.button, exact: true })
  }
  dialog(): Locator {
    return this.page.getByRole('dialog', { name: I.title, exact: true })
  }

  /** Opens the import dialog (if closed) and chooses a file; the browser parses it into the preview. */
  async importFile(file: { name: string; buffer: Buffer }): Promise<void> {
    if (!(await this.dialog().isVisible())) {
      await this.importButton().click()
      await expect(this.dialog()).toBeVisible()
    }
    await this.dialog()
      .getByLabel(I.chooseFile, { exact: true })
      .setInputFiles({ name: file.name, mimeType: 'text/csv', buffer: file.buffer })
    await expect(this.dialog().getByTestId('import-file-name')).toHaveText(file.name)
  }

  previewRows(): Locator {
    return this.dialog().getByRole('table').locator('tbody').getByRole('row')
  }
  /** Preview row whose name cell starts with `name` (the cell may also hold "เดิม: …"). */
  previewRow(name: string): Locator {
    return this.previewRows().filter({ hasText: name })
  }
  errors(): Locator {
    return this.dialog().getByTestId('import-errors')
  }
  confirmButton(n: number): Locator {
    return this.dialog().getByRole('button', { name: I.confirm(n), exact: true })
  }

  /** The confirm button whatever its count (th.holidays.import.confirm(n) for any n). */
  anyConfirmButton(): Locator {
    const [before, after] = I.confirm(7).split('7') as [string, string]
    return this.dialog().getByRole('button', {
      name: new RegExp(`^${escapeRegExp(before)}\\d+${escapeRegExp(after)}$`),
    })
  }

  /** นำเข้า n รายการ → the action answered and the dialog closed. */
  async confirm(n: number): Promise<void> {
    const answered = waitForServerAction(this.page)
    await this.confirmButton(n).click()
    await answered
    await expect(this.dialog()).toBeHidden()
  }

  async cancel(): Promise<void> {
    await this.dialog().getByRole('button', { name: T.cancel, exact: true }).click()
    await expect(this.dialog()).toBeHidden()
  }
}
