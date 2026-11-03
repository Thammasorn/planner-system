import { expect, type Locator, type Page } from '@playwright/test'
import type { ISODate, LoadView, PeriodKey } from '../../src/domain/types'
import { diffDays, weekStart } from '../../src/domain/dates'
import { th } from '../../src/i18n/th'
import { formatWeekHeader } from '../../src/lib/format'
import { DAY_W, timelineStart, WEEK_TOTAL_W, WEEK_W } from '../../src/lib/grid/columns'
import { E2E } from '../env'
import { waitForServerAction, waitForServerActionWith } from '../fixtures'
import { fillDate } from './date-field'
import { ShellPage } from './shell'
import { SidebarPage } from './sidebar'
import { toastWith } from './toast'

/** RegExp source matching `s` literally. */
export function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
/** `s` inside a double-quoted CSS attribute value. */
function cssString(s: string): string {
  return s.replace(/["\\]/g, '\\$&')
}
/** Accessible-name prefix of the ◆ of milestone `name` (th.milestones.grid.diamondLabel before the date). */
function diamondName(name: string): RegExp {
  const [prefix] = th.milestones.grid.diamondLabel(name, '\u0000', '').split('\u0000')
  return new RegExp(`^${escapeRe(prefix!)}`)
}

/**
 * แผนงาน tab — the planning grid (plan/m06 S6.1; ★ M7/M9 extend this object). DOM contract (S3):
 * - root: role=grid named th.grid.gridLabel(project) with `data-save-state` idle | pending | saving | error;
 * - rows: the rowheader carries `data-row-key` ('t:…' task rows, 'a:…' assignee / merged rows) and the accessible
 *   name '<task>' or '<task> · <person>';
 * - cells: test ids `cell-<rowKey>-W:<Monday>`, `cell-<rowKey>-total`, footer `cell-footer-{load,capacity,util}-W:<Monday>`;
 *   a body cell's visible number is its `[data-cell-value]` span (glyph texts are separate);
 * - header cells: `data-col-key`; one shared tooltip role=tooltip / data-testid grid-tooltip; fill handle
 *   `[data-fill-handle]`.
 * Locator rules (C27): rows and cells only by data-row-key, data-testid or accessible names — never by
 * aria-rowindex, nth() row position or a row count that includes header rows (M8 inserts the ◆ header row).
 */
/** The pinned "today" of every e2e run (APP_NOW, X45). */
const E2E_TODAY: ISODate = E2E.appNow.slice(0, 10)

export class GridPage {
  readonly shell: ShellPage
  readonly sidebar: SidebarPage

  constructor(readonly page: Page) {
    this.shell = new ShellPage(page)
    this.sidebar = new SidebarPage(page)
  }

  // ── navigation ────────────────────────────────────────────────────────────────────────────────────────────
  /** Sidebar → project (ภาพรวม) → tab แผนงาน; waits for the grid with its data and an idle save state. */
  async goto(projectName: string): Promise<void> {
    if (!(await this.sidebar.projectLink(projectName).isVisible())) await this.shell.goto('/home')
    await this.sidebar.projectLink(projectName).click()
    await this.page.waitForURL(/\/projects\/[0-9a-f-]{36}\/overview$/)
    await this.openTab(projectName)
  }

  /** Clicks the project tab แผนงาน (client-side navigation: the undo stack and toasts stay). */
  async openTab(projectName: string): Promise<void> {
    await this.page
      .getByRole('tablist', { name: th.projects.tabsLabel })
      .getByRole('tab', { name: th.projects.tabs.plan, exact: true })
      .click()
    await this.page.waitForURL(/\/projects\/[0-9a-f-]{36}\/plan(\?|$)/)
    await this.waitReady(projectName)
  }

  async waitReady(projectName: string): Promise<void> {
    this.projectName = projectName
    await expect(this.root()).toBeVisible()
    await expect(this.root().locator('[data-row-key]').first()).toBeVisible()
    await this.shell.waitForHydration()
    await this.waitSaved()
  }

  async reload(): Promise<void> {
    await this.page.reload()
    await this.waitReady(this.projectName)
  }

  private projectName = ''

  root(): Locator {
    return this.page.getByRole('grid', { name: th.grid.gridLabel(this.projectName) })
  }
  toolbar(): Locator {
    return this.page.getByRole('toolbar', { name: th.grid.toolbar.label })
  }

  // ── rows and cells ────────────────────────────────────────────────────────────────────────────────────────
  rowHeader(taskName: string, personName?: string): Locator {
    const name = personName === undefined ? taskName : `${taskName} · ${personName}`
    return this.root().getByRole('rowheader', { name, exact: true })
  }
  /**
   * Selects a row with a plain click on its label (the task name, or the person on an assignee row). M7.1: the row
   * header spans both frozen columns, so its centre can fall on ↗ / + คน (which stop the click or navigate) — click
   * the text, as a user would, instead of the header's centre.
   */
  async selectRow(taskName: string, personName?: string): Promise<void> {
    const header = this.rowHeader(taskName, personName)
    const name = header.locator('[data-task-cell] span[title]')
    const label = (await name.count()) > 0 ? name : header.locator('[data-assignee-cell] span').first()
    await label.click()
    await expect(header).toHaveAttribute('aria-selected', 'true')
  }

  /**
   * M6.1 (M6.1-D17, FR-685): the ↗ of a task / merged row — a real `<a href="/t/<id>">` named
   * th.grid.row.openTaskPage(task); assignee rows have none.
   */
  openTaskPageLink(taskName: string, personName?: string): Locator {
    return this.rowHeader(taskName, personName).getByRole('link', {
      name: th.grid.row.openTaskPage(taskName),
      exact: true,
    })
  }
  /** Clicks the row's ↗ and waits for `/t/<id>`. */
  async openTaskPage(taskName: string, personName?: string): Promise<void> {
    await this.rowHeader(taskName, personName).hover()
    await this.openTaskPageLink(taskName, personName).click()
    await this.page.waitForURL(/\/t\/[0-9a-f-]{36}$/)
  }
  /** Double-click on the row header (not on ↗) keeps opening the task panel (M6-D18, M6.1-D17). */
  async openPanelByDoubleClick(taskName: string, personName?: string): Promise<void> {
    await this.rowHeader(taskName, personName).getByText(taskName, { exact: true }).first().dblclick()
    await this.page.waitForURL((u) => u.searchParams.has('task'))
  }

  /** ★ The row key ('t:…' | 'a:…') of the row named '<task>' or '<task> · <person>'. */
  async rowKeyOf(taskName: string, personName?: string): Promise<string> {
    const header = this.rowHeader(taskName, personName)
    await expect(header).toHaveAttribute('data-row-key', /^[ta]:/)
    return (await header.getAttribute('data-row-key')) as string
  }

  cell(rowKey: string, week: ISODate): Locator {
    return this.page.getByTestId(`cell-${rowKey}-W:${week}`)
  }
  /** The visible number of a body cell ('' when empty). */
  value(cell: Locator): Locator {
    return cell.locator('[data-cell-value]')
  }
  total(rowKey: string): Locator {
    return this.page.getByTestId(`cell-${rowKey}-total`)
  }
  /** ★ */
  footerLoad(periodKey: PeriodKey): Locator {
    return this.page.getByTestId(`cell-footer-load-${periodKey}`)
  }
  footerCapacity(periodKey: PeriodKey): Locator {
    return this.page.getByTestId(`cell-footer-capacity-${periodKey}`)
  }
  footerUtil(periodKey: PeriodKey): Locator {
    return this.page.getByTestId(`cell-footer-util-${periodKey}`)
  }
  footerLoadLabel(names: string): Locator {
    return this.root()
      .getByRole('rowheader')
      .filter({ hasText: th.grid.footer.load(names) })
  }
  columnHeader(week: ISODate): Locator {
    return this.root().locator(`[role="columnheader"][data-col-key="W:${week}"]`)
  }
  selectedCells(): Locator {
    return this.root().locator('[role="gridcell"][aria-selected="true"]')
  }
  tooltip(): Locator {
    return this.page.getByTestId('grid-tooltip')
  }
  /** Rendered task/assignee rows (virtualised: only the rows near the viewport exist). */
  renderedRows(): Locator {
    return this.root().locator('[role="row"][data-row-key]')
  }

  /** Scrolls the grid horizontally so `week` is the 3rd visible column (the column virtualiser renders it). */
  async scrollToWeek(week: ISODate): Promise<void> {
    const header = this.columnHeader(week)
    const index = diffDays(timelineStart(E2E_TODAY), week) / 7
    // M7: in day zoom every week is Mon–Fri day columns + its narrow รวม column (weekend columns and inline expanded
    // weeks make the estimate approximate; the loop below corrects it from the rendered week headers).
    const dayZoom = (await this.zoomButton('day').getAttribute('aria-pressed')) === 'true'
    const perWeek = dayZoom ? 5 * DAY_W + WEEK_TOTAL_W : WEEK_W
    const setLeft = (left: number) =>
      this.root().evaluate(
        async (el, l) => {
          el.scrollLeft = l
          // the virtualisers re-render on the scroll event: read the rendered headers only after two frames
          await new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())))
        },
        Math.max(0, left),
      )
    await setLeft((index - 2) * perWeek)
    for (let i = 0; i < 20 && (await header.count()) === 0; i++) {
      const keys = (
        await this.root()
          .locator('[role="columnheader"][data-col-key^="W:"]')
          .evaluateAll((els) => els.map((e) => e.getAttribute('data-col-key')!.slice(2)))
      ).sort()
      const first = keys[0]
      const last = keys.at(-1)
      const left = await this.root().evaluate((el) => el.scrollLeft)
      if (!first || !last) await setLeft(left + (week < E2E_TODAY ? -perWeek : perWeek))
      else if (week < first) await setLeft(left - (diffDays(week, first) / 7 + 2) * perWeek)
      else if (week > last) await setLeft(left + (diffDays(last, week) / 7 + 1) * perWeek)
    }
    await expect(header).toBeAttached()
  }

  /** The cell, scrolled into the virtual window (horizontally) and into view (vertically). */
  async reveal(rowKey: string, week: ISODate): Promise<Locator> {
    const cell = this.cell(rowKey, week)
    if ((await cell.count()) === 0) await this.scrollToWeek(week)
    await expect(cell).toBeAttached()
    await cell.scrollIntoViewIfNeeded()
    return cell
  }

  // ── gestures ──────────────────────────────────────────────────────────────────────────────────────────────
  /** click + shift+click */
  async select(from: Locator, to?: Locator): Promise<void> {
    await from.click()
    if (to) await to.click({ modifiers: ['Shift'] })
  }
  /** click, keyboard.type, Enter (or Tab) */
  async typeInto(cell: Locator, text: string, commit: 'Enter' | 'Tab' = 'Enter'): Promise<void> {
    await cell.click()
    await this.page.keyboard.type(text)
    await this.page.keyboard.press(commit)
  }
  async press(key: string): Promise<void> {
    await this.page.keyboard.press(key)
  }
  /** Synthetic DataTransfer + ClipboardEvent on the focused cell (r4 §41). */
  async paste(tsv: string): Promise<void> {
    await this.page.evaluate((text) => {
      const target = document.activeElement ?? document.body
      const dt = new DataTransfer()
      dt.setData('text/plain', text)
      target.dispatchEvent(
        new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }),
      )
    }, tsv)
  }
  /** ControlOrMeta+C, then the clipboard text. */
  async copy(): Promise<string> {
    await this.page.keyboard.press('ControlOrMeta+c')
    return this.page.evaluate(() => navigator.clipboard.readText())
  }

  // ── toolbar ───────────────────────────────────────────────────────────────────────────────────────────────
  zoomWeek(): Locator {
    return this.toolbar().getByRole('button', { name: th.grid.toolbar.zoomWeek, exact: true })
  }
  private async choose(label: string, option: string): Promise<void> {
    await this.toolbar().getByRole('combobox', { name: label }).click()
    await this.page.getByRole('listbox').getByRole('option', { name: option, exact: true }).click()
    await expect(this.toolbar().getByRole('combobox', { name: label })).toHaveText(option)
  }
  async setUnit(u: 'DAYS' | 'FRACTION'): Promise<void> {
    await this.choose(th.units.label, th.units[u])
  }
  async setView(v: LoadView): Promise<void> {
    await this.choose(th.grid.toolbar.view, th.grid.view[v])
  }
  async today(): Promise<void> {
    await this.toolbar().getByRole('button', { name: th.grid.toolbar.today, exact: true }).click()
  }
  includeOthersSwitch(): Locator {
    return this.root().getByRole('switch', { name: th.grid.toolbar.includeOthers })
  }
  async includeOthers(on: boolean): Promise<void> {
    const sw = this.includeOthersSwitch()
    if ((await sw.isChecked()) !== on) await sw.click()
    await expect(sw).toBeChecked({ checked: on })
  }
  showCompletedSwitch(): Locator {
    return this.toolbar().getByRole('switch', { name: th.grid.toolbar.showCompleted })
  }
  /** The toolbar's last Tab stop (M7.1 appended ผู้รับผิดชอบ, เส้นกำกับ and กราฟภาระ after the M6 switch). */
  lastToolbarControl(): Locator {
    return this.toolbar()
      .locator('button, input:not([aria-hidden="true"]), [role="combobox"], a[href]')
      .and(this.page.locator(':not([tabindex="-1"]):not([disabled])'))
      .last()
  }

  // ── M7 day resolution (plan/m07 S5.1) ─────────────────────────────────────────────────────────────────────
  // DOM contract (S3): zoom = MUI ToggleButtonGroup (role=group named th.grid.toolbar.zoom, buttons with aria-pressed);
  // a collapsed week header holds a button named th.grid.day.expandWeek(<d/m>) (aria-expanded=false); an expanded
  // week's first day header holds the collapse-view button th.grid.day.collapseWeekView(<d/m>) (aria-expanded=true,
  // text formatThaiDate(week, 'medium')); day cells `cell-<rowKey>-D:<date>`, the narrow รวม column keeps the week's
  // `cell-<rowKey>-W:<Monday>` id; derived values carry data-derived="true"; a BR-24 pending cell
  // data-pending-choice="true"; glyphs `[data-glyph=over|risk|warn|dayDetail]`; footer day tones `data-tone`.
  /** The `[สัปดาห์ | วัน]` toggle group. */
  zoomGroup(): Locator {
    return this.toolbar().getByRole('group', { name: th.grid.toolbar.zoom })
  }
  zoomButton(level: 'week' | 'day'): Locator {
    return this.zoomGroup().getByRole('button', {
      name: level === 'week' ? th.grid.toolbar.zoomWeek : th.grid.toolbar.zoomDay,
      exact: true,
    })
  }
  zoomDay(): Locator {
    return this.zoomButton('day')
  }
  /** Clicks the zoom button and waits until it is pressed and the grid is idle again. */
  async zoom(level: 'week' | 'day'): Promise<void> {
    await this.zoomButton(level).click()
    await expect(this.zoomButton(level)).toHaveAttribute('aria-pressed', 'true')
    // the day layout is rendered before callers scroll by column widths
    if (level === 'day')
      await expect(this.root().locator('[role="columnheader"][data-col-key^="D:"]').first()).toBeAttached()
    await this.waitSaved()
  }
  /** The expand toggle of a collapsed week header (plain click expands, view only). */
  weekHeader(week: ISODate): Locator {
    return this.root().getByRole('button', {
      name: th.grid.day.expandWeek(formatWeekHeader(week)),
      exact: true,
    })
  }
  /** The collapse-view toggle on the first day header of an expanded week. */
  dayGroupHeader(week: ISODate): Locator {
    return this.root().getByRole('button', {
      name: th.grid.day.collapseWeekView(formatWeekHeader(week)),
      exact: true,
    })
  }
  /** The column header of one day (expanded week / day zoom). */
  dayHeader(date: ISODate): Locator {
    return this.root().locator(`[role="columnheader"][data-col-key="D:${date}"]`)
  }
  /** Expands `week` by a plain header click and waits for its day columns. */
  async expandWeek(week: ISODate): Promise<void> {
    if ((await this.columnHeader(week).count()) === 0) await this.scrollToWeek(week)
    await this.weekHeader(week).click()
    await expect(this.dayGroupHeader(week)).toHaveAttribute('aria-expanded', 'true')
    await expect(this.dayHeader(week)).toBeAttached()
  }
  dayCell(rowKey: string, date: ISODate): Locator {
    return this.page.getByTestId(`cell-${rowKey}-D:${date}`)
  }
  /** The day cell, attached and scrolled into view (the dates the specs use lie inside the first viewport). */
  async revealDay(rowKey: string, date: ISODate): Promise<Locator> {
    const cell = this.dayCell(rowKey, date)
    await expect(cell).toBeAttached()
    await cell.scrollIntoViewIfNeeded()
    return cell
  }
  /** "↕ รวมเป็นรายสัปดาห์" inside the รวม cell of an expanded DAY week (shown on hover / focus). */
  collapseButton(rowKey: string, week: ISODate): Locator {
    return this.cell(rowKey, week).getByRole('button', { name: th.grid.day.collapseToWeek, exact: true })
  }
  /** The cell menu (right click / Shift+F10). */
  cellMenu(): Locator {
    return this.page.getByRole('menu', { name: th.grid.day.cellMenu })
  }
  /** The BR-24 choice dialog (found by its SCALE option text — its title depends on the number of weeks). */
  br24(): { root: Locator; scale(): Promise<void>; collapse(): Promise<void>; cancel(): Promise<void> } {
    const root = this.page.getByRole('dialog').filter({ hasText: th.grid.br24.scale })
    const choose = async (name: string, exact: boolean) => {
      await root.getByRole('button', { name, exact }).click()
      await expect(root).toHaveCount(0)
    }
    return {
      root,
      scale: () => choose(th.grid.br24.scale, false),
      collapse: () => choose(th.grid.br24.collapse, false),
      cancel: () => choose(th.grid.br24.cancel, true),
    }
  }

  // ── M7.1 two frozen columns, month row, milestone lines, row drag, chart pane (plan/m07.1 S6) ─────────────────────────
  // DOM contract (S3): one rowheader per row (aria-colspan 2) holding `[data-task-cell]` (⠿ `[data-drag-handle]`,
  // name `span[title]`, "👥 N" `[data-sum-people]`) and `[data-assignee-cell]` (absent when hidden). Header row 2 has
  // `[data-frozen-header="task"]` (with the ⇔ separator, test id task-column-resize) and `[data-frozen-header=
  // "assignee"]` ("ซ่อน", test id hide-assignees); header row 1 holds month spans `[data-month="YYYY-MM"]` named by the
  // long label. The first column of every month carries `data-month-start` on header, body and footer cells. Milestone
  // lines `[data-marker-line=header|body|footer][data-color][data-marker-ids]` (M11.1: no flags). Hidden assignees: grid root `data-assignees="hidden"`, one summed row
  // per task keyed `t:<task>`.

  /** Opens `/projects/<id>/plan<search>` directly (archived projects are not in the sidebar). */
  async open(projectName: string, projectId: string, search = ''): Promise<void> {
    await this.shell.goto(`/projects/${projectId}/plan${search}`)
    await this.waitReady(projectName)
  }

  /** The task-name part of a row header ('<task>' or '<task> · <person>'). */
  taskCell(taskName: string, personName?: string): Locator {
    return this.rowHeader(taskName, personName).locator('[data-task-cell]')
  }
  /** The ผู้รับผิดชอบ part of a merged / assignee row header. */
  assigneeCell(taskName: string, personName: string): Locator {
    return this.rowHeader(taskName, personName).locator('[data-assignee-cell]')
  }
  /** The task name span (… + title tooltip) of a row. */
  taskName(taskName: string, personName?: string): Locator {
    return this.taskCell(taskName, personName).locator(`span[title="${cssString(taskName)}"]`)
  }
  /** Task names of the rendered rows, top to bottom, one entry per task (merged / assignee rows collapse). */
  async rowTaskNames(): Promise<string[]> {
    const labels = await this.root()
      .locator('[role="row"][data-row-key] > [role="rowheader"]')
      .evaluateAll((els) =>
        els
          .map((e) => ({ r: Number(e.getAttribute('data-r')), label: e.getAttribute('aria-label') ?? '' }))
          .sort((a, b) => a.r - b.r)
          .map((x) => x.label),
      )
    const out: string[] = []
    for (const l of labels) {
      const name = l.split(' · ')[0]!
      if (out.at(-1) !== name) out.push(name)
    }
    return out
  }
  async expectRowTaskNames(names: readonly string[]): Promise<void> {
    await expect.poll(() => this.rowTaskNames()).toEqual([...names])
  }
  /** Row header labels of the rendered rows, top to bottom ('<task>' or '<task> · <person>'). */
  async rowLabels(): Promise<string[]> {
    return this.root()
      .locator('[role="row"][data-row-key] > [role="rowheader"]')
      .evaluateAll((els) =>
        els
          .map((e) => ({ r: Number(e.getAttribute('data-r')), label: e.getAttribute('aria-label') ?? '' }))
          .sort((a, b) => a.r - b.r)
          .map((x) => x.label),
      )
  }
  /**
   * The cell of the row named `taskName` (a summed row when assignees are hidden) in `week`. A single-assignee summed
   * row's cells keep the merged `cell-a:<assignment>-…` test id, so the cell is found through its row, not its id.
   */
  rowCell(taskName: string, week: ISODate, personName?: string): Locator {
    const name = personName === undefined ? taskName : `${taskName} · ${personName}`
    return (
      this.root()
        .locator('[role="row"][data-row-key]')
        // `has` is relative to each row: a page-level locator, not the root-scoped rowHeader()
        .filter({ has: this.page.getByRole('rowheader', { name, exact: true }) })
        .locator(`[role="gridcell"][data-testid$="-W:${week}"]`)
    )
  }
  /** rowCell, scrolled into the virtual window and into view. */
  async revealRowCell(taskName: string, week: ISODate, personName?: string): Promise<Locator> {
    const cell = this.rowCell(taskName, week, personName)
    if ((await cell.count()) === 0) await this.scrollToWeek(week)
    await expect(cell).toBeAttached()
    await cell.scrollIntoViewIfNeeded()
    return cell
  }

  // frozen columns
  taskHeader(): Locator {
    return this.root().locator('[data-frozen-header="task"]')
  }
  assigneeHeader(): Locator {
    return this.root().locator('[data-frozen-header="assignee"]')
  }
  showAssigneesSwitch(): Locator {
    return this.toolbar().getByRole('switch', { name: th.grid.columns.show })
  }
  /** "ซ่อน" on the ผู้รับผิดชอบ header. */
  hideAssigneesButton(): Locator {
    return this.assigneeHeader().getByRole('button', { name: th.grid.columns.hide, exact: true })
  }
  /** Toggles "แสดงผู้รับผิดชอบ" in the toolbar and waits for the grid layout and the saved preference. */
  async showAssignees(on: boolean): Promise<void> {
    const sw = this.showAssigneesSwitch()
    if ((await sw.isChecked()) !== on) {
      const saved = waitForServerActionWith(this.page, 'grid.showAssignees')
      await sw.click()
      await saved
    }
    await this.expectAssigneesShown(on)
  }
  async expectAssigneesShown(on: boolean): Promise<void> {
    await expect(this.showAssigneesSwitch()).toBeChecked({ checked: on })
    if (on) {
      await expect(this.root()).not.toHaveAttribute('data-assignees', 'hidden')
      await expect(this.assigneeHeader()).toBeVisible()
    } else {
      await expect(this.root()).toHaveAttribute('data-assignees', 'hidden')
      await expect(this.assigneeHeader()).toHaveCount(0)
    }
  }
  /** The ⇔ separator at the right edge of the งาน header. */
  resizeHandle(): Locator {
    return this.root().getByRole('separator', { name: th.grid.columns.resize })
  }
  /** Rendered width (px, rounded) of the งาน column header. */
  async taskColumnWidth(): Promise<number> {
    const b = await this.taskHeader().boundingBox()
    if (!b) throw new Error('งาน header has no box')
    // hidden assignees: the งาน header spans both frozen columns (the assignee width is 0 then)
    return Math.round(b.width)
  }
  /** Rendered width (px) of the whole frozen area (งาน + ผู้รับผิดชอบ). */
  async frozenWidth(): Promise<number> {
    return this.root().evaluate((el) => {
      const rects = [...el.querySelectorAll<HTMLElement>('[data-frozen-header]')].map((h) =>
        h.getBoundingClientRect(),
      )
      return Math.max(...rects.map((r) => r.right)) - Math.min(...rects.map((r) => r.left))
    })
  }
  /** Drags the ⇔ separator by `dx` px and waits for the one `grid.taskColumnWidth` save of the gesture. */
  async resizeTaskColumn(dx: number): Promise<void> {
    const handle = this.resizeHandle()
    await handle.hover()
    const b = (await handle.boundingBox())!
    const x = Math.round(b.x + b.width / 2)
    const y = Math.round(b.y + b.height / 2)
    const saved = waitForServerActionWith(this.page, 'grid.taskColumnWidth')
    await this.page.mouse.move(x, y)
    await this.page.mouse.down()
    await this.page.mouse.move(x + dx, y, { steps: 12 })
    await this.page.mouse.up()
    await saved
  }
  /** Whole week columns between the frozen columns and the sticky "รวม" header (period row only). */
  async visibleWeekColumns(): Promise<{ whole: number; frozenW: number; gridW: number }> {
    return this.root().evaluate((el) => {
      const row = el.querySelector('[data-frozen-header="task"]')!.closest('[role="row"]')!
      const heads = [...row.querySelectorAll<HTMLElement>('[role="columnheader"]')]
      const frozen = heads
        .filter((h) => h.hasAttribute('data-frozen-header'))
        .map((h) => h.getBoundingClientRect())
      const left = Math.min(...frozen.map((r) => r.left))
      const right = Math.max(...frozen.map((r) => r.right))
      const total = heads[heads.length - 1]!.getBoundingClientRect()
      const whole = heads
        .filter((h) => h.hasAttribute('data-col-key'))
        .map((h) => h.getBoundingClientRect())
        .filter((r) => r.left >= right - 1 && r.right <= total.left + 1).length
      return { whole, frozenW: right - left, gridW: el.getBoundingClientRect().width }
    })
  }
  /** This week's header is a whole visible column (right of the frozen columns, left of "รวม"). */
  async todayHeaderWhole(): Promise<boolean> {
    return this.root().evaluate((el) => {
      const row = el.querySelector('[data-frozen-header="task"]')!.closest('[role="row"]')!
      const heads = [...row.querySelectorAll<HTMLElement>('[role="columnheader"]')]
      const right = Math.max(
        ...heads
          .filter((h) => h.hasAttribute('data-frozen-header'))
          .map((h) => h.getBoundingClientRect().right),
      )
      const total = heads[heads.length - 1]!.getBoundingClientRect()
      const t = row.querySelector('[role="columnheader"][data-today="true"]')?.getBoundingClientRect()
      return t !== undefined && t.left >= right - 1 && t.right <= total.left + 1
    })
  }
  /**
   * The sticky "รวม" header of the period row vs its period headers (M7 V1): `gap` = distance from the right edge of
   * the last header ending at or before it (0 = abuts), `straddle` = headers starting left of it and ending right of it.
   */
  async totalHeaderFit(): Promise<{ gap: number; straddle: number }> {
    return this.root().evaluate((el) => {
      const row = el.querySelector('[data-frozen-header="task"]')!.closest('[role="row"]')!
      const heads = [...row.querySelectorAll<HTMLElement>('[role="columnheader"][aria-colindex]')]
      const colindex = (h: HTMLElement) => Number(h.getAttribute('aria-colindex'))
      const total = heads.reduce((a, b) => (colindex(b) > colindex(a) ? b : a))
      const t = total.getBoundingClientRect().left
      const periods = heads
        .filter((h) => h !== total && h.hasAttribute('data-col-key'))
        .map((h) => h.getBoundingClientRect())
      const ends = periods.map((r) => r.right).filter((right) => right <= t + 1)
      const gap = ends.length === 0 ? Number.POSITIVE_INFINITY : t - Math.max(...ends)
      const straddle = periods.filter((r) => r.left < t - 1 && r.right > t + 1).length
      return { gap: Math.abs(gap), straddle }
    })
  }

  // month row (FR-818)
  /** Header row 1 (month + year). */
  monthHeader(): Locator {
    return this.root()
      .locator('[role="row"]')
      .filter({ has: this.page.locator('[data-month]') })
      .first()
  }
  /** The month span `YYYY-MM` (accessible name = the long label, e.g. "ตุลาคม 2569"). */
  monthSpan(month: string): Locator {
    return this.root().locator(`[role="columnheader"][data-month="${month}"]`)
  }
  /** The header cell of the first column of a month — it carries the boundary line (`data-month-start`). */
  monthBoundaryBefore(periodKey: PeriodKey): Locator {
    return this.root().locator(`[role="columnheader"][data-col-key="${periodKey}"][data-month-start]`)
  }

  // milestone lines (BR-102; M11.1 FR-709: in the milestone's colour — M7.1's plan markers were merged into milestones)
  /** The line pieces of the layer, optionally of one milestone (`data-marker-ids` lists the milestones at that edge). */
  markerLines(piece: 'header' | 'body' | 'footer', milestoneId?: string): Locator {
    const ids = milestoneId ? `[data-marker-ids~="${milestoneId}"]` : ''
    return this.root().locator(`[data-marker-line="${piece}"]${ids}`)
  }
  /** M11.1: the "เส้นกำกับ" toolbar menu no longer exists. */
  markersMenuButton(): Locator {
    return this.toolbar().getByTestId('markers-menu')
  }
  /** The colour radio named `name` (th.milestones.color.name[c]) inside a MilestoneForm `scope`. */
  milestoneColor(scope: Locator, color: 'PURPLE' | 'RED' | 'YELLOW' | 'GREEN' | 'BLUE'): Locator {
    return scope
      .getByRole('radiogroup', { name: th.milestones.color.label })
      .getByRole('radio', { name: th.milestones.color.name[color], exact: true })
  }
  /** M11.1 (FR-1010): picks `d` on the person grid toolbar's "% | วัน/capacity" toggle and waits for the save. */
  async setLoadDisplay(d: 'PERCENT' | 'DAYS'): Promise<void> {
    const b = this.loadDisplayButton(this.toolbar(), d)
    if ((await b.getAttribute('aria-pressed')) === 'true') return
    const saved = waitForServerActionWith(this.page, 'load.display')
    await b.click()
    await saved
    await expect(b).toHaveAttribute('aria-pressed', 'true')
  }
  /** M11.1 (FR-1010): the "% | วัน/capacity" toggle (person grid toolbar, chart pane head). */
  loadDisplayButton(scope: Locator, d: 'PERCENT' | 'DAYS'): Locator {
    return scope
      .getByRole('group', { name: th.loadDisplay.label })
      .getByRole('button', { name: d === 'PERCENT' ? th.loadDisplay.PERCENT_long : th.loadDisplay.DAYS_long })
  }

  // row reorder (FR-815)
  dragHandle(taskName: string, personName?: string): Locator {
    return this.rowHeader(taskName, personName).getByRole('button', {
      name: th.grid.reorder.handle,
      exact: true,
    })
  }
  dropIndicator(): Locator {
    return this.root().getByTestId('drop-indicator')
  }
  /**
   * Drags the ⠿ of `name` onto the top edge of the row `to` (the drop line sits above that row), `indent` px to the
   * right (= nest under the row above); waits for the indicator before the drop and for the move action after it.
   */
  async dragRow(
    from: { task: string; person?: string },
    to: { task: string; person?: string },
    o: { indent?: number } = {},
  ): Promise<void> {
    const handle = this.dragHandle(from.task, from.person)
    await this.rowHeader(from.task, from.person).hover()
    const hb = (await handle.boundingBox())!
    const tb = (await this.rowHeader(to.task, to.person).boundingBox())!
    const start = { x: hb.x + hb.width / 2, y: hb.y + hb.height / 2 }
    const target = { x: start.x + (o.indent ?? 0), y: tb.y + 4 }
    await this.page.mouse.move(start.x, start.y)
    await this.page.mouse.down()
    await this.page.mouse.move(start.x, start.y - 6, { steps: 3 })
    await this.page.mouse.move(target.x, target.y, { steps: 10 })
    await expect(this.dropIndicator()).toBeVisible()
    await expect(this.dropIndicator()).toHaveAttribute('data-valid', 'true')
    const moved = waitForServerAction(this.page)
    await this.page.mouse.up()
    await moved
    await expect(this.dropIndicator()).toHaveCount(0)
  }

  // chart pane (FR-813)
  chartToggle(): Locator {
    return this.toolbar().getByRole('button', { name: th.loadChart.toggle, exact: true })
  }
  chartPane(): Locator {
    return this.page.getByTestId('chart-pane')
  }
  /** Opens / closes "กราฟภาระ" (saved as `grid.chart`). */
  async setChart(open: boolean): Promise<void> {
    const toggle = this.chartToggle()
    if ((await toggle.getAttribute('aria-pressed')) !== String(open)) {
      const saved = waitForServerActionWith(this.page, 'grid.chart')
      await toggle.click()
      await saved
    }
    await expect(toggle).toHaveAttribute('aria-pressed', String(open))
    if (open) await expect(this.chartPane()).toBeVisible()
    else await expect(this.chartPane()).toHaveCount(0)
  }

  /** The non-modal hint on a read-only summed cell (FR-817). */
  sumHint(): Locator {
    return this.page.getByTestId('sum-mode-hint')
  }

  // ── M8 ◆ milestone row (plan/m08 S6.1, S3.3–S3.7; SPEC FR-702/705/706/707) ──────────────────────────────────
  // DOM contract (S3): header row 1 is role=row named th.milestones.grid.rowLabel (test id ms-row, `data-manage` for
  // M/L). One gridcell per rendered column `ms-cell-<periodKey>` (`data-drop="true"` while a drag targets it); the first
  // ◆ of a column is a button named th.milestones.grid.diamondLabel(name, date medium, status) [+ lateTasks(n)] with
  // `data-status`, `data-late`, `data-ms-id`; "+N" is `ms-more-<periodKey>`. Popovers: details `ms-popover` (managers:
  // MilestoneForm + ms-toggle-complete + ms-delete; others `ms-read-only`), create `ms-create-popover`. Task row headers
  // carry "→◆name" `[data-ms-link]`, the ⚠ chip `[data-ms-late]` and `data-late-for-milestone="true"`.
  // Never by aria-rowindex (the ◆ row is header row 1, M8-D26).

  milestoneRow(): Locator {
    return this.root().getByRole('row', { name: th.milestones.grid.rowLabel, exact: true })
  }
  milestoneCell(key: PeriodKey): Locator {
    return this.page.getByTestId(`ms-cell-${key}`)
  }
  /** The ◆ cell, scrolled into the column virtualiser's window (W:<Monday> or D:<date>). */
  async revealMilestoneCell(key: PeriodKey): Promise<Locator> {
    const cell = this.milestoneCell(key)
    if ((await cell.count()) === 0) {
      const date: ISODate = key.slice(2)
      await this.scrollToWeek(key.startsWith('D:') ? weekStart(date) : date)
    }
    await expect(cell).toBeAttached()
    return cell
  }
  /** The ◆ button of milestone `name` anywhere in the row (its accessible name starts "milestone <name> "). */
  diamond(name: string): Locator {
    return this.milestoneRow().getByRole('button', { name: diamondName(name) })
  }
  /** The ◆ button of milestone `name` inside the column `key`. */
  diamondIn(key: PeriodKey, name: string): Locator {
    return this.milestoneCell(key).getByRole('button', { name: diamondName(name) })
  }
  /** Toolbar "+ milestone" (managers only). */
  toolbarAddMilestone(): Locator {
    return this.toolbar().getByRole('button', { name: th.milestones.grid.toolbarAdd, exact: true })
  }
  /** The ◆ details popover (role=dialog). */
  milestonePopover(): Locator {
    return this.page.getByTestId('ms-popover')
  }
  /** The create popover (role=dialog named th.milestones.form.createTitle). */
  milestoneCreatePopover(): Locator {
    return this.page.getByTestId('ms-create-popover')
  }
  /** The name textbox of a MilestoneForm inside `scope`. */
  milestoneNameInput(scope: Locator): Locator {
    return scope.getByRole('textbox', { name: th.milestones.fields.name })
  }

  /** Click on the empty part of a ◆-row cell (M/L: opens the create popover pre-filled with the column date). */
  async clickEmptyMilestoneCell(key: PeriodKey): Promise<void> {
    const cell = await this.revealMilestoneCell(key)
    await cell.scrollIntoViewIfNeeded()
    await expect(cell.getByRole('button')).toHaveCount(0)
    await cell.click()
  }
  /** Clicks the empty cell and waits for the create popover. */
  async openCreateAt(key: PeriodKey): Promise<Locator> {
    await this.clickEmptyMilestoneCell(key)
    const pop = this.milestoneCreatePopover()
    await expect(pop).toBeVisible()
    await expect(this.milestoneNameInput(pop)).toBeFocused()
    return pop
  }
  /** In the open create popover: name (+ date), Enter in the name → waits for the create action; the popover closes. */
  async submitCreate(name: string, date?: ISODate): Promise<void> {
    const pop = this.milestoneCreatePopover()
    await this.milestoneNameInput(pop).fill(name)
    if (date) await fillDate(pop, th.milestones.fields.date, date)
    const created = waitForServerAction(this.page)
    await this.milestoneNameInput(pop).press('Enter')
    await created
    await expect(pop).toHaveCount(0)
  }
  /** Click an empty ◆-row cell → name (+ date via the DateField) → Enter. */
  async createMilestoneAt(key: PeriodKey, name: string, date?: ISODate): Promise<void> {
    await this.openCreateAt(key)
    await this.submitCreate(name, date)
  }
  /** Focus the ◆ + Enter (keyboard path, §8.9) → the details popover. */
  async openDiamond(name: string): Promise<Locator> {
    const d = this.diamond(name)
    await d.scrollIntoViewIfNeeded()
    await d.focus()
    await expect(d).toBeFocused()
    await this.page.keyboard.press('Enter')
    const pop = this.milestonePopover()
    await expect(pop).toBeVisible()
    return pop
  }
  async closePopover(): Promise<void> {
    await this.page.keyboard.press('Escape')
    await expect(this.milestonePopover()).toHaveCount(0)
  }
  /**
   * Pointer drag of ◆ `name` onto the column `toKey`: down on the ◆ centre → 8-step move to the target cell centre → up.
   * `expectMove` (default): waits for the drop target highlight before releasing and for the move action after it.
   * `expectMove: false` (members): no waits — callers assert that nothing moved and no action was sent.
   */
  async dragDiamond(name: string, toKey: PeriodKey, o: { expectMove?: boolean } = {}): Promise<void> {
    const expectMove = o.expectMove ?? true
    const d = this.diamond(name)
    const target = await this.revealMilestoneCell(toKey)
    // Raw mouse events have no actionability check: scrollIntoViewIfNeeded can leave the ◆ under the sticky
    // frozen/รวม columns (day zoom), so centre it in the scroller (the target is a few columns away) before measuring.
    await d.evaluate(async (el) => {
      el.scrollIntoView({ block: 'nearest', inline: 'center' })
      await new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())))
    })
    await expect(target).toBeAttached()
    const a = await d.boundingBox()
    const b = await target.boundingBox()
    if (!a || !b) throw new Error(`dragDiamond(${name}, ${toKey}): no box`)
    const from = { x: a.x + a.width / 2, y: a.y + a.height / 2 }
    const to = { x: b.x + b.width / 2, y: b.y + b.height / 2 }
    await this.page.mouse.move(from.x, from.y)
    await this.page.mouse.down()
    await this.page.mouse.move(to.x, to.y, { steps: 8 })
    if (!expectMove) {
      await expect(this.milestoneRow().getByTestId('ms-ghost')).toHaveCount(0)
      await this.page.mouse.up()
      return
    }
    await expect(target).toHaveAttribute('data-drop', 'true')
    const moved = waitForServerAction(this.page)
    await this.page.mouse.up()
    await moved
    await expect(this.milestoneRow().getByTestId('ms-ghost')).toHaveCount(0)
  }

  /** The row header of `rowKey` ('t:…' | 'a:…'). */
  rowHeaderByKey(rowKey: string): Locator {
    return this.root().locator(`[role="rowheader"][data-row-key="${cssString(rowKey)}"]`)
  }
  /** "→◆<name>" in the task column of a task / merged / sum row. */
  taskMilestoneLink(rowKey: string): Locator {
    return this.rowHeaderByKey(rowKey).locator('[data-ms-link]')
  }
  /** The ⚠ "เลย milestone" chip of a row (its text is th.milestones.late). */
  taskLate(rowKey: string): Locator {
    return this.rowHeaderByKey(rowKey).locator('[data-ms-late]')
  }

  // ── save state ────────────────────────────────────────────────────────────────────────────────────────────
  /** ★ Every queued edit has been saved. */
  async waitSaved(): Promise<void> {
    await expect(this.root()).toHaveAttribute('data-save-state', 'idle', { timeout: 10_000 })
  }

  toast(text: string): Locator {
    return toastWith(this.page, text)
  }

  /** Server-action requests (header `next-action`) issued while `fn` runs. */
  async countServerActions(fn: () => Promise<void>): Promise<number> {
    let n = 0
    const onRequest = (r: { method(): string; headers(): Record<string, string> }) => {
      if (r.method() === 'POST' && r.headers()['next-action']) n++
    }
    this.page.on('request', onRequest)
    try {
      await fn()
    } finally {
      this.page.off('request', onRequest)
    }
    return n
  }
}
