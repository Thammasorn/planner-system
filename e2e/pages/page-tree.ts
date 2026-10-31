import { expect, type Locator, type Page } from '@playwright/test'
import { th } from '../../src/i18n/th'
import { escapeRegExp } from './text'

/**
 * A page tree (sidebar Wiki ทีม, a project's tree in the sidebar, or the project เอกสาร tab) — plan/m04 S4.8, FR-503.
 * DOM contract requested from S3 (PageTree.tsx): `role="tree"` named `label` (th.pages.tree.wikiLabel /
 * projectLabel(name)); rows `role="treeitem"` with `aria-level` (1-based) and `aria-expanded` when they have children;
 * per row the buttons th.pages.tree.expand/collapse(title), th.pages.addChild(title), th.pages.menu(title) and the drag
 * handle th.pages.tree.dragHandle; protected rows carry an `img` named th.pages.protectedIcon (never colour only).
 */
export class PageTreePanel {
  constructor(
    readonly page: Page,
    readonly label: string,
    /** Where the tree lives (sidebar nav or the project tab's main); default the whole page. */
    readonly scope: Locator = page.locator('body'),
  ) {}

  tree(): Locator {
    return this.scope.getByRole('tree', { name: this.label, exact: true })
  }
  items(): Locator {
    return this.tree().getByRole('treeitem')
  }
  /** The row whose accessible name contains `title` (rows may prefix an icon). */
  item(title: string): Locator {
    return this.tree()
      .getByRole('treeitem', { name: new RegExp(escapeRegExp(title)) })
      .first()
  }
  /** The row's own link (page title) — never a descendant's. */
  link(title: string): Locator {
    return this.item(title)
      .getByRole('link', { name: new RegExp(escapeRegExp(title)) })
      .first()
  }
  async open(title: string): Promise<void> {
    await this.link(title).click()
  }
  async level(title: string): Promise<number> {
    return Number(await this.item(title).getAttribute('aria-level'))
  }
  expandButton(title: string): Locator {
    return this.tree().getByRole('button', { name: th.pages.tree.expand(title), exact: true })
  }
  collapseButton(title: string): Locator {
    return this.tree().getByRole('button', { name: th.pages.tree.collapse(title), exact: true })
  }
  /**
   * Expands the row (no-op when already expanded). Retried as a whole: right after a move/restore the row may still
   * be refetching and then come back already expanded (remembered in user_preferences), so a one-shot check races.
   */
  async expand(title: string): Promise<void> {
    await expect(async () => {
      if ((await this.collapseButton(title).count()) === 0) await this.expandButton(title).click({ timeout: 1_000 })
      await expect(this.collapseButton(title)).toBeVisible({ timeout: 1_000 })
    }).toPass()
  }
  async toggle(title: string): Promise<void> {
    if ((await this.collapseButton(title).count()) > 0) await this.collapseButton(title).click()
    else await this.expandButton(title).click()
  }
  addChildButton(title: string): Locator {
    return this.tree().getByRole('button', { name: th.pages.addChild(title), exact: true })
  }
  async addChild(title: string): Promise<void> {
    await this.item(title).hover()
    await this.addChildButton(title).click()
  }
  menuButton(title: string): Locator {
    return this.tree().getByRole('button', { name: th.pages.menu(title), exact: true })
  }
  async openMenu(title: string): Promise<void> {
    await this.item(title).hover()
    await this.menuButton(title).click()
    await expect(this.page.getByRole('menu')).toBeVisible()
  }
  menuItem(label: string): Locator {
    return this.page.getByRole('menu').getByRole('menuitem', { name: label, exact: true })
  }
  lockIcon(title: string): Locator {
    return this.item(title).getByRole('img', { name: th.pages.protectedIcon, exact: true }).first()
  }
  dragHandle(title: string): Locator {
    return this.item(title).getByRole('button', { name: th.pages.tree.dragHandle, exact: true }).first()
  }
  /**
   * Drags `title`'s handle onto `targetTitle` (as M3's dragRow: mouse down → move in 5 steps → up). `dx` > 0 shifts
   * right to nest under the target (dnd-kit projection), 0 drops before it at the same level.
   */
  async dragOnto(title: string, targetTitle: string, dx = 0): Promise<void> {
    const handle = this.dragHandle(title)
    await this.item(title).hover()
    const from = await handle.boundingBox()
    const to = await this.item(targetTitle).boundingBox()
    if (!from || !to) throw new Error(`dragOnto(${title} → ${targetTitle}): row not visible`)
    await this.page.mouse.move(from.x + from.width / 2, from.y + from.height / 2)
    await this.page.mouse.down()
    await this.page.mouse.move(from.x + from.width / 2, from.y + from.height / 2 + 4, { steps: 2 })
    await this.page.mouse.move(from.x + from.width / 2 + dx, to.y + to.height / 4, { steps: 5 })
    await this.page.mouse.up()
  }
  /**
   * Drags the row in place, `dx` px to the right: one indent level (TREE_INDENT 24) nests it under the row directly
   * above it (M3 SortableTree projection — dropping onto another row places the item before that row).
   */
  async indent(title: string, dx = 24): Promise<void> {
    const handle = this.dragHandle(title)
    await this.item(title).hover()
    const from = await handle.boundingBox()
    if (!from) throw new Error(`indent(${title}): row not visible`)
    const x = from.x + from.width / 2
    const y = from.y + from.height / 2
    await this.page.mouse.move(x, y)
    await this.page.mouse.down()
    await this.page.mouse.move(x + 6, y, { steps: 3 }) // past the 4 px activation distance
    await this.page.mouse.move(x + dx + 6, y, { steps: 5 })
    await this.page.mouse.move(x + dx + 6, y, { steps: 2 }) // one more event so dnd-kit recomputes the projection
    await this.page.mouse.up()
  }
  /** Visible rows in order: the row's own link text (icon included) and its aria-level. */
  async rows(): Promise<{ text: string; level: number }[]> {
    return this.items().evaluateAll((els) =>
      els.map((e) => ({
        text: (e.querySelector('a')?.textContent ?? '').trim(),
        level: Number(e.getAttribute('aria-level')),
      })),
    )
  }
  /** Visible row texts in order (a row's text may start with its icon — match with endsWith). */
  async titles(): Promise<string[]> {
    return (await this.rows()).map((r) => r.text)
  }
}
