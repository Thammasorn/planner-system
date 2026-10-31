import { expect, type Locator, type Page } from '@playwright/test'
import type { TaskStatusCategory } from '../../src/domain/types'
import { th } from '../../src/i18n/th'
import { waitForServerAction } from '../fixtures'
import { escapeRegExp, exactName } from './text'

/** One MessageChannel round-trip: runs after the scheduler task React posted for passive effects (cf. ShellPage). */
async function flushEffects(page: Page): Promise<void> {
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        const channel = new MessageChannel()
        channel.port1.onmessage = () => resolve()
        channel.port2.postMessage(null)
      }),
  )
}

/**
 * ภาพรวม › "สถานะงาน" (FR-622–624, PERM-23; plan/m03-tasks.md S3.18 / S5.1). DOM contract from S3: a section named
 * th.tasks.status.settings.title holding one list item per status in position order. LEAD/Manager rows have an
 * inline name (role="button", click to rename), a category select, a colour button, a drag handle and a delete
 * button; other viewers see a status chip + category caption and the read-only note.
 */
export class StatusSettingsPage {
  constructor(readonly page: Page) {}

  region(): Locator {
    return this.page.getByRole('region', { name: th.tasks.status.settings.title })
  }
  rows(): Locator {
    return this.region().getByRole('listitem')
  }
  /** Manage mode: the row whose inline name is `name`. */
  row(name: string): Locator {
    return this.rows().filter({ has: this.page.getByRole('button', { name, exact: true }) })
  }
  /** Read-only mode: the row whose chip shows `name`. */
  readOnlyRow(name: string): Locator {
    return this.rows().filter({ has: this.page.locator('[data-status-id]').filter({ hasText: name }) })
  }
  /** Manage mode: status names in order. */
  inlineNames(): Locator {
    return this.region().locator('[data-inline-edit]')
  }
  /** Manage mode: the category select of every row, in order (their text is the category caption). */
  categorySelects(): Locator {
    return this.region().getByRole('combobox', { name: th.tasks.status.settings.category })
  }
  /** Read-only mode: status chips in order. */
  chips(): Locator {
    return this.region().locator('[data-status-id]')
  }

  addButton(): Locator {
    return this.region().getByRole('button', { name: th.tasks.status.settings.add, exact: true })
  }
  dragHandles(): Locator {
    return this.region().getByRole('button', { name: th.tasks.status.settings.dragHandle, exact: true })
  }
  /** Every row's delete button (each names its status: th.tasks.status.settings.delete(name)). */
  deleteButtons(): Locator {
    const prefix = th.tasks.status.settings.delete('').replace(/''$/, '')
    return this.region().getByRole('button', { name: new RegExp(`^${escapeRegExp(prefix)}`) })
  }
  readOnlyNote(): Locator {
    return this.region().getByText(th.tasks.status.settings.readOnly, { exact: true })
  }
  nameInput(): Locator {
    return this.region().getByRole('textbox', { name: exactName(th.tasks.status.settings.name) })
  }

  async expectNames(names: readonly string[]): Promise<void> {
    await expect(this.inlineNames()).toHaveText([...names])
  }

  /**
   * "+ เพิ่มสถานะ" (M3-D30: inserted before the first DONE status as WAITING), then rename it to `name` and set the
   * category. The new status opens in rename mode; if not, its name is clicked.
   */
  async add(name: string, category: TaskStatusCategory = 'WAITING'): Promise<void> {
    const created = waitForServerAction(this.page)
    await this.addButton().click()
    await created
    const fresh = this.region().getByRole('button', { name: th.tasks.status.settings.newName, exact: true })
    await expect(this.nameInput().or(fresh)).toBeVisible()
    await flushEffects(this.page) // the list's effect opens the new name for renaming right after it renders
    if (!(await this.nameInput().isVisible())) await fresh.click()
    await expect(this.nameInput()).toBeFocused()
    await this.nameInput().fill(name)
    const renamed = waitForServerAction(this.page)
    await this.nameInput().press('Enter')
    await renamed
    await expect(this.row(name)).toBeVisible()
    if (category !== 'WAITING') await this.setCategory(name, category)
  }

