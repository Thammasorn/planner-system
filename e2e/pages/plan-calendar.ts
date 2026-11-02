import { expect, type Locator, type Page } from '@playwright/test'
import type { ISODate } from '../../src/domain/types'
import { th } from '../../src/i18n/th'
import { escapeRe } from './grid'
import { ShellPage } from './shell'

/** "YYYY-MM" → the calendar title (Thai month name + Buddhist-era year, M5 monthTitle), '2026-11' → "พฤศจิกายน 2569". */
export function planMonthTitle(month: string): string {
  const [y, m] = month.split('-').map(Number) as [number, number]
  return th.calendar.monthTitle(th.calendar.months[m - 1]!, y + 543)
}

/**
 * แผนงาน tab › ปฏิทิน (plan/m07.1 S4.1–S4.3, S6). DOM contract (S4):
 * - `plan-view` root with `data-view` GRID | CALENDAR; the switch is a toggle group named th.planView.label with the
 *   buttons th.planView.grid / th.planView.calendar (aria-pressed);
 * - `plan-calendar` (toolbar named th.planCalendar.toolbar: ‹ th.planCalendar.prev, `plan-calendar-month`, ›
 *   th.planCalendar.next, วันนี้), a Monday-first `role="grid"` of `plan-day-<iso>` gridcells;
 * - a bar = `[data-task-bar=<taskId>]` (`data-tentative`, `data-cut-left`, `data-cut-right`) holding a button named
 *   barLabel ("<task> · <names>, <dates>, …");
 * - "ไม่มีวันที่ (N)" = `plan-no-dates`; marker flags `[data-marker=<id>]` inside the day cell;
 * - below 600 px the month grid is replaced by `plan-agenda` with `plan-agenda-<iso>` items.
 */
export class PlanCalendarPage {
  readonly shell: ShellPage

  constructor(readonly page: Page) {
    this.shell = new ShellPage(page)
  }

  view(): Locator {
    return this.page.getByTestId('plan-view')
  }
  viewSwitch(): Locator {
    return this.page.getByRole('group', { name: th.planView.label })
  }
  viewButton(v: 'GRID' | 'CALENDAR'): Locator {
    return this.viewSwitch().getByRole('button', {
      name: v === 'GRID' ? th.planView.grid : th.planView.calendar,
      exact: true,
    })
  }
  /** Clicks the switch and waits for the view, its `?view=` and the saved `plan.view` preference. */
  async switchTo(v: 'GRID' | 'CALENDAR'): Promise<void> {
    await this.viewButton(v).click()
    await expect(this.view()).toHaveAttribute('data-view', v)
    // history.replaceState (M7.1-D20): poll the URL instead of waiting for a navigation
    await expect.poll(() => new URL(this.page.url()).searchParams.get('view')).toBe(v.toLowerCase())
    if (v === 'CALENDAR') await this.waitReady()
  }
  async waitReady(): Promise<void> {
    await expect(this.root()).toBeVisible()
    await expect(this.monthTitle()).not.toBeEmpty()
    await expect(this.noDates().or(this.agenda()).first()).toBeAttached()
  }

  root(): Locator {
    return this.page.getByTestId('plan-calendar')
  }
  toolbar(): Locator {
    return this.root().getByRole('toolbar', { name: th.planCalendar.toolbar })
  }
  monthTitle(): Locator {
    return this.page.getByTestId('plan-calendar-month')
  }
  async next(): Promise<void> {
    await this.toolbar().getByRole('button', { name: th.planCalendar.next, exact: true }).click()
  }
  async prev(): Promise<void> {
    await this.toolbar().getByRole('button', { name: th.planCalendar.prev, exact: true }).click()
  }
  /** ‹ / › until the title reads `month` ('YYYY-MM'); at most 24 steps. */
  async gotoMonth(month: string): Promise<void> {
    const want = planMonthTitle(month)
    for (let i = 0; i < 24 && (await this.monthTitle().textContent()) !== want; i++) {
      const current = await this.root()
        .locator('[role="gridcell"][data-date]:not([data-outside])')
        .first()
        .getAttribute('data-date')
      if (current !== null && current.slice(0, 7) > month) await this.prev()
      else await this.next()
    }
    await expect(this.monthTitle()).toHaveText(want)
  }
  monthGrid(): Locator {
    return this.root().getByRole('grid')
  }
  day(iso: ISODate): Locator {
    return this.page.getByTestId(`plan-day-${iso}`)
  }
  /** Every bar segment of a task (one per week row it covers). */
  bars(taskId: string): Locator {
    return this.root().locator(`[data-task-bar="${taskId}"]`)
  }
  /** The bar's main button (click = panel). */
  barButton(bar: Locator): Locator {
    return bar.getByRole('button').first()
  }
  /** "ไม่มีวันที่ (N)". */
  noDates(): Locator {
    return this.page.getByTestId('plan-no-dates')
  }
  noDateItem(taskName: string): Locator {
    return this.noDates().getByRole('button', { name: new RegExp(`^${escapeRe(taskName)} · `) })
  }
  agenda(): Locator {
    return this.page.getByTestId('plan-agenda')
  }
  agendaDay(iso: ISODate): Locator {
    return this.page.getByTestId(`plan-agenda-${iso}`)
  }
  /** Plan-marker flags drawn in a day cell. */
  markersOn(iso: ISODate): Locator {
    return this.day(iso).locator('[data-marker]')
  }
}
