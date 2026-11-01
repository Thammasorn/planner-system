import { expect, type Locator, type Page, type Response } from '@playwright/test'
import { th } from '../../src/i18n/th'
import { waitForServerAction, waitForServerActionWith } from '../fixtures'
import { EditorPage } from './editor'
import { HeaderBar } from './header'
import { ShellPage } from './shell'
import { exactName } from './text'

export type CertaintyChoice = 'inherit' | 'confirmed' | 'tentative'

/**
 * The light property rows shared by the task panel and the task page (FR-683/684, M6.1-D16; plan/m06.1 S7.1). DOM
 * contract (S3.1): `PropertyList` = `role="group"` named th.taskPage.propertiesLabel; each `PropertyRow` is a
 * `role="group"` labelled by its label (th.taskPage.properties.*). Every write goes through a server action.
 */
export class TaskProps {
  constructor(
    readonly page: Page,
    /** The panel or the task page; the property list is looked up inside it. */
    readonly scope: Locator,
  ) {}

  root(): Locator {
    return this.scope.getByRole('group', { name: th.taskPage.propertiesLabel, exact: true })
  }
  row(label: string): Locator {
    return this.root().getByRole('group', { name: label, exact: true })
  }

  // ── สถานะ ──────────────────────────────────────────────────────────────────────────────────────────────────
  statusChip(status: string): Locator {
    return this.row(th.taskPage.properties.status).getByRole('button', {
      name: th.tasks.status.menuLabel(status),
      exact: true,
    })
  }
  /** Opens the status menu from the chip showing `current`, narrows by `query`, applies with Enter. */
  async setStatus(current: string, query: string): Promise<void> {
    await this.statusChip(current).click()
    const filter = this.page.getByRole('combobox', { name: th.tasks.status.filter, exact: true })
    await expect(filter).toBeFocused()
    await this.page.keyboard.type(query)
    const answered = waitForServerAction(this.page)
    await this.page.keyboard.press('Enter')
    await answered
  }

  // ── เสร็จ ──────────────────────────────────────────────────────────────────────────────────────────────────
  doneCheckbox(): Locator {
    return this.row(th.taskPage.properties.done).getByRole('checkbox', {
      name: th.tasks.panel.completed,
      exact: true,
    })
  }

  // ── วันที่ ─────────────────────────────────────────────────────────────────────────────────────────────────
  /** MUI X accessible field (DD / MM / BBBB): month, year, then day, so the date is valid — and saved — once. */
  async setDate(which: 'start' | 'due', iso: string): Promise<void> {
    const label = which === 'start' ? th.tasks.panel.startDate : th.tasks.panel.dueDate
    const [y, m, d] = iso.split('-') as [string, string, string]
    const sections = this.row(th.taskPage.properties.dates)
      .getByRole('group', { name: label })
      .getByRole('spinbutton')
    await expect(sections).toHaveCount(3)
    await sections.nth(1).click()
    await this.page.keyboard.type(m)
    await sections.nth(2).click()
    await this.page.keyboard.type(String(Number(y) + 543))
    const saved = waitForServerActionWith(this.page, `"${iso}"`)
    await sections.nth(0).click()
    await this.page.keyboard.type(d)
    await saved
  }

  // ── ความแน่นอน (M6.1-D16: a light value opening a menu of three menuitemradio) ─────────────────────────────
  certaintyButton(): Locator {
    return this.row(th.taskPage.properties.certainty).getByRole('button')
  }
  certaintyMenu(): Locator {
    return this.page.getByRole('menu', { name: th.tasks.certainty.menuLabel, exact: true })
  }
  certaintyItem(c: CertaintyChoice): Locator {
    return this.certaintyMenu().getByRole('menuitemradio', { name: th.tasks.certainty[c], exact: true })
  }
  async openCertainty(): Promise<void> {
    await this.certaintyButton().click()
    await expect(this.certaintyMenu()).toBeVisible()
  }
  /** The checked choice of the open menu is `c` (aria-checked, ✓ — not colour only). */
  async expectCertaintyChoice(c: CertaintyChoice): Promise<void> {
    await this.openCertainty()
    await expect(this.certaintyItem(c)).toHaveAttribute('aria-checked', 'true')
    await this.page.keyboard.press('Escape')
    await expect(this.certaintyMenu()).toHaveCount(0)
  }
  async chooseCertainty(c: CertaintyChoice): Promise<void> {
    await this.openCertainty()
    const saved = waitForServerAction(this.page)
    await this.certaintyItem(c).click()
    await saved
  }

  // ── ผู้รับผิดชอบ + วางแผน (FR-605, FR-612) ───────────────────────────────────────────────────────────────────
  addAssigneeButton(): Locator {
    return this.row(th.taskPage.properties.assignees).getByRole('button', {
      name: th.tasks.panel.addAssignee,
      exact: true,
    })
  }
  /** "+ คน" → picks `person` → closes the picker; resolves when the assign action answered. */
  async addAssignee(person: string): Promise<void> {
    await this.addAssigneeButton().click()
    const dialog = this.page.getByRole('dialog', { name: th.tasks.picker.label })
    const input = dialog.getByRole('combobox', { name: exactName(th.tasks.picker.label) })
    await expect(input).toBeFocused()
    await this.page.keyboard.type(person)
    const option = this.page
      .getByRole('listbox')
      .getByRole('option')
      .filter({ has: this.page.getByText(person, { exact: true }) })
    const answered = waitForServerAction(this.page)
    await option.click()
    await answered
    await this.page.keyboard.press('Escape')
    await expect(dialog).toBeHidden()
  }
  planButton(person: string): Locator {
    return this.row(th.taskPage.properties.assignees).getByRole('button', {
      name: th.plan.buttonFor(person),
      exact: true,
    })
  }

