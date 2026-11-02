import { expect, type Locator, type Page } from '@playwright/test'
import type { ISODate } from '../../src/domain/types'
import { th } from '../../src/i18n/th'
import { waitForServerAction } from '../fixtures'
import { fillDate } from './date-field'
import { escapeRegExp } from './text'

/**
 * ภาพรวม › "Milestones" section (plan/m08 S4.2 / S6.1, FR-409/702/703/708, M8-D17). DOM contract (S4): a `<section>`
 * (role=region named th.milestones.heading, test id project-milestones) with the add button th.milestones.overview.add,
 * the read-only note th.milestones.overview.readOnly for members, and a list named th.milestones.overview.listLabel
 * whose listitems hold the name (test id milestone-name, struck through when DONE), the date, the status chip
 * (`data-status`), the progress text, the late badge (`data-late`) and — for M/L — the checkbox
 * th.milestones.overview.completeToggle(name) and the buttons edit(name) / remove(name). Adding and editing use the
 * shared MilestoneForm (form named th.milestones.form.createTitle). Order: open by date, then DONE by date.
 */
export class MilestonesSection {
  constructor(readonly page: Page) {}

  root(): Locator {
    return this.page.getByRole('region', { name: th.milestones.heading, exact: true })
  }
  list(): Locator {
    return this.root().getByRole('list', { name: th.milestones.overview.listLabel, exact: true })
  }
  /** The listitem of milestone `name`. */
  row(name: string): Locator {
    return this.list()
      .getByRole('listitem')
      .filter({ has: this.page.getByTestId('milestone-name').filter({ hasText: new RegExp(`^${escapeRegExp(name)}$`) }) })
  }
  nameOf(name: string): Locator {
    return this.row(name).getByTestId('milestone-name')
  }
  /** Milestone names in display order. */
  async names(): Promise<string[]> {
    return this.list().getByTestId('milestone-name').allTextContents()
  }
  async expectNames(names: readonly string[]): Promise<void> {
    await expect.poll(() => this.names()).toEqual([...names])
  }
  addButton(): Locator {
    return this.root().getByRole('button', { name: th.milestones.overview.add, exact: true })
  }
  readOnlyNote(): Locator {
    return this.root().getByText(th.milestones.overview.readOnly, { exact: true })
  }
  form(): Locator {
    return this.root().getByRole('form', { name: th.milestones.form.createTitle })
  }
  completeCheckbox(name: string): Locator {
    return this.row(name).getByRole('checkbox', { name: th.milestones.overview.completeToggle(name), exact: true })
  }
  editButton(name: string): Locator {
    return this.row(name).getByRole('button', { name: th.milestones.overview.edit(name), exact: true })
  }
  removeButton(name: string): Locator {
    return this.row(name).getByRole('button', { name: th.milestones.overview.remove(name), exact: true })
  }
  /** The struck-through state of the name (DONE rows, M8-D17). */
  async isStruck(name: string): Promise<boolean> {
    return this.nameOf(name).evaluate((el) => getComputedStyle(el).textDecorationLine.includes('line-through'))
  }

  private async fillForm(o: { name?: string; date?: ISODate }, submitLabel: string): Promise<void> {
    const form = this.form()
    await expect(form).toBeVisible()
    if (o.name !== undefined) await form.getByRole('textbox', { name: th.milestones.fields.name }).fill(o.name)
    if (o.date !== undefined) await fillDate(form, th.milestones.fields.date, o.date)
    const saved = waitForServerAction(this.page)
    await form.getByRole('button', { name: submitLabel, exact: true }).click()
    await saved
    await expect(form).toHaveCount(0)
  }
  /** "+ เพิ่ม milestone" → name + date → สร้าง; waits for the action and the new row. */
  async add(name: string, date: ISODate): Promise<void> {
    await this.addButton().click()
    await this.fillForm({ name, date }, th.milestones.form.create)
    await expect(this.row(name)).toBeVisible()
  }
  /** ✎ → inline form → บันทึก; waits for the action. */
  async edit(name: string, patch: { name?: string; date?: ISODate }): Promise<void> {
    await this.editButton(name).click()
    await this.fillForm(patch, th.milestones.form.save)
    await expect(this.row(patch.name ?? name)).toBeVisible()
  }
  /** Ticks (or unticks) the row's checkbox; waits for the action. */
  async complete(name: string): Promise<void> {
    const saved = waitForServerAction(this.page)
    await this.completeCheckbox(name).click()
    await saved
  }
  /** 🗑 (no confirm dialog, FR-708) → waits for the delete action. */
  async remove(name: string): Promise<void> {
    const deleted = waitForServerAction(this.page)
    await this.removeButton(name).click()
    await deleted
  }
}
