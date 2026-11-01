import { expect, type Locator, type Page } from '@playwright/test'
import { th } from '../../src/i18n/th'
import { waitForServerAction } from '../fixtures'
import { ShellPage } from './shell'
import { TaskProps } from './task-page'
import { SidebarPage } from './sidebar'
import { escapeRegExp, exactName } from './text'
import { toastWith } from './toast'

export type TaskView = 'list' | 'board'
type Modifier = 'ControlOrMeta' | 'Shift'

/** A server-side task id (v4 UUID). Optimistic rows carry `tmp_…` ids until the create has answered (R9). */
const SERVER_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

/** th.tasks.board.column(name, n) for any n (columns are named "<status> (<n> งาน)"). */
function columnLabelPattern(name: string): RegExp {
  const sample = th.tasks.board.column('\u0000', 7)
  const [before, rest] = sample.split('\u0000') as [string, string]
  const [mid, after] = rest.split('7') as [string, string]
  return new RegExp(
    `^${escapeRegExp(before)}${escapeRegExp(name)}${escapeRegExp(mid)}\\d+${escapeRegExp(after)}$`,
  )
}

/** The status name inside a column's accessible name (inverse of th.tasks.board.column). */
function columnNameOf(label: string): string {
  const sample = th.tasks.board.column('\u0000', 7)
  const [before, rest] = sample.split('\u0000') as [string, string]
  const [mid, after] = rest.split('7') as [string, string]
  const m = new RegExp(`^${escapeRegExp(before)}(.+)${escapeRegExp(mid)}\\d+${escapeRegExp(after)}$`).exec(
    label,
  )
  return m?.[1] ?? label
}

/** Pointer drag with intermediate moves (dnd-kit PointerSensor, 4 px activation distance — R15). */
async function dragFromTo(page: Page, from: Locator, to: { x: number; y: number }): Promise<void> {
  await from.hover({ trial: true }) // waits until the handle stops moving (a previous drop may still be animating)
  const box = await from.boundingBox()
  if (!box) throw new Error('drag source has no box')
  const start = { x: box.x + box.width / 2, y: box.y + box.height / 2 }
  await page.mouse.move(start.x, start.y)
  await page.mouse.down()
  await page.mouse.move(start.x + 2, start.y + 6, { steps: 5 }) // past the activation distance
  await page.mouse.move(to.x, to.y, { steps: 5 })
  await page.mouse.move(to.x, to.y, { steps: 2 }) // one more event so dnd-kit recomputes `over`
  await page.mouse.up()
}

async function centerOf(l: Locator): Promise<{ x: number; y: number }> {
  await l.hover({ trial: true }) // stable box (no sortable transition in flight)
  const box = await l.boundingBox()
  if (!box) throw new Error('drop target has no box')
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 }
}

/**
 * Project งาน tab (plan/m03-tasks.md S5.1): the treegrid outliner (M3-D22), quick add, task panel, bulk bar and the
 * board view. DOM contract from S3: rows are `role="row"` named by the task with `aria-level`/`aria-selected`,
 * `data-task-id` and `data-completed`; board cards are `role="article"` named by the task inside `role="group"`
 * columns; the panel is `<aside aria-label={th.tasks.panel.label}>`.
 */
export class TaskListPage {
  readonly shell: ShellPage
  readonly sidebar: SidebarPage

  constructor(readonly page: Page) {
    this.shell = new ShellPage(page)
    this.sidebar = new SidebarPage(page)
  }

  // ── navigation ────────────────────────────────────────────────────────────────────────────────────────────
  async goto(projectId: string, search = ''): Promise<void> {
    await this.shell.goto(`/projects/${projectId}/tasks${search}`)
    await this.waitReady()
  }

  /** Sidebar → project (ภาพรวม) → tab งาน, as a user would (E1). */
  async gotoProject(name: string): Promise<void> {
    await this.sidebar.projectLink(name).click()
    await this.page.waitForURL(/\/projects\/[0-9a-f-]{36}\/overview$/)
    await this.openTab()
  }

