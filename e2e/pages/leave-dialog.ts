import { expect, type Locator, type Page } from '@playwright/test'
import { th } from '../../src/i18n/th'
import { waitForServerAction } from '../fixtures'
import { escapeRegExp, exactName } from './text'

const D = th.timeOff.dialog
type Duration = 'full' | 'am' | 'pm'
type DateLabel = typeof D.startDate | typeof D.endDate

/** ISO → what the Buddhist-era date field shows, e.g. '2026-10-05' → "05/10/2569" (AdapterDayjsBuddhist, X50). */
export function pickerText(iso: string): string {
  const [y, m, d] = iso.split('-') as [string, string, string]
  return `${d}/${m}/${Number(y) + 543}`
}

/** MUI X may wrap section text in bidi isolation marks; compare the plain digits. */
const stripBidi = (s: string): string => s.replace(/[‎‏⁦-⁩]/g, '')

/**
 * The one leave dialog (plan/m05 S3.4, M5-D14; opened from /calendar or the user menu). DOM contract (S3): MUI Dialog
 * named by its title (th.timeOff.dialog.titleCreate / titleEdit); manager-only "พนักงาน" combobox (PersonPicker);
 * two MUI X date fields (sections DD / MM / BBBB, value mirrored in the field's hidden input under
 * `.MuiPickersTextField-root`); duration toggle buttons (aria-pressed); type select (combobox → listbox); note textbox;
 * errors as an `Alert role="alert"`; after a save the body becomes the saved alert + `data-testid="impact-panel"`.
 */
export class LeaveDialog {
  constructor(readonly page: Page) {}

  root(): Locator {
    return this.page.getByRole('dialog', {
      name: new RegExp(`^(${escapeRegExp(D.titleCreate)}|${escapeRegExp(D.titleEdit)})$`),
    })
  }
  /** The dialog in a given mode (its accessible name is the title). */
  inMode(mode: 'create' | 'edit'): Locator {
    return this.page.getByRole('dialog', {
      name: mode === 'create' ? D.titleCreate : D.titleEdit,
      exact: true,
    })
  }
  async expectOpen(mode: 'create' | 'edit'): Promise<void> {
    await expect(this.inMode(mode)).toBeVisible()
  }
  async expectClosed(): Promise<void> {
    await expect(this.root()).toBeHidden()
  }

  // ── employee (managers only) ────────────────────────────────────────────────────────────────────────────────
  employeeInput(): Locator {
    return this.root().getByRole('combobox', { name: exactName(D.employee) })
  }
  async setEmployee(name: string): Promise<void> {
    await this.employeeInput().click()
    await this.employeeInput().fill(name)
    await this.page.getByRole('listbox').getByRole('option').filter({ hasText: name }).first().click()
    await expect(this.employeeInput()).toHaveValue(name)
  }

  // ── dates ──────────────────────────────────────────────────────────────────────────────────────────────────
  private dateRoot(label: DateLabel): Locator {
    return this.root()
      .locator('.MuiPickersTextField-root')
      .filter({ has: this.page.getByText(label, { exact: true }) })
  }
  /** Retrying assertion: the field labelled `label` shows `iso` (as DD/MM/BBBB). */
  async expectDate(label: DateLabel, iso: string): Promise<void> {
    const input = this.dateRoot(label).locator('input')
    await expect.poll(async () => stripBidi(await input.inputValue())).toBe(pickerText(iso))
  }
  /**
   * Types a date into the field labelled `label`: day, month, then the Buddhist-era year, one section at a time
   * (R11). Changing the start past the end moves the end along, so set the start before the end.
   */
  async setDate(label: DateLabel, iso: string): Promise<void> {
    const [y, m, d] = iso.split('-') as [string, string, string]
    const sections = this.root().getByRole('group', { name: label }).getByRole('spinbutton')
    await expect(sections).toHaveCount(3)
    await sections.nth(0).click()
    await this.page.keyboard.type(d)
    await sections.nth(1).click()
    await this.page.keyboard.type(m)
    await sections.nth(2).click()
    await this.page.keyboard.type(String(Number(y) + 543))
    await this.expectDate(label, iso)
  }

  // ── duration, type, note ───────────────────────────────────────────────────────────────────────────────────
  durationButton(kind: Duration): Locator {
    return this.root().getByRole('button', { name: D[kind], exact: true })
  }
  async duration(kind: Duration): Promise<void> {
    await this.durationButton(kind).click()
    await expect(this.durationButton(kind)).toHaveAttribute('aria-pressed', 'true')
  }
  /** MUI select → `combobox`; matched by prefix in case the name also carries the shown value. */
  typeSelect(): Locator {
    return this.root().getByRole('combobox', { name: new RegExp(`^${escapeRegExp(D.type)}`) })
  }
  /** Opens the type select; its options are then `typeOptions()`. Close it again with Escape. */
  async openTypes(): Promise<void> {
    await this.typeSelect().click()
    await expect(this.page.getByRole('listbox')).toBeVisible()
  }
  typeOptions(): Locator {
    return this.page.getByRole('listbox').getByRole('option')
  }
  async type(name: string): Promise<void> {
    await this.openTypes()
    await this.page.getByRole('listbox').getByRole('option', { name, exact: true }).click()
    await expect(this.typeSelect()).toHaveText(name)
  }
  async note(text: string): Promise<void> {
    await this.root()
      .getByRole('textbox', { name: exactName(D.note) })
      .fill(text)
  }

  // ── actions ────────────────────────────────────────────────────────────────────────────────────────────────
  /** บันทึก; resolves once the server action answered (success → impact, OVERLAP → `error()`). */
  async save(): Promise<void> {
    const answered = waitForServerAction(this.page)
    await this.root().getByRole('button', { name: D.save, exact: true }).click()
    await answered
  }
  /** The form error (OVERLAP and other failures); the success alert is excluded. */
  error(): Locator {
    return this.root().getByRole('alert').filter({ hasNotText: D.saved })
  }
  saved(): Locator {
    return this.root().getByText(D.saved, { exact: true })
  }
  impact(): Locator {
    return this.root().getByTestId('impact-panel')
  }
  impactLines(): Locator {
    return this.impact().getByRole('listitem')
  }
  /** ปิด on the success body. */
  async close(): Promise<void> {
    await this.root().getByRole('button', { name: D.close, exact: true }).click()
    await this.expectClosed()
  }
  /** ยกเลิก on the form. */
  async cancel(): Promise<void> {
    await this.root().getByRole('button', { name: D.cancel, exact: true }).click()
    await this.expectClosed()
  }
  /** ลบวันลา (edit mode, no confirm — FR-909): the dialog closes and the undo toast appears. */
  async delete(): Promise<void> {
    const answered = waitForServerAction(this.page)
    await this.root().getByRole('button', { name: D.delete, exact: true }).click()
    await answered
    await this.expectClosed()
  }
}
