import { expect, type Locator, type Page, type Response } from '@playwright/test'
import type { ISODate, LoadView } from '../../src/domain/types'
import { th } from '../../src/i18n/th'
import { formatThaiDate, formatWeekHeader } from '../../src/lib/format'
import { ShellPage } from './shell'
import { SidebarPage } from './sidebar'

/**
 * `/workload` Workload ทีม (plan/m09 S6.1; SPEC §8.5, FR-1001…1007). DOM contract (S4):
 * - toolbar `role=toolbar` th.workload.filters.label: view ToggleButtonGroup (th.workload.view.label), MUI selects
 *   (comboboxes) ตำแหน่ง / โปรเจค, checkbox เฉพาะคนที่ล้น, ล้างตัวกรอง, ◀ (th.workload.window.prev) / สัปดาห์นี้ / ▶;
 * - tabs (tablist th.workload.tabs.label): ตาราง · รายการที่ล้น (n);
 * - table `data-testid="workload-table"` (aria-label th.workload.tableLabel): `thead th[data-week]` week headers,
 *   one `tbody` per position with a `th[scope=rowgroup]` group header, person rows `tr[data-user-id]` whose
 *   `th[scope=row]` holds the name link (→ /people/<id>/plan); cells are `<button data-wl-cell data-week data-tone
 *   data-palette data-level>` with the visible "load/cap" text in their first aria-hidden span and the 🔴/⚠ glyph
 *   as `[data-glyph]` + visually hidden status text;
 * - one shared tooltip `data-testid="workload-tooltip"`; the cell panel is named th.workload.panel.title(name,
 *   formatWeekHeader(week)): from md up a side `aside` (role complementary) beside the table, below md a modal sheet
 *   (role dialog, aria-modal) over it;
 * - overload list = table named th.workload.list.label, rows `tr[data-user-id][data-week]`, fix link named
 *   th.workload.list.fixLabel(name, formatThaiDate(week, 'medium')).
 */
export class WorkloadPage {
  readonly shell: ShellPage
  readonly sidebar: SidebarPage

  constructor(readonly page: Page) {
    this.shell = new ShellPage(page)
    this.sidebar = new SidebarPage(page)
  }

  // ── navigation ────────────────────────────────────────────────────────────────────────────────────────────
  /** Sidebar "Workload ทีม" (client-side navigation, so caches survive — FR-405 / X31 checks rely on that). */
  async goto(): Promise<void> {
    if (!(await this.sidebar.workloadLink().isVisible())) await this.shell.goto('/home')
    await this.sidebar.workloadLink().click()
    await this.page.waitForURL((u) => u.pathname === '/workload')
    await this.waitReady()
  }

  /** Direct URL (optionally with the filter / window query). */
  async open(search = ''): Promise<void> {
    await this.shell.goto(`/workload${search}`)
    await this.waitReady()
  }

  async waitReady(): Promise<void> {
    await expect(this.table().or(this.emptyState())).toBeVisible()
    await this.shell.waitForHydration()
  }

  /** Resolves with the next GET /api/workload (the table payload — not /cell or /badge). Start it before the action. */
  tableResponse(): Promise<Response> {
    return this.page.waitForResponse((r) => new URL(r.url()).pathname === '/api/workload')
  }

  // ── table ─────────────────────────────────────────────────────────────────────────────────────────────────
  table(): Locator {
    return this.page.getByTestId('workload-table')
  }
  emptyState(): Locator {
    return this.shell.main().getByText(th.workload.empty, { exact: true })
  }
  /** Week header cells (`th[data-week]`) in column order. */
  weekHeaders(): Locator {
    return this.table().locator('thead th[data-week]')
  }
  async weeks(): Promise<string[]> {
    return this.weekHeaders().evaluateAll((els) => els.map((e) => e.getAttribute('data-week') ?? ''))
  }
  groupHeaders(): Locator {
    return this.table().locator('th[scope="rowgroup"]')
  }
  /** Person name links in table order. */
  personLinks(): Locator {
    return this.table().locator('tr[data-user-id] th[scope="row"] a')
  }
  async personNames(): Promise<string[]> {
    return this.personLinks().allTextContents()
  }
  row(personName: string): Locator {
    return this.table()
      .locator('tr[data-user-id]')
      .filter({ has: this.page.getByRole('link', { name: personName, exact: true }) })
  }
  cell(personName: string, week: ISODate): Locator {
    return this.row(personName).locator(`[data-wl-cell][data-week="${week}"]`)
  }
  /** The visible "load/cap" text of a cell ("5/4", "–"), without the glyph. */
  cellText(cell: Locator): Locator {
    return cell.locator(':scope > span[aria-hidden="true"]:not([data-glyph])')
  }
  glyph(cell: Locator): Locator {
    return cell.locator('[data-glyph]')
  }