  /** Clicks the project tab งาน and waits for the list or the board. */
  async openTab(): Promise<void> {
    await this.page
      .getByRole('tablist', { name: th.projects.tabsLabel })
      .getByRole('tab', { name: th.projects.tabs.tasks, exact: true })
      .click()
    await this.page.waitForURL(/\/projects\/[0-9a-f-]{36}\/tasks(\?|$)/)
    await this.waitReady()
  }

  /** The list or the board has rendered and its effects (N, Esc hotkeys) are registered. */
  async waitReady(): Promise<void> {
    // attached, not visible: a project without tasks renders an empty (zero-height) treegrid + the empty state
    await expect(this.list().or(this.board())).toBeAttached()
    await this.shell.waitForHydration()
  }

  async reload(): Promise<void> {
    await this.page.reload()
    await this.waitReady()
  }

  projectId(): string {
    const m = /\/projects\/([0-9a-f-]{36})\//.exec(new URL(this.page.url()).pathname)
    if (!m?.[1]) throw new Error(`not on a project page: ${this.page.url()}`)
    return m[1]
  }

  // ── list ──────────────────────────────────────────────────────────────────────────────────────────────────
  list(): Locator {
    return this.page.getByRole('treegrid', { name: th.tasks.listLabel })
  }
  /** Task rows only (group headers have no aria-level). */
  taskRows(): Locator {
    return this.list().locator('[role="row"][aria-level]')
  }
  row(name: string): Locator {
    return this.list().getByRole('row', { name, exact: true })
  }
  /** Visible task names in display order. */
  async rowNames(): Promise<string[]> {
    return this.taskRows().evaluateAll((rows) => rows.map((r) => r.getAttribute('aria-label') ?? ''))
  }
  async expectRowNames(names: readonly string[]): Promise<void> {
    await expect.poll(() => this.rowNames()).toEqual([...names])
  }
  async expectLevel(name: string, level: number): Promise<void> {
    await expect(this.row(name)).toHaveAttribute('aria-level', String(level))
  }
  /** The row's id once the create has answered (no temp id any more). */
  async settledId(name: string): Promise<string> {
    await expect(this.row(name)).toHaveAttribute('data-task-id', SERVER_ID)
    return (await this.row(name).getAttribute('data-task-id')) as string
  }
  async expectCompleted(name: string, completed: boolean): Promise<void> {
    const row = this.row(name)
    if (completed) await expect(row).toHaveAttribute('data-completed', 'true')
    else await expect(row).not.toHaveAttribute('data-completed', 'true')
    await expect(this.checkbox(name)).toBeChecked({ checked: completed })
  }
  checkbox(name: string): Locator {
    return this.row(name).getByRole('checkbox', { name: th.tasks.completeCheckbox(name), exact: true })
  }
  /** The inline name (role="button"); a click on an unselected row selects it (M3-D18). */
  nameButton(name: string): Locator {
    return this.row(name).getByRole('button', { name, exact: true })
  }
  dragHandles(): Locator {
    return this.list().getByRole('button', { name: th.tasks.dragHandle, exact: true })
  }
  groupHeaders(): Locator {
    return this.list().getByRole('columnheader')
  }
  /** The rowgroup whose header reads `title` (grouped views). */
  group(title: string): Locator {
    return this.list()
      .getByRole('rowgroup')
      .filter({ has: this.page.getByRole('columnheader', { name: title, exact: true }) })
  }

