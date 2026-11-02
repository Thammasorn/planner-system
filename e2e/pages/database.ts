import type { Locator, Page } from '@playwright/test'
import { th } from '../../src/i18n/th'
import { escapeRegExp } from './text'

const T = th.database

/**
 * A database block (plan/m11 S7.1, M11-D2 test ids): `db-block` (data-database-id, data-state on placeholders),
 * `db-title`, `db-table` (role grid, rows `[data-row-id]`, cells `[data-cell="r:c"]`), `db-kanban` / `db-card`,
 * `db-calendar`, the view tabs (role tablist) and the footer count.
 */
export class DatabaseBlock {
  constructor(
    readonly page: Page,
    readonly root: Locator,
  ) {}

  static first(page: Page): DatabaseBlock {
    return new DatabaseBlock(page, page.locator('[data-testid="db-block"][data-database-id]').first())
  }
  static byId(page: Page, id: string): DatabaseBlock {
    return new DatabaseBlock(page, page.locator(`[data-testid="db-block"][data-database-id="${id}"]`))
  }

  async id(): Promise<string> {
    const v = await this.root.getAttribute('data-database-id')
    if (!v) throw new Error('database block without id')
    return v
  }
  title(): Locator {
    return this.root.getByTestId('db-title')
  }
  tabs(): Locator {
    return this.root.getByRole('tablist', { name: T.views.tabsLabel })
  }
  tab(name: string): Locator {
    return this.tabs().getByRole('tab', { name, exact: true })
  }
  async addView(type: 'TABLE' | 'KANBAN' | 'CALENDAR'): Promise<void> {
    await this.root.getByRole('button', { name: T.views.add, exact: true }).click()
    await this.page.getByRole('menuitem', { name: T.views[type], exact: true }).click()
  }
  table(): Locator {
    return this.root.getByTestId('db-table')
  }
  rows(): Locator {
    return this.table().locator('[role="row"][data-row-id]')
  }
  row(title: string): Locator {
    return this.rows().filter({
      has: this.page.locator('[data-type="TITLE"]', { hasText: new RegExp(`^${escapeRegExp(title)}`) }),
    })
  }
  async rowTitles(): Promise<string[]> {
    return (await this.rows().locator('[data-type="TITLE"]').allInnerTexts()).map((s) => s.split('\n')[0]!.trim())
  }
  async columnHeaders(): Promise<string[]> {
    return (await this.table().getByRole('columnheader').allInnerTexts()).map((s) => s.trim())
  }
  /** Column index (0-based in `data-cell`) of a header by name. */
  async columnIndex(name: string): Promise<number> {
    const names = (await this.table().getByRole('columnheader').allInnerTexts()).map((s) => s.trim())
    const i = names.findIndex((n) => n.startsWith(name))
    if (i < 0) throw new Error(`column ${name} not in ${names.join(' | ')}`)
    return i
  }
  async cell(rowTitle: string, column: string): Promise<Locator> {
    const c = await this.columnIndex(column)
    return this.row(rowTitle).locator(`[role="gridcell"][aria-colindex="${c + 1}"]`)
  }
  /** The open in-cell editor's focused field (after "+ แถวใหม่" / Enter the new row's title is edited). */
  focusedEditor(): Locator {
    return this.table().locator('input:focus, textarea:focus')
  }
  newRowButton(): Locator {
    return this.root.getByRole('gridcell', { name: T.table.newRow, exact: true })
  }
  footer(): Locator {
    return this.table().locator('[aria-live="polite"]')
  }
  columnMenuButton(name: string): Locator {
    return this.root.getByRole('button', { name: T.columnMenu.label(name), exact: true })
  }
  kanban(): Locator {
    return this.root.getByTestId('db-kanban')
  }
  kanbanGroup(name: string): Locator {
    return this.kanban().getByRole('region', { name: new RegExp(`^${escapeRegExp(name)} \\d+ รายการ$`) })
  }
  card(title: string): Locator {
    return this.root.getByTestId('db-card').filter({ hasText: title })
  }
  calendar(): Locator {
    return this.root.getByTestId('db-calendar')
  }
}

/** The side panel `?db=&row=` (M11-D26). */
export function rowPanel(page: Page): Locator {
  return page.getByTestId('db-row-panel')
}
