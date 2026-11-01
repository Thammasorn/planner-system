import { expect, type Locator, type Page } from '@playwright/test'
import type { ISODate, LoadView, PeriodKey } from '../../src/domain/types'
import { diffDays } from '../../src/domain/dates'
import { th } from '../../src/i18n/th'
import { formatWeekHeader } from '../../src/lib/format'
import { DAY_W, timelineStart, WEEK_TOTAL_W, WEEK_W } from '../../src/lib/grid/columns'
import { E2E } from '../env'
import { ShellPage } from './shell'
import { SidebarPage } from './sidebar'
import { toastWith } from './toast'

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
    return this.root().getByRole('rowheader').filter({ hasText: th.grid.footer.load(names) })
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
      this.root().evaluate((el, l) => {
        el.scrollLeft = l
      }, Math.max(0, left))
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
      target.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }))
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
    if (level === 'day') await expect(this.root().locator('[role="columnheader"][data-col-key^="D:"]').first()).toBeAttached()
    await this.waitSaved()
  }
  /** The expand toggle of a collapsed week header (plain click expands, view only). */
  weekHeader(week: ISODate): Locator {
    return this.root().getByRole('button', { name: th.grid.day.expandWeek(formatWeekHeader(week)), exact: true })
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