  // ── keyboard + selection ──────────────────────────────────────────────────────────────────────────────────
  async focus(name: string): Promise<void> {
    await this.row(name).focus()
    await expect(this.row(name)).toBeFocused()
  }
  async press(name: string, key: string): Promise<void> {
    await this.focus(name)
    await this.page.keyboard.press(key)
  }
  /** Presses a key on a row and waits for the one server action it triggers. */
  async pressAndWait(name: string, key: string): Promise<void> {
    await this.focus(name)
    const answered = waitForServerAction(this.page)
    await this.page.keyboard.press(key)
    await answered
  }
  /**
   * Click (optionally Shift / Cmd-Ctrl) on the row's name: selection, never rename, for an unselected row. Since M6.1
   * (M6.1-D17, FR-685) a plain click also opens the panel; Cmd/Ctrl/Shift+click only selects (FR-614).
   */
  async select(name: string, modifiers: Modifier[] = []): Promise<void> {
    await this.nameButton(name).click({ modifiers })
  }
  /** M6.1 (FR-685): a plain click on an unselected row → select it + open its panel; waits for the panel. */
  async clickRow(name: string): Promise<void> {
    await this.nameButton(name).click()
    await expect(this.panelTitle(name)).toBeVisible()
  }

  // ── ↗ เปิดเป็นหน้า + 📄 (M6.1: FR-685, FR-691) ───────────────────────────────────────────────────────────────
  /** The row's ↗ — a real `<a href="/t/<id>">` (opacity 0 until hover/focus; always on touch). */
  openAsPageLink(name: string): Locator {
    return this.row(name).getByRole('link', { name: th.tasks.openAsPage, exact: true })
  }
  /** Clicks ↗ and waits for `/t/<id>` (client navigation; the list remembers its scroll). */
  async openAsPage(name: string): Promise<void> {
    await this.row(name).hover()
    await this.openAsPageLink(name).click()
    await this.page.waitForURL(/\/t\/[0-9a-f-]{36}$/)
  }
  /** 📄 beside the name: `role="img"` named th.tasks.hasBody (text, not colour only). */
  hasBodyMarker(name: string): Locator {
    return this.row(name).getByRole('img', { name: th.tasks.hasBody, exact: true })
  }
  cardOpenAsPageLink(name: string): Locator {
    return this.card(name).getByRole('link', { name: th.tasks.openAsPage, exact: true })
  }
  cardHasBodyMarker(name: string): Locator {
    return this.card(name).getByRole('img', { name: th.tasks.hasBody, exact: true })
  }
  /** Row ⋯ (th.tasks.rowMenu.label) → `item`. */
  async rowMenu(name: string, item: string): Promise<void> {
    await this.row(name).getByRole('button', { name: th.tasks.rowMenu.label, exact: true }).click()
    await this.page.getByRole('menu').getByRole('menuitem', { name: item, exact: true }).click()
  }

  // ── quick add (FR-602) ────────────────────────────────────────────────────────────────────────────────────
  quickAdd(): Locator {
    return this.page.getByRole('textbox', { name: th.tasks.quickAdd.label, exact: true })
  }
  /** Keyboard only: types each name + Enter into the focused quick add (AC-601); waits for the server ids. */
  async typeTasks(names: readonly string[]): Promise<void> {
    for (const name of names) {
      await this.page.keyboard.type(name)
      await this.page.keyboard.press('Enter')
      await expect(this.row(name)).toBeVisible()
    }
    for (const name of names) await this.settledId(name)
  }
  /** Root-level quick add at the end of the list. */
  async addTasks(names: readonly string[]): Promise<void> {
    await this.quickAdd().click()
    await this.typeTasks(names)
    await this.page.keyboard.press('Escape')
  }
  /** Adds `children` at the root, then indents each one once under `parent` (AC-602 keyboard path). */
  async addTree(parent: string, children: readonly string[]): Promise<void> {
    await this.addTasks([parent, ...children])
    for (const c of children) {
      await this.pressAndWait(c, 'Tab')
      await this.expectLevel(c, 2)
    }
  }