  // ── ถูกขวางโดย / กำลังขวาง (FR-640–641) ────────────────────────────────────────────────────────────────────
  async addBlocker(blocker: string): Promise<void> {
    const row = this.row(th.taskPage.properties.blockedBy)
    await row.getByRole('button', { name: th.tasks.blockers.add, exact: true }).click()
    const input = row.getByRole('combobox', { name: exactName(th.tasks.blockers.pickerLabel) })
    await expect(input).toBeFocused()
    await this.page.keyboard.type(blocker)
    const answered = waitForServerAction(this.page)
    await this.page.getByRole('listbox').getByRole('option', { name: blocker, exact: true }).click()
    await answered
  }
  blockedByItem(name: string): Locator {
    return this.row(th.taskPage.properties.blockedBy).getByRole('listitem').filter({ hasText: name })
  }

  // ── งานย่อย (FR-603/610) ───────────────────────────────────────────────────────────────────────────────────
  subtasksRow(): Locator {
    return this.row(th.taskPage.properties.subtasks)
  }
  subtask(name: string): Locator {
    return this.subtasksRow()
      .getByRole('listitem')
      .filter({ has: this.page.getByText(name, { exact: true }) })
  }
  /** "+ เพิ่มงานย่อย" → types one name + Enter → waits for the create, then Esc closes the field. */
  async addSubtask(name: string): Promise<void> {
    await this.subtasksRow().getByRole('button', { name: th.tasks.panel.addSubtask, exact: true }).click()
    const field = this.subtasksRow().getByRole('textbox', { name: th.tasks.panel.addSubtask, exact: true })
    await expect(field).toBeFocused()
    await this.page.keyboard.type(name)
    const created = waitForServerAction(this.page)
    await this.page.keyboard.press('Enter')
    await created
    await expect(this.subtask(name)).toBeVisible()
    await this.page.keyboard.press('Escape')
  }
}

/**
 * The task as a document page `/t/<id>` (FR-683, M6.1-D7; plan/m06.1 S7.1). DOM contract (S3.3): the header bar
 * (HeaderBar) with ← กลับ, crumbs `project › ancestors › current`, the status / lease slots, 🔗 and ⋯
 * (คัดลอกลิงก์ · เปิดใน panel · เต็มความกว้าง `menuitemcheckbox` · ลบงาน); then `data-testid="page-column"` holding the
 * title row (`data-testid="task-title"`: ☐ + `<h1>`), the property list (TaskProps) and the body region
 * (`data-testid="task-body"`, role region th.taskPage.bodyLabel) with the BlockNote editor.
 */
export class TaskPage {
  readonly shell: ShellPage
  readonly header: HeaderBar
  readonly editor: EditorPage
  readonly props: TaskProps

  constructor(readonly page: Page) {
    this.shell = new ShellPage(page)
    this.header = new HeaderBar(page)
    this.editor = new EditorPage(page)
    this.props = new TaskProps(page, page.getByTestId('page-column'))
  }

  /** Navigates to /t/<id>; resolves with the document response. On 2xx waits for hydration and the properties. */
  async goto(taskId: string): Promise<Response | null> {
    const res = await this.page.goto(`/t/${taskId}`)
    if (res && res.ok()) await this.waitReady()
    return res
  }
  async waitReady(): Promise<void> {
    await this.shell.waitForHydration()
    await expect(this.column()).toBeVisible()
    await expect(this.props.root()).toBeVisible() // live properties loaded (skeleton gone)
  }

  column(): Locator {
    return this.page.getByTestId('page-column')
  }
  titleRow(): Locator {
    return this.page.getByTestId('task-title')
  }
  title(): Locator {
    return this.titleRow().getByRole('heading', { level: 1 })
  }
  titleCheckbox(name: string): Locator {
    return this.titleRow().getByRole('checkbox', { name: th.tasks.completeCheckbox(name), exact: true })
  }
  body(): Locator {
    return this.page.getByRole('region', { name: th.taskPage.bodyLabel, exact: true })
  }
  notFound(): Locator {
    return this.page.getByRole('heading', { level: 1, name: th.taskPage.notFound })
  }

  // ── ⋯ menu ────────────────────────────────────────────────────────────────────────────────────────────────
  menu(): Locator {
    return this.page.getByRole('menu')
  }
  async openMenu(): Promise<void> {
    await this.header.moreButton().click()
    await expect(this.menu()).toBeVisible()
  }
  menuItem(label: string): Locator {
    return this.menu().getByRole('menuitem', { name: label, exact: true })
  }
  fullWidthItem(): Locator {
    return this.menu().getByRole('menuitemcheckbox', { name: th.layout.fullWidth, exact: true })
  }
  /** ⋯ › เต็มความกว้าง; resolves when setPageFullWidth answered (optimistic first, M6.1-D15). */
  async toggleFullWidth(): Promise<void> {
    await this.openMenu()
    const saved = waitForServerAction(this.page)
    await this.fullWidthItem().click()
    await saved
  }
  async back(): Promise<void> {
    await this.header.backButton().click()
  }
}
