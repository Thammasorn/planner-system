import { expect, type Locator, type Page } from '@playwright/test'
import { th } from '../../src/i18n/th'
import { escapeRegExp } from './text'

/**
 * BlockNote editor on `/p/<id>` (plan/m04-pages-editor.md S4.8, r3 §14.2 selectors). DOM contract requested from S2:
 * the editor root is `data-testid="page-editor"` with `data-editable="true|false"`; the save status is a
 * `role="status"` element inside it carrying `data-save-state` (idle · saving · saved · error, M4-D26) and `data-dirty`; the lease
 * banner is `data-testid="lease-banner"`; sub-page cards are `data-testid="subpage-card"`. BlockNote's own class
 * names (`.bn-editor`, `.bn-suggestion-menu`, `.bn-table-handle`, …) are verified for 0.55 in r3.
 */
export class EditorPage {
  constructor(readonly page: Page) {}

  root(): Locator {
    return this.page.getByTestId('page-editor')
  }
  content(): Locator {
    return this.page.locator('.bn-editor')
  }
  async isEditable(): Promise<boolean> {
    return (await this.root().getAttribute('data-editable')) === 'true'
  }
  async expectEditable(): Promise<void> {
    await expect(this.root()).toHaveAttribute('data-editable', 'true')
    await expect(this.content()).toHaveAttribute('contenteditable', 'true')
  }
  async expectReadOnly(): Promise<void> {
    await expect(this.root()).toHaveAttribute('data-editable', 'false')
    await expect(this.content()).toHaveAttribute('contenteditable', 'false')
  }
  /** Waits until the editor chunk mounted (the dynamic import replaced the skeleton). */
  async waitReady(): Promise<void> {
    await expect(this.content()).toBeVisible()
  }

  blocks(): Locator {
    return this.content().locator('.bn-block-outer')
  }
  /**
   * Clicks the last block and moves the caret to its end. When the last block has no inline content (file, image,
   * divider, sub-page card) it clicks BlockNote's trailing-block widget instead, which appends an empty paragraph
   * and puts the caret there; returns true in that case.
   */
  async focusEnd(): Promise<boolean> {
    await this.waitReady()
    const inline = this.blocks().last().locator('.bn-inline-content')
    if ((await inline.count()) === 0) {
      await this.appendBlock()
      return true
    }
    await inline.last().click()
    await this.page.keyboard.press('End')
    return false
  }
  /** Caret at the end, Enter → a fresh empty paragraph (the trailing-block widget already made one). */
  async newBlock(): Promise<void> {
    if (await this.focusEnd()) return
    await this.page.keyboard.press('Enter')
  }
  async type(text: string): Promise<void> {
    await this.page.keyboard.type(text)
  }
  /**
   * Selects the last occurrence of `text` inside the editor through a DOM Range (ProseMirror follows
   * `selectionchange`). Keyboard selection is unreliable here: Shift+Home inside nested blocks can extend to the
   * start of the document, and the first Shift+ArrowLeft after typing may be swallowed.
   */
  async selectText(text: string): Promise<void> {
    await this.content().evaluate((root, word) => {
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
      let hit: { node: Node; at: number } | null = null
      for (let n = walker.nextNode(); n; n = walker.nextNode()) {
        const at = n.textContent?.lastIndexOf(word) ?? -1
        if (at >= 0) hit = { node: n, at }
      }
      if (!hit) throw new Error(`selectText: "${word}" not found`)
      const range = document.createRange()
      range.setStart(hit.node, hit.at)
      range.setEnd(hit.node, hit.at + word.length)
      const sel = window.getSelection()
      sel?.removeAllRanges()
      sel?.addRange(range)
    }, text)
  }
  /** Clicks BlockNote's trailing-block widget: a new empty paragraph after the last top-level block, caret in it. */
  async appendBlock(): Promise<void> {
    const before = await this.blocks().count()
    await this.content().locator('.bn-trailing-block').click()
    await expect(this.blocks()).toHaveCount(before + 1)
  }

  // --- slash menu (FR-520) ----------------------------------------------------------------------------------
  suggestionMenu(): Locator {
    return this.page.locator('.bn-suggestion-menu')
  }
  async slash(query: string): Promise<void> {
    await this.page.keyboard.type(`/${query}`)
    await expect(this.suggestionMenu()).toBeVisible()
  }
  slashItems(): Locator {
    return this.suggestionMenu().locator('.bn-mt-suggestion-menu-item-title')
  }
  async slashTitles(): Promise<string[]> {
    return (await this.slashItems().allTextContents()).map((s) => s.trim())
  }
  async pickSlash(title: string): Promise<void> {
    await this.slashItems()
      .filter({ hasText: new RegExp(`^\\s*${escapeRegExp(title)}\\s*$`) })
      .first()
      .click()
    await expect(this.suggestionMenu()).toHaveCount(0)
  }

