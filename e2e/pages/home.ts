import { expect, type Locator, type Page } from '@playwright/test'
import { th } from '../../src/i18n/th'
import { ShellPage } from './shell'
import { escapeRegExp } from './text'

/** A regex for a `th` function's output with every argument free (the parts between the arguments stay literal). */
export function templatePattern(fn: (...args: string[]) => string, arity: number, anchored = true): RegExp {
  const marks = Array.from({ length: arity }, (_, i) => `\u0000${i}\u0000`)
  const parts = fn(...marks).split(/\u0000\d\u0000/)
  const body = parts.map(escapeRegExp).join('(.+?)')
  return new RegExp(anchored ? `^${body}$` : body)
}

/**
 * `/home` dashboard (plan/m10 S4.3, FR-1101, §8.2). The header bar's <h1> is th.home.title (FR-1603, M6.1-D19), so
 * the greeting is found by its text. Cards are sections (or articles / regions) holding a heading with the card title;
 * the innermost such element is the card. Leave lines are a `dl` (dt = line label, dd = entries — M10-D16).
 */
export class HomePage {
  readonly shell: ShellPage

  constructor(readonly page: Page) {
    this.shell = new ShellPage(page)
  }

  async goto(): Promise<void> {
    await this.shell.goto('/home')
    await expect(this.card(th.home.myTasks.title)).toBeVisible()
  }

  /** The greeting line for `name` (M10-D19: by the Bangkok hour of serverNow()). */
  greeting(name: string, part: 'morning' | 'afternoon' | 'evening' = 'morning'): Locator {
    return this.page.getByText(th.home.greetingFor[part](name), { exact: true })
  }
  /** The `<h1>` of the screen — the header bar's last crumb (FR-1603). */
  heading(): Locator {
    return this.page.getByRole('heading', { level: 1 })
  }

  /** Every card, in DOM order. */
  cards(): Locator {
    return this.page
      .locator('main')
      .locator('section, article, [role="region"], [role="article"]')
      .filter({ has: this.page.getByRole('heading') })
  }
  /** The card whose heading is `title` (innermost container holding that heading). */
  card(title: string): Locator {
    return this.page
      .locator('main')
      .locator('section, article, [role="region"], [role="article"]')
      .filter({ has: this.page.getByRole('heading', { name: title, exact: true }) })
      .last()
  }

  // ── งานของฉันสัปดาห์นี้ (FR-1101a) ──
  myTasks(): Locator {
    return this.card(th.home.myTasks.title)
  }
  taskRow(name: string): Locator {
    return this.myTasks().getByRole('listitem').filter({ hasText: name })
  }
  checkbox(name: string): Locator {
    return this.myTasks().getByRole('checkbox', { name: th.home.myTasks.complete(name), exact: true })
  }
  async tick(name: string): Promise<void> {
    await this.checkbox(name).click()
  }

  // ── ภาระของฉัน 8 สัปดาห์ (FR-1101b) ──
  myLoad(): Locator {
    return this.card(th.home.myLoad.title)
  }
  /** The 8 bars, each `role="img"` named th.home.myLoad.barLabel(week, load, cap). */
  loadBars(): Locator {
    return this.myLoad().getByRole('img', { name: templatePattern(th.home.myLoad.barLabel, 3) })
  }
  loadBar(week: string, load: string, cap: string): Locator {
    return this.myLoad().getByRole('img', { name: th.home.myLoad.barLabel(week, load, cap), exact: true })
  }

  // ── Milestone 14 วันข้างหน้า (FR-1101c) ──
  milestones(): Locator {
    return this.card(th.home.milestones.title)
  }
  milestoneItem(name: string): Locator {
    return this.milestones().getByRole('listitem').filter({ hasText: name })
  }

  // ── ใครลา (FR-1101d) ──
  leave(): Locator {
    return this.card(th.home.leave.title)
  }
  /** The `dd` that follows the `dt` labelled `label` (th.home.leave.today / thisWeek / nextWeek). */
  leaveLine(label: string): Locator {
    return this.leave()
      .locator('dt')
      .filter({ hasText: new RegExp(`^\\s*${escapeRegExp(label)}\\s*$`) })
      .locator('xpath=following-sibling::dd[1]')
  }

  // ── เอกสารที่แก้ล่าสุด (FR-1101e) ──
  recentPages(): Locator {
    return this.card(th.home.recentPages.title)
  }

  // ── manager cards (FR-1101f) ──
  overloaded(): Locator {
    return this.card(th.home.manager.overloadedTitle)
  }
  utilisation(): Locator {
    return this.card(th.home.manager.utilisationTitle)
  }
  managerCards(): Locator {
    return this.overloaded().or(this.utilisation())
  }
}