  // ── toolbar ───────────────────────────────────────────────────────────────────────────────────────────────
  toolbar(): Locator {
    return this.page.getByRole('toolbar', { name: th.workload.filters.label })
  }
  viewButton(v: LoadView): Locator {
    return this.page
      .getByRole('group', { name: th.workload.view.label })
      .getByRole('button', { name: th.workload.view[v], exact: true })
  }
  /** Switches the load view (saved as the `load.view` preference; never refetches the table — M9-D2). */
  async setView(v: LoadView): Promise<void> {
    const button = this.viewButton(v)
    if ((await button.getAttribute('aria-pressed')) === 'true') return
    await button.click()
    await expect(button).toHaveAttribute('aria-pressed', 'true')
  }
  positionFilter(): Locator {
    return this.toolbar().getByRole('combobox', { name: th.workload.filters.position })
  }
  projectFilter(): Locator {
    return this.toolbar().getByRole('combobox', { name: th.workload.filters.project })
  }
  private async choose(select: Locator, option: string): Promise<void> {
    await select.click()
    await this.page.getByRole('listbox').getByRole('option', { name: option, exact: true }).click()
    await expect(select).toHaveText(option)
  }
  async filterPosition(name: string): Promise<void> {
    await this.choose(this.positionFilter(), name)
  }
  async filterProject(name: string): Promise<void> {
    await this.choose(this.projectFilter(), name)
  }
  onlyOverCheckbox(): Locator {
    return this.toolbar().getByRole('checkbox', { name: th.workload.filters.onlyOver, exact: true })
  }
  async onlyOver(on: boolean): Promise<void> {
    if (on) await this.onlyOverCheckbox().check()
    else await this.onlyOverCheckbox().uncheck()
  }
  clearButton(): Locator {
    return this.toolbar().getByRole('button', { name: th.workload.filters.clear, exact: true })
  }
  async clearFilters(): Promise<void> {
    await this.clearButton().click()
    await expect(this.clearButton()).toBeDisabled()
  }
  async next(): Promise<void> {
    await this.toolbar().getByRole('button', { name: th.workload.window.next, exact: true }).click()
  }
  async prev(): Promise<void> {
    await this.toolbar().getByRole('button', { name: th.workload.window.prev, exact: true }).click()
  }
  async thisWeek(): Promise<void> {
    await this.toolbar().getByRole('button', { name: th.workload.window.thisWeek, exact: true }).click()
  }

  // ── tabs + overload list ──────────────────────────────────────────────────────────────────────────────────
  tablist(): Locator {
    return this.page.getByRole('tablist', { name: th.workload.tabs.label })
  }
  overloadsTab(n: number): Locator {
    return this.tablist().getByRole('tab', { name: th.workload.tabs.overloads(n), exact: true })
  }
  async openOverloadsTab(): Promise<void> {
    await this.tablist().getByRole('tab').filter({ hasText: th.workload.list.label }).click()
    await expect(this.overloadList().or(this.shell.main().getByText(th.workload.list.empty))).toBeVisible()
  }
  overloadList(): Locator {
    return this.page.getByRole('table', { name: th.workload.list.label })
  }
  overloadRows(): Locator {
    return this.overloadList().locator('tbody tr')
  }
  fixLink(personName: string, week: ISODate): Locator {
    return this.overloadList().getByRole('link', {
      name: th.workload.list.fixLabel(personName, formatThaiDate(week, 'medium')),
      exact: true,
    })
  }

  // ── tooltip + panel ───────────────────────────────────────────────────────────────────────────────────────
  tooltip(): Locator {
    return this.page.getByTestId('workload-tooltip')
  }
  /** Hovers the cell and returns the shared tooltip once it shows. */
  async hover(personName: string, week: ISODate): Promise<Locator> {
    await this.cell(personName, week).hover()
    await expect(this.tooltip()).toBeVisible()
    return this.tooltip()
  }
  /**
   * The panel of one cell named th.workload.panel.title(name, d/m): the side `aside` (role complementary) from md up,
   * or the modal sheet (role dialog) below md — either role matches, so the same locator works at any viewport.
   */
  panel(personName: string, week: ISODate): Locator {
    const name = th.workload.panel.title(personName, formatWeekHeader(week))
    return this.page
      .getByRole('complementary', { name, exact: true })
      .or(this.page.getByRole('dialog', { name, exact: true }))
  }
  /** The modal sheet form of the cell panel (below md). */
  panelSheet(personName: string, week: ISODate): Locator {
    return this.page.getByRole('dialog', {
      name: th.workload.panel.title(personName, formatWeekHeader(week)),
      exact: true,
    })
  }
  /** The task link of a panel item (named th.workload.panel.openTask(task)). */
  panelTaskLink(panel: Locator, taskName: string): Locator {
    return panel.getByRole('link', { name: th.workload.panel.openTask(taskName), exact: true })
  }

  // ── sidebar badge ─────────────────────────────────────────────────────────────────────────────────────────
  badge(): Locator {
    return this.sidebar.workloadBadge()
  }
}