  // --- tables (FR-523) --------------------------------------------------------------------------------------
  tables(): Locator {
    return this.content().locator('table')
  }
  async tableShape(i: number): Promise<{ rows: number; cols: number }> {
    const table = this.tables().nth(i)
    const rows = await table.locator('tr').count()
    const cols = await table.locator('tr').first().locator('td, th').count()
    return { rows, cols }
  }
  async cellTexts(i: number): Promise<string[][]> {
    return this.tables()
      .nth(i)
      .locator('tr')
      .evaluateAll((trs) =>
        trs.map((tr) => Array.from(tr.querySelectorAll('td, th')).map((c) => (c.textContent ?? '').trim())),
      )
  }
  /** BlockNote 0.55 renders the row handle and the column handle; only the column handle is rotated a quarter turn. */
  columnHandle(): Locator {
    return this.page.locator('.bn-table-handle[style*="rotate"]')
  }
  rowHandle(): Locator {
    return this.page.locator('.bn-table-handle:not([style*="rotate"])')
  }
  /** Hover a first-row cell → the column handle → "เพิ่มคอลัมน์ทางขวา". */
  async addColumnRight(i: number): Promise<void> {
    await this.tables().nth(i).locator('tr').first().locator('td, th').last().hover()
    await this.columnHandle().click()
    await this.page.getByText(th.editor.blocknote.table_handle.add_right_menuitem, { exact: true }).click()
  }
  /** Hover a first-column cell → the row handle → "แถวหัวตาราง". */
  async toggleHeaderRow(i: number): Promise<void> {
    await this.tables().nth(i).locator('tr').first().locator('td, th').first().hover()
    await this.rowHandle().click()
    await this.page.getByText(th.editor.blocknote.drag_handle.header_row_menuitem, { exact: true }).click()
  }

  // --- media, cards, mentions -------------------------------------------------------------------------------
  images(): Locator {
    return this.content().locator('img')
  }
  attachments(): Locator {
    return this.content().locator('[data-content-type="file"]')
  }
  subpageCards(): Locator {
    return this.root().getByTestId('subpage-card')
  }
  /** The card is itself the `<a>` (plan §5.S2); it has the link role only while the page is visible (href set). */
  subpageLink(i: number): Locator {
    return this.subpageCards().nth(i).and(this.page.getByRole('link'))
  }
  mentionChips(): Locator {
    return this.content().locator('.mention')
  }
  /** The mention / slash suggestion popup group label (`.bn-suggestion-menu-label`). */
  suggestionGroup(label: string): Locator {
    return this.suggestionMenu().locator('.bn-suggestion-menu-label', { hasText: label })
  }
  sideMenuDragHandle(): Locator {
    return this.page.getByRole('button', { name: th.editor.blocknote.side_menu.drag_handle_label })
  }
  formattingToolbar(): Locator {
    return this.page.locator('.bn-formatting-toolbar')
  }

  // --- save status (FR-531, M4-D26) -------------------------------------------------------------------------
  saveState(): Locator {
    return this.root().getByRole('status')
  }
  /**
   * The save that follows the LAST edit is done: "saved" alone is not enough, because the status stays "saved"
   * while a newer edit waits out its 800 ms debounce; `data-dirty="false"` is set only once a save leaves the
   * editor clean (useAutosave `pending`, M4-D26).
   */
  async waitSaved(): Promise<void> {
    // One selector, so both attributes are read in the same DOM snapshot.
    await expect(this.root().locator('[data-save-state="saved"][data-dirty="false"]')).toHaveCount(1)
  }

  // --- lease (FR-540–542) and conflict (FR-543) -------------------------------------------------------------
  leaseBanner(): Locator {
    return this.page.getByTestId('lease-banner')
  }
  takeoverButton(): Locator {
    return this.page.getByRole('button', { name: th.editor.lease.takeover, exact: true })
  }
  async takeover(): Promise<void> {
    await this.takeoverButton().click()
  }
  /** "Tab visible again" → the lease hook POSTs at once (FR-541) — e2e never waits for the 30 s heartbeat (M4-D35). */
  async pokeLease(): Promise<void> {
    await this.page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')))
  }
  conflictBanner(): Locator {
    return this.page.getByText(th.editor.conflict.banner, { exact: true })
  }
  async reloadAfterConflict(): Promise<void> {
    await this.page.getByRole('button', { name: th.editor.conflict.reload, exact: true }).click()
  }
}
