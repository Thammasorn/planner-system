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
  /** M6.1 (FR-690, X88): the งาน group's options (before หน้าเอกสาร). */
  taskResults(): Locator {
    return this.group(th.palette.groups.tasks).getByRole('option')
  }
  /** A task hit by its name (the option's name also carries the project and the chips). */
  taskResult(name: string): Locator {
    return this.taskResults().filter({ hasText: name })
  }
  option(name: string | RegExp): Locator {
    return this.dialog().getByRole('option', { name })
  }
  /** M8 (X88, M8-D18): the options of the "คำสั่ง" group (never asserted by count or absence — M10 appends). */
  commands(): Locator {
    return this.group(th.milestones.palette.group).getByRole('option')
  }
  /** Runs a command by its label (by name, never by index — M4-D37d). */
  async runCommand(label: string): Promise<void> {
    await this.option(label).click()
  }
  hint(): Locator {
    return this.dialog().getByText(th.palette.hint, { exact: true })
  }

  // ── M10 (plan/m10 S4.3; FR-1102/1103, NFR-06) — only additions; every group lookup goes through group() ──
  /** Replaces the query (M10 name for search()). */
  async typeQuery(q: string): Promise<void> {
    await this.input().fill(q)
  }
  /** The options of one result category (FR-1102 order: projects, tasks, pages, people, clients). */
  results(category: keyof typeof th.palette.groups): Locator {
    return this.group(th.palette.groups[category]).getByRole('option')
  }
  /** Backspace on the empty input leaves a command step (palette.back, KEY-06). */
  async back(): Promise<void> {
    await this.input().fill('')
    await this.input().press('Backspace')
  }
  /**
   * NFR-06 (M10-D30): milliseconds from dispatching `q` into the (open, empty) palette input to the first result option
   * (an option whose `data-value` does not start with `cmd:`) being attached — measured inside the page with a
   * MutationObserver, so Playwright's own latency is not counted. The clock is native `Event.timeStamp`, because the
   * fixture's `page.clock` replaces `Date` / `performance.now()` with a fixed fake time.
   */
  async measureFirstResult(q: string): Promise<number> {
    await this.input().fill('')
    return this.dialog().evaluate(async (dialog, query) => {
      const input = dialog.querySelector<HTMLInputElement>('[cmdk-input], input[role="combobox"]')
      if (!input) throw new Error('measureFirstResult: no palette input')
      const isResult = (): boolean =>
        [...dialog.querySelectorAll('[role="option"]')].some(
          (o) => !(o.getAttribute('data-value') ?? '').startsWith('cmd:') && o.isConnected,
        )
      return new Promise<number>((resolve, reject) => {
        const now = (): number => new Event('t').timeStamp // native high-resolution clock
        let start = 0
        const observer = new MutationObserver(() => {
          if (isResult()) {
            observer.disconnect()
            resolve(now() - start)
          }
        })
        observer.observe(dialog, { childList: true, subtree: true, attributes: true })
        setTimeout(() => {
          observer.disconnect()
          reject(new Error(`measureFirstResult(${query}): no result within 5 s`))
        }, 5_000)
        const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
        const event = new Event('input', { bubbles: true })
        start = event.timeStamp
        setValue?.call(input, query)
        input.dispatchEvent(event)
      })
    }, q)
  }
}