  // ── assignees (FR-605/606) ────────────────────────────────────────────────────────────────────────────────
  unassignedLabel(name: string): Locator {
    return this.row(name).getByText(th.tasks.unassigned, { exact: true })
  }
  /** A chip (leaf: removable; parent: read-only union) showing `person` (display name, with the suffix if any). */
  assignee(name: string, person: string): Locator {
    return this.row(name).getByText(person, { exact: true })
  }
  unionAssignees(name: string): Locator {
    return this.row(name).getByTestId('union-assignees')
  }
  removeChipButton(name: string, person: string): Locator {
    return this.row(name).getByRole('button', { name: th.tasks.picker.removeChip(person), exact: true })
  }
  addAssigneeButton(name: string): Locator {
    return this.row(name).getByRole('button', { name: th.tasks.panel.addAssignee, exact: true })
  }
  pickerDialog(): Locator {
    return this.page.getByRole('dialog', { name: th.tasks.picker.label })
  }
  pickerInput(): Locator {
    return this.pickerDialog().getByRole('combobox', { name: exactName(th.tasks.picker.label) })
  }
  pickerOptions(): Locator {
    return this.page.getByRole('listbox').getByRole('option')
  }
  /** The open picker's option for `person` (matched on the display-name line). */
  pickerOption(person: string): Locator {
    return this.pickerOptions().filter({ has: this.page.getByText(person, { exact: true }) })
  }
  async openAssigneePicker(name: string): Promise<void> {
    await this.addAssigneeButton(name).click()
    await expect(this.pickerInput()).toBeFocused()
    await expect(
      this.pickerOptions().first().or(this.page.getByText(th.tasks.picker.noOptions)),
    ).toBeVisible()
  }
  /** Picks `person` in the open picker and waits for the assign action (the picker stays open, FR-605). */
  async pickAssignee(person: string): Promise<void> {
    const answered = waitForServerAction(this.page)
    await this.pickerOption(person).click()
    await answered
  }
  async closePicker(): Promise<void> {
    await this.page.keyboard.press('Escape')
    await expect(this.pickerDialog()).toBeHidden()
  }

  // ── status (FR-626) ───────────────────────────────────────────────────────────────────────────────────────
  /** The clickable status chip of a row showing `status`. */
  statusChip(name: string, status: string): Locator {
    return this.row(name).getByRole('button', { name: th.tasks.status.menuLabel(status), exact: true })
  }
  statusFilter(): Locator {
    return this.page.getByRole('combobox', { name: th.tasks.status.filter, exact: true })
  }
  /** In an open StatusMenu: narrow by `query` and apply the first match with Enter (waits for the action). */
  async pickStatus(query: string): Promise<void> {
    await expect(this.statusFilter()).toBeFocused()
    await this.page.keyboard.type(query)
    const answered = waitForServerAction(this.page)
    await this.page.keyboard.press('Enter')
    await answered
  }

  // ── toolbar (FR-613, FR-660) ──────────────────────────────────────────────────────────────────────────────
  viewButton(view: TaskView): Locator {
    return this.page
      .getByRole('group', { name: th.tasks.view.label })
      .getByRole('button', { name: th.tasks.view[view], exact: true })
  }
  /** Switches ลิสต์/บอร์ด and waits for the `tasks.view` preference save (X74). */
  async setView(view: TaskView): Promise<void> {
    const saved = waitForServerAction(this.page)
    await this.viewButton(view).click()
    await saved
    await expect(this.viewButton(view)).toHaveAttribute('aria-pressed', 'true')
    await expect(view === 'list' ? this.list() : this.board()).toBeVisible()
  }
  private async choose(label: string, option: string): Promise<void> {
    await this.page.getByRole('combobox', { name: label }).click()
    const saved = waitForServerAction(this.page)
    await this.page.getByRole('listbox').getByRole('option', { name: option, exact: true }).click()
    await saved
  }
  async groupBy(key: 'none' | 'status' | 'assignee' | 'certainty'): Promise<void> {
    await this.choose(th.tasks.groupBy.label, th.tasks.groupBy[key])
  }
  async sortBy(key: 'manual' | 'due'): Promise<void> {
    await this.choose(th.tasks.sort.label, th.tasks.sort[key])
  }
  showCompletedSwitch(): Locator {
    return this.page.getByLabel(th.tasks.showCompleted, { exact: true })
  }
  async setShowCompleted(on: boolean): Promise<void> {
    const saved = waitForServerAction(this.page)
    await this.showCompletedSwitch().setChecked(on)
    await saved
  }

