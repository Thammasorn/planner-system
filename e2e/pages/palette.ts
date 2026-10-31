import type { Locator, Page } from '@playwright/test'
import { th } from '../../src/i18n/th'
import { escapeRegExp } from './text'

/**
 * Command palette (Cmd/Ctrl+K, cmdk 1.1 in an MUI Dialog) — plan/m04 S4.8, FR-1102, X08/X88, M4-D37d.
 * Options are always selected by name inside a group; there is no index-based choose() and no whole-dialog option
 * count, because M8 ("คำสั่ง") and M10 (categories, commands) add groups to the same dialog. M10 extends this file.
 */
export class Palette {
  constructor(readonly page: Page) {}

  async openByKeyboard(): Promise<void> {
    await this.page.keyboard.press('ControlOrMeta+KeyK')
  }
  /** Sidebar "🔍 ค้นหา… ⌘K" (the shortcut hint may be part of the accessible name). */
  searchButton(): Locator {
    return this.page.getByRole('button', { name: new RegExp(`^${escapeRegExp(th.palette.open)}`) })
  }
  async openByButton(): Promise<void> {
    await this.searchButton().first().click()
  }
  dialog(): Locator {
    return this.page.getByRole('dialog', { name: th.palette.dialogLabel })
  }
  input(): Locator {
    return this.dialog().getByRole('combobox')
  }
  async search(text: string): Promise<void> {
    await this.input().fill(text)
  }
  /**
   * A cmdk group by its heading. cmdk 1.1 renders `[cmdk-group-items] role="group"` labelled by the heading; when the
   * accessible name does not resolve, the `[cmdk-group]` wrapper filtered by its heading is the documented fallback.
   */
  group(heading: string): Locator {
    return this.dialog()
      .getByRole('group', { name: heading, exact: true })
      .or(
        this.dialog()
          .locator('[cmdk-group]')
          .filter({ has: this.page.locator('[cmdk-group-heading]', { hasText: heading }) }),
      )
      .first()
  }
  pageResults(): Locator {
    return this.group(th.palette.groups.pages).getByRole('option')
  }
  option(name: string | RegExp): Locator {
    return this.dialog().getByRole('option', { name })
  }
  hint(): Locator {
    return this.dialog().getByText(th.palette.hint, { exact: true })
  }
}