  async setCategory(name: string, category: TaskStatusCategory): Promise<void> {
    await this.row(name).getByRole('combobox', { name: th.tasks.status.settings.category }).click()
    const saved = waitForServerAction(this.page)
    await this.page
      .getByRole('listbox')
      .getByRole('option', { name: th.tasks.status.categories[category], exact: true })
      .click()
    await saved
  }

  /**
   * Drags `name` so that it ends right before `beforeName` (dnd-kit sortable: dropping over an item takes that
   * item's index, so moving down targets the item just above `beforeName`).
   */
  async dragBefore(name: string, beforeName: string): Promise<void> {
    const names = await this.inlineNames().allTextContents()
    const from = names.indexOf(name)
    const before = names.indexOf(beforeName)
    if (from < 0 || before < 0)
      throw new Error(`dragBefore: ${name} / ${beforeName} not in ${names.join(', ')}`)
    const overName = from > before ? beforeName : names[before - 1]
    if (overName === undefined || overName === name)
      throw new Error(`dragBefore: ${name} is already before ${beforeName}`)
    const handle = this.row(name).getByRole('button', {
      name: th.tasks.status.settings.dragHandle,
      exact: true,
    })
    const over = this.row(overName).getByRole('button', {
      name: th.tasks.status.settings.dragHandle,
      exact: true,
    })
    // centred, so the pointer stays out of dnd-kit's auto-scroll zones (outer 20 % of the viewport)
    await this.region().evaluate((el) => el.scrollIntoView({ block: 'center' }))
    // after a previous drop the moved row is still sliding into place (sortable transition); a trial hover waits
    // until both handles have the same box on consecutive animation frames, so the boxes below are final
    await handle.hover({ trial: true })
    await over.hover({ trial: true })
    const a = await handle.boundingBox()
    const b = await over.boundingBox()
    if (!a || !b) throw new Error('dragBefore: no boxes')
    const start = { x: a.x + a.width / 2, y: a.y + a.height / 2 }
    const end = { x: start.x, y: b.y + b.height / 2 }
    const answered = waitForServerAction(this.page)
    await this.page.mouse.move(start.x, start.y)
    await this.page.mouse.down()
    await this.page.mouse.move(start.x, start.y + (end.y > start.y ? 6 : -6), { steps: 5 })
    await this.page.mouse.move(end.x, end.y, { steps: 8 })
    await this.page.mouse.move(end.x, end.y, { steps: 2 })
    await this.page.mouse.up()
    await answered
  }

  /** Delete: an unused status goes at once; a used one opens the destination popover (M3-D30, not a dialog). */
  async remove(name: string, opts: { moveTo?: string } = {}): Promise<void> {
    if (opts.moveTo === undefined) {
      const answered = waitForServerAction(this.page)
      await this.row(name).getByRole('button', { name: th.tasks.status.settings.delete(name), exact: true }).click()
      await answered
      return
    }
    await this.row(name).getByRole('button', { name: th.tasks.status.settings.delete(name), exact: true }).click()
    await expect(this.moveAndDeleteButton()).toBeVisible()
    await expect(this.page.getByRole('dialog')).toHaveCount(0) // a popover, never a confirm dialog
    await this.page.getByRole('combobox', { name: th.tasks.status.settings.moveTo }).click()
    await this.page.getByRole('listbox').getByRole('option', { name: opts.moveTo, exact: true }).click()
    const answered = waitForServerAction(this.page)
    await this.moveAndDeleteButton().click()
    await answered
  }

  moveAndDeleteButton(): Locator {
    return this.page.getByRole('button', { name: th.tasks.status.settings.moveAndDelete, exact: true })
  }
}