  // ── bulk bar (FR-614) ─────────────────────────────────────────────────────────────────────────────────────
  bulkBar(n: number): Locator {
    return this.page.getByRole('toolbar', { name: th.tasks.bulk.selected(n), exact: true })
  }
  bulkButton(n: number, label: string): Locator {
    return this.bulkBar(n).getByRole('button', { name: label, exact: true })
  }

  // ── panel (FR-611) ────────────────────────────────────────────────────────────────────────────────────────
  panel(): Locator {
    return this.page.getByRole('complementary', { name: th.tasks.panel.label })
  }
  panelTitle(name: string): Locator {
    return this.panel().getByRole('heading', { name, exact: true })
  }
  /**
   * Opens the panel through the row ⋯ "เปิดรายละเอียด" (stable: no selection side effect, works on a selected row too).
   * M6.1 replaced the row's "เปิดรายละเอียด" icon with the ↗ page link (M6.1-D17).
   */
  async openPanel(name: string): Promise<void> {
    await this.rowMenu(name, th.tasks.rowMenu.open)
    await expect(this.panelTitle(name)).toBeVisible()
  }
  /** The shared property rows inside the panel (M6.1-D16). */
  panelProps(): TaskProps {
    return new TaskProps(this.page, this.panel())
  }
  /** The compact body (FR-684): region th.taskPage.bodyLabel inside the panel. */
  panelBody(): Locator {
    return this.panel().getByRole('region', { name: th.taskPage.bodyLabel, exact: true })
  }
  /**
   * The panel header's "เปิดเป็นหน้า" link (FR-684) — the first link of that name (the subtask rows' ↗ below carry the
   * same name).
   */
  panelOpenAsPage(): Locator {
    return this.panel().getByRole('link', { name: th.tasks.openAsPage, exact: true }).first()
  }
  /** Panel "+ เพิ่มงานย่อย": types one subtask + Enter (closes the field with Esc afterwards). */
  async addSubtaskInPanel(name: string): Promise<void> {
    await this.panel().getByRole('button', { name: th.tasks.panel.addSubtask, exact: true }).click()
    const field = this.panel().getByRole('textbox', { name: th.tasks.panel.addSubtask, exact: true })
    await expect(field).toBeFocused()
    await this.page.keyboard.type(name)
    await this.page.keyboard.press('Enter')
    await expect(this.row(name)).toBeVisible()
    await this.settledId(name)
    await this.page.keyboard.press('Escape')
  }
  /** Due date in the panel (MUI X accessible field: sections DD / MM / BBBB). Month, year, then day, so the date is
   *  only valid — and saved — once, when the last section is complete. */
  async setPanelDueDate(iso: string): Promise<void> {
    const [y, m, d] = iso.split('-') as [string, string, string]
    const sections = this.panel().getByRole('group', { name: th.tasks.panel.dueDate }).getByRole('spinbutton')
    await expect(sections).toHaveCount(3)
    await sections.nth(1).click()
    await this.page.keyboard.type(m)
    await sections.nth(2).click()
    await this.page.keyboard.type(String(Number(y) + 543))
    const saved = waitForServerAction(this.page)
    await sections.nth(0).click()
    await this.page.keyboard.type(d)
    await saved
  }
  /** Panel "ถูกขวางโดย": adds `blocker` from the picker. Resolves when the action answered. */
  async addBlockerInPanel(blocker: string): Promise<void> {
    await this.panel().getByRole('button', { name: th.tasks.blockers.add, exact: true }).click()
    const input = this.panel().getByRole('combobox', { name: exactName(th.tasks.blockers.pickerLabel) })
    await expect(input).toBeFocused()
    await this.page.keyboard.type(blocker)
    const answered = waitForServerAction(this.page)
    await this.page.getByRole('listbox').getByRole('option', { name: blocker, exact: true }).click()
    await answered
  }
  blockerBadge(name: string, text: string): Locator {
    return this.row(name).getByText(text, { exact: true })
  }

