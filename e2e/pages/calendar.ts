import { expect, type Locator, type Page, type Response } from '@playwright/test'
import { th } from '../../src/i18n/th'
import { ShellPage } from './shell'

/** "YYYY-MM" → th.calendar.monthTitle (Thai month name + Buddhist-era year), e.g. '2026-09' → "กันยายน 2569". */
export function monthTitleOf(month: string): string {
  const [y, m] = month.split('-').map(Number) as [number, number]
  return th.calendar.monthTitle(th.calendar.months[m - 1]!, y + 543)
}

/** The visible text of a leave chip: th.calendar.leaveOf(name, label) + " (เช้า|บ่าย)" for half days (M5-D13). */
export function chipLabel(name: string, label: string, half: 'AM' | 'PM' | null = null): string {
  const text = th.calendar.leaveOf(name, label)
  return half ? `${text} (${th.calendar.half[half]})` : text
}

/**
 * `/calendar` (plan/m05 S3.2/S3.3, S5.1). DOM contract (S3): the month title is the `h1`; ‹ / เดือนนี้ / › buttons and
 * "แจ้งลา" sit in the header; the month view is `role="grid"` (6 Monday-first weeks) whose days are
 * `data-testid="day-<iso>"` gridcells holding the day number, "วันนี้", "🎌 <holiday>" and chips (full = `<button>`,
 * masked = `<span>`); below 600 px the grid is replaced by `data-testid="calendar-agenda"` with `agenda-<iso>` items.
 */
export class CalendarPage {
  readonly shell: ShellPage

  constructor(readonly page: Page) {
    this.shell = new ShellPage(page)
  }

  /** Opens `/calendar` (optionally `?month=YYYY-MM`) and waits for hydration and the month's data. */
  async goto(month?: string): Promise<void> {
    await this.shell.goto(month ? `/calendar?month=${month}` : '/calendar')
    await expect(this.grid().or(this.agenda()).or(this.agendaEmpty())).toBeVisible()
  }

  main(): Locator {
    return this.shell.main()
  }
  title(): Locator {
    return this.main().getByRole('heading', { level: 1 })
  }
  grid(): Locator {
    return this.page.getByRole('grid')
  }
  agenda(): Locator {
    return this.page.getByTestId('calendar-agenda')
  }
  agendaEmpty(): Locator {
    return this.main().getByText(th.calendar.agendaEmpty, { exact: true })
  }
  agendaDay(iso: string): Locator {
    return this.page.getByTestId(`agenda-${iso}`)
  }

  /** Resolves with the next GET /api/calendar response for the 6-week range starting at `from` (start it before the
   *  navigation). A month's range starts at the Monday on or before its 1st (October 2026 → 2026-09-28). */
  calendarResponse(from: string): Promise<Response> {
    return this.page.waitForResponse((r) => {
      const u = new URL(r.url())
      return u.pathname === '/api/calendar' && u.searchParams.get('from') === from
    })
  }

  async next(): Promise<void> {
    await this.main().getByRole('button', { name: th.calendar.nextMonth, exact: true }).click()
  }
  async prev(): Promise<void> {
    await this.main().getByRole('button', { name: th.calendar.prevMonth, exact: true }).click()
  }

  day(iso: string): Locator {
    return this.page.getByTestId(`day-${iso}`)
  }
  /** A chip on a grid day by its exact visible text (see `chipLabel`). */
  chip(iso: string, text: string): Locator {
    return this.day(iso).getByText(text, { exact: true })
  }
  /** A chip on an agenda day (phone layout). */
  agendaChip(iso: string, text: string): Locator {
    return this.agendaDay(iso).getByText(text, { exact: true })
  }

  /** Clicks a day on its padding (top-left + 4 px: the day-number row, never a chip) → single-day selection. */
  async clickDay(iso: string): Promise<void> {
    await this.day(iso).click({ position: { x: 4, y: 4 } })
  }

  /**
   * Pointer selection (FR-908): mouse down on `fromIso`'s padding, move over to `toIso`, release there. The grid
   * listens to pointerdown / pointerenter / pointerup on the cells, so the move uses intermediate steps.
   */
  async dragSelect(fromIso: string, toIso: string): Promise<void> {
    await this.day(fromIso).scrollIntoViewIfNeeded()
    const [a, b] = await Promise.all([this.day(fromIso).boundingBox(), this.day(toIso).boundingBox()])
    if (!a || !b) throw new Error(`dragSelect(${fromIso}, ${toIso}): day cell not rendered`)
    await this.page.mouse.move(a.x + 4, a.y + 4)
    await this.page.mouse.down()
    await this.page.mouse.move(b.x + 4, b.y + 4, { steps: 6 })
    await this.page.mouse.up()
  }

  /** Header "แจ้งลา" → the create dialog with today's date. */
  async reportLeave(): Promise<void> {
    await this.main().getByRole('button', { name: th.calendar.reportLeave, exact: true }).click()
  }
}