  // ── board (FR-660–664) ────────────────────────────────────────────────────────────────────────────────────
  board(): Locator {
    return this.page.getByRole('region', { name: th.tasks.board.label })
  }
  columns(): Locator {
    return this.board().getByRole('group')
  }
  column(name: string): Locator {
    return this.board().getByRole('group', { name: columnLabelPattern(name) })
  }
  /** Column (status / category) names in board order. */
  async columnNames(): Promise<string[]> {
    const labels = await this.columns().evaluateAll((cols) =>
      cols.map((c) => c.getAttribute('aria-label') ?? ''),
    )
    return labels.map(columnNameOf)
  }
  async expectColumns(names: readonly string[]): Promise<void> {
    await expect.poll(() => this.columnNames()).toEqual([...names])
  }
  card(name: string): Locator {
    return this.board().getByRole('article', { name, exact: true })
  }
  cardStatusChip(name: string, status: string): Locator {
    return this.card(name).getByRole('button', { name: th.tasks.status.menuLabel(status), exact: true })
  }
  /**
   * Drags a card by its handle onto a column and waits for the resulting status action. The board scrolls
   * horizontally (272 px columns; 5+ columns are wider than the 1128 px content area), so when the target column is
   * outside the board's viewport the pointer first rests at the board's edge until dnd-kit's auto-scroll has brought
   * the column fully into view (a wait on UI state, not on time). The card is dropped at the same offset inside the
   * target column as it had in its own column, so `closestCorners` picks that column.
   */
  async dragCard(name: string, toColumn: string): Promise<void> {
    const page = this.page
    const handle = this.board().getByRole('button', {
      name: th.tasks.board.cardDragHandle(name),
      exact: true,
    })
    // `has` is matched inside each column, so the inner locator must not be rooted at the board region
    const fromColumn = this.columns().filter({ has: page.getByRole('article', { name, exact: true }) })
    const target = this.column(toColumn)
    await this.board().scrollIntoViewIfNeeded()
    await handle.hover({ trial: true }) // stable box: a previous drop may still be animating
    const [h, from, boardBox] = await Promise.all([
      handle.boundingBox(),
      fromColumn.boundingBox(),
      this.board().boundingBox(),
    ])
    if (!h || !from || !boardBox) throw new Error(`dragCard(${name}): no boxes`)
    const start = { x: h.x + h.width / 2, y: h.y + h.height / 2 }
    const offsetX = start.x - from.x
    const inView = async (): Promise<boolean> => {
      const t = await target.boundingBox()
      return t !== null && t.x >= boardBox.x - 1 && t.x + t.width <= boardBox.x + boardBox.width + 1
    }
    const answered = waitForServerAction(page)
    await page.mouse.move(start.x, start.y)
    await page.mouse.down()
    await page.mouse.move(start.x + 6, start.y, { steps: 5 }) // past the 4 px activation distance
    if (!(await inView())) {
      const t = await target.boundingBox()
      const right = t !== null && t.x > boardBox.x
      const edgeX = right ? boardBox.x + boardBox.width - 4 : boardBox.x + 4
      await page.mouse.move(edgeX, start.y, { steps: 10 })
      await expect.poll(inView, { message: `column ${toColumn} scrolled into view` }).toBe(true)
    }
    const t = await target.boundingBox()
    if (!t) throw new Error(`dragCard: column ${toColumn} has no box`)
    const drop = { x: t.x + offsetX, y: start.y }
    await page.mouse.move(drop.x, drop.y, { steps: 5 })
    await page.mouse.move(drop.x, drop.y, { steps: 2 }) // one more event so dnd-kit recomputes `over`
    await page.mouse.up()
    await answered
  }

  // ── list drag (FR-604) ────────────────────────────────────────────────────────────────────────────────────
  /** Drags `name` by its handle onto the row `overName` (same row = in place), shifted right by `dx` px. */
  async dragRow(name: string, { overName, dx = 0 }: { overName?: string; dx?: number } = {}): Promise<void> {
    const handle = this.row(name).getByRole('button', { name: th.tasks.dragHandle, exact: true })
    const overHandle = this.row(overName ?? name).getByRole('button', {
      name: th.tasks.dragHandle,
      exact: true,
    })
    const target = await centerOf(overHandle)
    const answered = waitForServerAction(this.page)
    await dragFromTo(this.page, handle, { x: target.x + dx, y: target.y })
    await answered
  }

  // ── FR-612 วางแผน (M6) ────────────────────────────────────────────────────────────────────────────────────
  /** The panel's "วางแผน" button of one assignee (leaf tasks). */
  planButton(personName: string): Locator {
    return this.panel().getByRole('button', { name: th.plan.buttonFor(personName), exact: true })
  }
  /** Opens the FR-612 dialog for `personName` from the open task panel. */
  async planFor(personName: string, taskName: string): Promise<PlanRangeDialog> {
    await this.planButton(personName).click()
    const dialog = new PlanRangeDialog(this.page, personName, taskName)
    await expect(dialog.root()).toBeVisible()
    return dialog
  }

  // ── shortcut help (X07) ───────────────────────────────────────────────────────────────────────────────────
  helpDialog(): Locator {
    return this.page.getByRole('dialog', { name: th.shortcuts.title })
  }

  toast(text: string): Locator {
    return toastWith(this.page, text)
  }
}

/** FR-612 "วางแผน N วัน" dialog (plan/m06 S4.3): total in days, start/end DateFields, debounced preview, apply. */
export class PlanRangeDialog {
  constructor(
    readonly page: Page,
    readonly personName: string,
    readonly taskName: string,
  ) {}

  root(): Locator {
    return this.page.getByRole('dialog', { name: th.plan.title(this.personName, this.taskName) })
  }
  total(): Locator {
    return this.root().getByRole('textbox', { name: exactName(th.plan.totalLabel) })
  }
  applyButton(): Locator {
    return this.root().getByRole('button', { name: th.plan.apply, exact: true })
  }
  previewTable(): Locator {
    return this.root().getByRole('table', { name: th.plan.preview })
  }
  /** MUI X accessible field (DD / MM / BBBB): month, year, then day, so each step stays a valid date. */
  private async setDate(label: string, iso: string): Promise<void> {
    const [y, m, d] = iso.split('-') as [string, string, string]
    const sections = this.root().getByRole('group', { name: label }).getByRole('spinbutton')
    await expect(sections).toHaveCount(3)
    await sections.nth(1).click()
    await this.page.keyboard.type(m)
    await sections.nth(2).click()
    await this.page.keyboard.type(String(Number(y) + 543))
    await sections.nth(0).click()
    await this.page.keyboard.type(d)
  }
  /** Types the total and the range (end first, so the start never exceeds it), then waits for the preview. */
  async fill(days: string, start: string, end: string): Promise<void> {
    await this.setDate(th.plan.endLabel, end)
    await this.setDate(th.plan.startLabel, start)
    await this.total().fill(days)
    await expect(this.previewTable()).toBeVisible()
    await expect(this.applyButton()).toBeEnabled()
  }
  /** Preview rows as [week header, kind label]. */
  async previewRows(): Promise<string[][]> {
    return this.previewTable()
      .locator('tbody tr')
      .evaluateAll((rows) =>
        rows.map((r) => [...r.querySelectorAll('td')].slice(0, 2).map((td) => td.textContent ?? '')),
      )
  }
  async apply(): Promise<void> {
    const answered = waitForServerAction(this.page)
    await this.applyButton().click()
    await answered
    await expect(this.root()).toHaveCount(0)
  }
}
