/**
 * M5 — calendar, holidays, leave types, time off with capacity impact (plan/m05-calendar-capacity.md §7.3 E1–E8;
 * SPEC §12 M5: AC-M5-a "บันทึกลา", AC-M5-b "ลาทับถูกปฏิเสธ", AC-M5-c "import CSV วันหยุด"; FR-901…909, BR-12, MASK-5,
 * PERM-02/21, NFR-07b).
 *
 * Determinism (PLAN §4.5, X46): files run serially; every describe marked ⟲ resets planner_e2e in its own beforeAll
 * (golden seed = F1, or F4 for E5/E6: Cindy ลาพักร้อน 2026-10-12…14). Tests inside a describe build on each other.
 * Server "today" = APP_NOW 2026-09-30 (default month กันยายน 2569), the browser clock is pinned by the auto fixture.
 * UI strings come from th; numbers through formatThaiDate / formatLeaveRange / cdToNumeric; waits are on server-action
 * responses or UI state — never on time. Golden visibility (r6a §7): Ivy and Mint are plain members (Ivy shares POS/CRM
 * with Cindy, never a project with Peter); Cindy, Peter and Jack are LEADs (see everyone); only the manager and the
 * owner see a leave's type — everyone else sees "ลา".
 */
import type { Page } from '@playwright/test'
import { loadGolden } from '../scripts/lib/fixtures'
import { cdToNumeric } from '../src/domain/units'
import { th } from '../src/i18n/th'
import { formatLeaveRange, formatThaiDate } from '../src/lib/format'
import { expect, idOf, loginAs, resetDb, test, waitForServerAction } from './fixtures'
import { CalendarPage, chipLabel, monthTitleOf } from './pages/calendar'
import { HolidaysPage } from './pages/holidays'
import { LeaveDialog } from './pages/leave-dialog'
import { LeaveTypesPage } from './pages/leave-types'
import { SidebarPage } from './pages/sidebar'
import { toastWith, undoButtonOf } from './pages/toast'
import { encodeWindows874 } from './support/windows874'

const D = th.timeOff.dialog
const I = th.holidays.import
const LEAVE_TYPES = th.leaveTypes.defaults.map((t) => t.name)
const [VACATION, SICK, PERSONAL, TRAINING] = LEAVE_TYPES as [string, string, string, string]
const MASKED = th.masking.leave
/** golden-fixtures.json › expected.F2.setup.holidays[0] — the holiday E4 imports by CSV. */
const F2_HOLIDAY = loadGolden().expected.F2.setup.holidays![0]!
/** E4 / E6 data (not UI text). */
const NEW_YEARS_EVE = 'วันสิ้นปี'
const NEW_YEARS_EVE_OLD = 'วันสิ้นปีเก่า'
const SPECIAL = 'วันหยุดพิเศษ'
const ORDINATION = 'ลาบวช'
/** October 2026's 6-week range starts on Monday 2026-09-28. */
const OCT_FROM = '2026-09-28'

/** th.capacity.impactLine for a week, from integer centi-days (FR-906, M5-D5). */
function impactLine(weekStart: string, beforeCd: number, afterCd: number): string {
  return th.capacity.impactLine(formatThaiDate(weekStart), cdToNumeric(beforeCd), cdToNumeric(afterCd))
}

/** Global Cmd/Ctrl+Z from a non-editable target (body); waits for the server action the undo runs. */
async function undoByKey(page: Page): Promise<void> {
  await page.evaluate(() => {
    ;(document.activeElement as HTMLElement | null)?.blur()
  })
  const answered = waitForServerAction(page)
  await page.keyboard.press('ControlOrMeta+KeyZ')
  await answered
}

/** Logs in and opens /calendar (optionally on `month`). */
async function openCalendar(page: Page, who: Parameters<typeof loginAs>[1], month?: string) {
  await loginAs(page, who)
  const cal = new CalendarPage(page)
  await cal.goto(month)
  return { cal, dialog: new LeaveDialog(page) }
}

test.describe.configure({ mode: 'serial' })

// ---------------------------------------------------------------------------------------------------------------

test.describe('E1–E3, E8 ⟲ (AC-M5-a, AC-M5-b, FR-903…909) Peter records, overlaps and deletes leave', () => {
  test.beforeAll(async () => {
    await resetDb()
  })

  const PETER_VACATION = chipLabel('Peter', VACATION)

  test('E1 (AC-M5-a, FR-903/906/907/908) drag 5–6 ต.ค. → impact 5.00 → 3.00, chips on both days, kept on reload', async ({
    page,
  }) => {
    const { cal, dialog } = await openCalendar(page, 'peter')
    await expect(cal.title()).toHaveText(monthTitleOf('2026-09'))
    await expect(new SidebarPage(page).calendarLink()).toHaveAttribute('aria-current', 'page')
    await expect(cal.day('2026-09-30')).toHaveAttribute('aria-current', 'date') // "today" = APP_NOW
    await expect(cal.day('2026-09-30')).toContainText(th.calendar.today)
    await expect(cal.day('2026-08-31')).toHaveAttribute('data-outside', 'true') // Monday-first, 6 weeks

    const october = cal.calendarResponse(OCT_FROM)
    await cal.next()
    await october
    await expect(cal.title()).toHaveText(monthTitleOf('2026-10'))
    await expect(page).toHaveURL(/[?&]month=2026-10(&|$)/) // month in the URL (X53)

    await cal.dragSelect('2026-10-05', '2026-10-06')
    await dialog.expectOpen('create')
    await dialog.expectDate(D.startDate, '2026-10-05')
    await dialog.expectDate(D.endDate, '2026-10-06')
    await expect(dialog.typeSelect()).toHaveText(VACATION) // first active type (M5-D14)
    await expect(dialog.durationButton('full')).toHaveAttribute('aria-pressed', 'true')
    await expect(dialog.durationButton('am')).toBeDisabled() // half days only for one day
    await expect(dialog.employeeInput()).toHaveCount(0) // workers record only their own leave

    await dialog.save()
    await expect(dialog.saved()).toBeVisible()
    await expect(dialog.impact()).toContainText(th.capacity.impactFor('Peter'))
    await expect(dialog.impactLines()).toHaveText([impactLine('2026-10-05', 500, 300)])
    await dialog.close()

    await expect(cal.chip('2026-10-05', PETER_VACATION)).toBeVisible()
    await expect(cal.chip('2026-10-06', PETER_VACATION)).toBeVisible()
    await expect(cal.day('2026-10-07')).not.toContainText('Peter')

    await page.reload()
    await expect(cal.title()).toHaveText(monthTitleOf('2026-10'))
    await expect(cal.chip('2026-10-05', PETER_VACATION)).toBeVisible()
    await expect(cal.chip('2026-10-06', PETER_VACATION)).toBeVisible()
  })

  test('E2 (AC-M5-b, FR-905, X64) an overlapping range is refused by name; AM then PM on one day gets the hint', async ({
    page,
  }) => {
    const { cal, dialog } = await openCalendar(page, 'peter', '2026-10')

    await cal.dragSelect('2026-10-06', '2026-10-07')
    await dialog.expectOpen('create')
    await dialog.expectDate(D.startDate, '2026-10-06')
    await dialog.expectDate(D.endDate, '2026-10-07')
    await dialog.save()
    await expect(dialog.error()).toHaveText(
      th.timeOff.errors.overlap(formatLeaveRange('2026-10-05', '2026-10-06', null), VACATION),
    )
    await dialog.expectOpen('create') // the dialog stays open
    await expect(dialog.impact()).toHaveCount(0)
    await dialog.cancel()
    await expect(cal.day('2026-10-07')).not.toContainText('Peter')

    await cal.clickDay('2026-10-08')
    await dialog.expectOpen('create')
    await dialog.expectDate(D.startDate, '2026-10-08')
    await dialog.expectDate(D.endDate, '2026-10-08')
    await dialog.duration('am')
    await dialog.save()
    await expect(dialog.saved()).toBeVisible()
    await expect(dialog.impactLines()).toHaveText([impactLine('2026-10-05', 300, 250)]) // half day = −50 cd
    await dialog.close()
    await expect(cal.chip('2026-10-08', chipLabel('Peter', VACATION, 'AM'))).toBeVisible()

    await cal.clickDay('2026-10-08') // on the padding, not on the new chip
    await dialog.expectOpen('create')
    await dialog.duration('pm')
    await dialog.save()
    await expect(dialog.error()).toHaveText(
      th.timeOff.errors.overlapHalfDay(formatLeaveRange('2026-10-08', '2026-10-08', 'AM'), VACATION),
    )
    await dialog.cancel()
    await expect(cal.chip('2026-10-08', chipLabel('Peter', VACATION, 'PM'))).toHaveCount(0)
  })

  test('E3 (FR-909) delete own leave without confirm → toast undo restores it; Cmd/Ctrl+Z restores it too', async ({
    page,
  }) => {
    const { cal, dialog } = await openCalendar(page, 'peter', '2026-10')
    const deletedMsg = th.timeOff.deleted(formatLeaveRange('2026-10-05', '2026-10-06', null))
    const expectChips = async (visible: boolean) => {
      for (const iso of ['2026-10-05', '2026-10-06']) {
        if (visible) await expect(cal.chip(iso, PETER_VACATION)).toBeVisible()
        else await expect(cal.chip(iso, PETER_VACATION)).toHaveCount(0)
      }
    }

    await cal.chip('2026-10-05', PETER_VACATION).click()
    await dialog.expectOpen('edit')
    await dialog.expectDate(D.startDate, '2026-10-05')
    await dialog.expectDate(D.endDate, '2026-10-06')
    await dialog.delete() // closes at once — no confirm dialog (P2)
    await expect(page.getByRole('dialog')).toHaveCount(0)
    await expect(undoButtonOf(page, deletedMsg)).toBeVisible()
    await expectChips(false)

    const restored = waitForServerAction(page)
    await undoButtonOf(page, deletedMsg).click()
    await restored
    await expectChips(true)

    await cal.chip('2026-10-05', PETER_VACATION).click()
    await dialog.expectOpen('edit')
    await dialog.delete()
    await expect(toastWith(page, deletedMsg).last()).toBeVisible()
    await expectChips(false)
    await undoByKey(page)
    await expectChips(true)
  })

  test('E8 (FR-908 keyboard) focus 26 ต.ค. + Shift+→ + Enter opens 26–27; Escape closes without saving', async ({
    page,
  }) => {
    const { cal, dialog } = await openCalendar(page, 'peter', '2026-10')

    await cal.day('2026-10-26').focus()
    await expect(cal.day('2026-10-26')).toBeFocused()
    await page.keyboard.press('Shift+ArrowRight')
    await expect(cal.day('2026-10-27')).toBeFocused()
    await expect(cal.day('2026-10-26')).toHaveAttribute('aria-selected', 'true') // not colour alone (outline + state)
    await expect(cal.day('2026-10-27')).toHaveAttribute('aria-selected', 'true')
    await page.keyboard.press('Enter')

    await dialog.expectOpen('create')
    await dialog.expectDate(D.startDate, '2026-10-26')
    await dialog.expectDate(D.endDate, '2026-10-27')
    await page.keyboard.press('Escape')
    await dialog.expectClosed()
    await expect(cal.day('2026-10-26')).not.toContainText('Peter')
    await expect(cal.day('2026-10-27')).not.toContainText('Peter')
  })
})

// ---------------------------------------------------------------------------------------------------------------

test.describe('E4 ⟲ (AC-M5-c, FR-901, BR-12, SET-02) holiday CSV import: UTF-8, windows-874, bad file', () => {
  test.beforeAll(async () => {
    await resetDb()
  })

  test('manager imports UTF-8 (BOM) then windows-874 (upsert); a B.E. date is a line error', async ({
    page,
  }) => {
    await loginAs(page, 'manager')
    const holidays = new HolidaysPage(page)
    await holidays.goto()
    await expect(page.getByRole('tablist', { name: th.nav.settings }).getByRole('tab')).toHaveText([
      th.nav.employees,
      th.nav.positions,
      th.nav.holidays,
      th.nav.leaveTypes,
    ])

    const utf8 = Buffer.concat([
      Buffer.from([0xef, 0xbb, 0xbf]),
      Buffer.from(
        `date,name\r\n${F2_HOLIDAY.date},${F2_HOLIDAY.name}\r\n2026-12-31,${NEW_YEARS_EVE}\r\n`,
        'utf8',
      ),
    ])
    await holidays.importFile({ name: 'holidays-utf8.csv', buffer: utf8 })
    await expect(holidays.previewRows()).toHaveCount(2)
    await expect(holidays.previewRow(F2_HOLIDAY.name)).toContainText(I.status.new)
    await expect(holidays.previewRow(NEW_YEARS_EVE)).toContainText(I.status.new)
    await expect(holidays.errors()).toHaveCount(0)
    await holidays.confirm(2)
    await expect(toastWith(page, I.done(2, 0))).toBeVisible()
    await expect(holidays.row(F2_HOLIDAY.name)).toBeVisible()
    await expect(holidays.row(NEW_YEARS_EVE)).toBeVisible()

    const tis620 = encodeWindows874(`2026-12-31,${NEW_YEARS_EVE_OLD}\n2026-12-30,${SPECIAL}\n`)
    await holidays.importFile({ name: 'holidays-874.csv', buffer: tis620 })
    await expect(holidays.previewRows()).toHaveCount(2)
    await expect(holidays.previewRow(NEW_YEARS_EVE_OLD)).toContainText(I.status.update)
    await expect(holidays.previewRow(NEW_YEARS_EVE_OLD)).toContainText(I.previousName(NEW_YEARS_EVE))
    await expect(holidays.previewRow(SPECIAL)).toContainText(I.status.new)
    await holidays.confirm(2)
    await expect(toastWith(page, I.done(1, 1))).toBeVisible()
    await expect(holidays.row(NEW_YEARS_EVE_OLD)).toBeVisible()
    await expect(holidays.row(SPECIAL)).toBeVisible()
    await expect(holidays.row(NEW_YEARS_EVE)).toHaveCount(0)
    await expect(holidays.row(F2_HOLIDAY.name)).toBeVisible()

    await holidays.importFile({ name: 'holidays-be.csv', buffer: Buffer.from('23/10/2569,x\n', 'utf8') })
    await expect(holidays.errors()).toContainText(I.errors.line(1, I.errors.badDate('23/10/2569')))
    await expect(holidays.anyConfirmButton()).toBeDisabled() // all-or-nothing: no import with errors
    await holidays.cancel()
  })

  test('Mint sees 🎌 on 23 ต.ค.; leave on the holiday has no capacity impact (BR-12)', async ({ page }) => {
    const { cal, dialog } = await openCalendar(page, 'mint', '2026-10')
    const holidayDay = cal.day(F2_HOLIDAY.date)
    await expect(holidayDay).toHaveAttribute('data-holiday', 'true')
    await expect(holidayDay).toContainText(`${th.calendar.holidayPrefix} ${F2_HOLIDAY.name}`)

    await cal.clickDay(F2_HOLIDAY.date)
    await dialog.expectOpen('create')
    await dialog.expectDate(D.startDate, F2_HOLIDAY.date)
    await dialog.expectDate(D.endDate, F2_HOLIDAY.date)
    await dialog.save()
    await expect(dialog.saved()).toBeVisible()
    await expect(dialog.impact()).toContainText(th.capacity.noImpact)
    await expect(dialog.impactLines()).toHaveCount(0)
    await dialog.close()
    await expect(cal.chip(F2_HOLIDAY.date, chipLabel('Mint', VACATION))).toBeVisible()
  })

  test.describe('workers', () => {
    test.use({ allowedConsoleErrors: [/status of 404/] })

    test('Peter gets 404 on /settings/holidays (SET-02, X41)', async ({ page }) => {
      await loginAs(page, 'peter')
      expect((await page.goto('/settings/holidays'))?.status()).toBe(404)
    })
  })
})

// ---------------------------------------------------------------------------------------------------------------

test.describe('E5 ⟲ F4 (MASK-5, PERM-21, FR-906) manager records for Peter; others see only "ลา"', () => {
  test.beforeAll(async () => {
    await resetDb('F4')
  })

  test("manager: picks Peter, impact 5.00 → 3.00 for week 12 ต.ค.; sees Cindy's type", async ({ page }) => {
    const { cal, dialog } = await openCalendar(page, 'manager', '2026-10')
    await expect(cal.chip('2026-10-12', chipLabel('Cindy', VACATION))).toBeVisible()

    await cal.dragSelect('2026-10-15', '2026-10-16')
    await dialog.expectOpen('create')
    await expect(dialog.employeeInput()).toHaveValue('Manager') // default self (M5-D14)
    await dialog.setEmployee('Peter')
    await dialog.save()
    await expect(dialog.saved()).toBeVisible()
    await expect(dialog.impact()).toContainText(th.capacity.impactFor('Peter'))
    await expect(dialog.impactLines()).toHaveText([impactLine('2026-10-12', 500, 300)])
    await dialog.close()
    await expect(cal.chip('2026-10-15', chipLabel('Peter', VACATION))).toBeVisible()
    await expect(cal.chip('2026-10-16', chipLabel('Peter', VACATION))).toBeVisible()
  })

  test('Ivy: Cindy masked as "ลา", Peter invisible — in the grid and in the /api/calendar payload', async ({
    page,
  }) => {
    const peterId = await idOf('user', 'Peter')
    await loginAs(page, 'ivy')
    const cal = new CalendarPage(page)
    const response = cal.calendarResponse(OCT_FROM)
    await cal.goto('2026-10')
    const body = await (await response).text()
    expect(body.includes(VACATION), 'leave type name in the payload').toBe(false)
    expect(body.includes(peterId), "Peter's id in the payload").toBe(false)
    expect(body.includes('Peter'), "Peter's name in the payload").toBe(false)
    // M8 (plan/m08 S6.3): without `resetDb(…, { milestones: true })` the calendar carries no ◆ at all
    expect((JSON.parse(body) as { milestones?: unknown[] }).milestones, 'milestones in the payload').toEqual([])
    await expect(cal.milestoneChips()).toHaveCount(0)

    const cindy = chipLabel('Cindy', MASKED)
    await expect(cal.chip('2026-10-12', cindy)).toBeVisible()
    await expect(cal.day('2026-10-12').getByRole('button', { name: cindy })).toHaveCount(0) // masked = not editable
    await expect(cal.grid()).not.toContainText(VACATION)
    await expect(cal.day('2026-10-15')).not.toContainText('Peter')
  })

  test('Jack (LEAD → sees everyone): Peter and Cindy both masked', async ({ page }) => {
    const { cal } = await openCalendar(page, 'jack', '2026-10')
    await expect(cal.chip('2026-10-15', chipLabel('Peter', MASKED))).toBeVisible()
    await expect(cal.chip('2026-10-12', chipLabel('Cindy', MASKED))).toBeVisible()
    await expect(cal.grid()).not.toContainText(VACATION)
  })

  test('Cindy sees her own leave in full', async ({ page }) => {
    const { cal } = await openCalendar(page, 'cindy', '2026-10')
    await expect(cal.chip('2026-10-12', chipLabel('Cindy', VACATION))).toBeVisible()
    await expect(
      cal.day('2026-10-12').getByRole('button', { name: chipLabel('Cindy', VACATION) }),
    ).toBeVisible()
    await expect(cal.chip('2026-10-15', chipLabel('Peter', MASKED))).toBeVisible()
  })
})

// ---------------------------------------------------------------------------------------------------------------

test.describe('E6 ⟲ F4 (FR-902, M5-D10) leave types: add, move, delete + undo, in-use type is archived', () => {
  test.beforeAll(async () => {
    await resetDb('F4')
  })

  const MOVED = [VACATION, SICK, PERSONAL, ORDINATION, TRAINING]

  test('manager: add ลาบวช, move it up, delete → undo restores it in place; deleting ลาพักร้อน archives it', async ({
    page,
  }) => {
    await loginAs(page, 'manager')
    const types = new LeaveTypesPage(page)
    await types.goto()
    await types.expectOrder(LEAVE_TYPES)

    await types.add(ORDINATION)
    await types.expectOrder([...LEAVE_TYPES, ORDINATION])
    await types.moveUp(ORDINATION)
    await types.expectOrder(MOVED)

    await types.delete(ORDINATION)
    await expect(toastWith(page, th.leaveTypes.deleted(ORDINATION))).toBeVisible()
    await expect(page.getByRole('dialog')).toHaveCount(0) // no confirm (P2)
    await expect(types.row(ORDINATION)).toHaveCount(0)
    const restored = waitForServerAction(page)
    await undoButtonOf(page, th.leaveTypes.deleted(ORDINATION)).click()
    await restored
    await types.expectOrder(MOVED) // same id and position

    await types.delete(VACATION) // used by Cindy's F4 leave
    await expect(toastWith(page, th.leaveTypes.archivedInstead(VACATION))).toBeVisible()
    await expect(types.archivedChip(VACATION)).toBeVisible()
    await types.expectOrder(MOVED)
    await page.reload()
    await expect(types.archivedChip(VACATION)).toBeVisible()
  })

  test('Cindy: the dialog from the user menu no longer offers ลาพักร้อน; her 12 ต.ค. chip still reads it', async ({
    page,
  }) => {
    const { cal, dialog } = await openCalendar(page, 'cindy', '2026-10')
    await cal.shell.openUserMenu()
    await page.getByRole('menuitem', { name: th.nav.reportLeave, exact: true }).click()
    await dialog.expectOpen('create')
    await dialog.openTypes()
    await expect(dialog.typeOptions()).toHaveText([SICK, PERSONAL, ORDINATION, TRAINING])
    await page.keyboard.press('Escape') // closes the type list only
    await expect(page.getByRole('listbox')).toHaveCount(0)
    await dialog.cancel()
    await expect(cal.chip('2026-10-12', chipLabel('Cindy', VACATION))).toBeVisible()
  })

  test.describe('workers', () => {
    test.use({ allowedConsoleErrors: [/status of 404/] })

    test('Ivy gets 404 on /settings/leave-types (SET-02, X41)', async ({ page }) => {
      await loginAs(page, 'ivy')
      expect((await page.goto('/settings/leave-types'))?.status()).toBe(404)
    })
  })
})

// ---------------------------------------------------------------------------------------------------------------

test.describe('E7 ⟲ (NFR-07b) phone: agenda instead of the grid, full-screen dialog', () => {
  test.use({ viewport: { width: 390, height: 844 } })

  test.beforeAll(async () => {
    await resetDb()
  })

  test('Ivy records 20 ต.ค. from "แจ้งลา" at 390 × 844', async ({ page }) => {
    const { cal, dialog } = await openCalendar(page, 'ivy', '2026-10')
    await expect(cal.grid()).toHaveCount(0)
    await expect(cal.agendaEmpty()).toBeVisible()

    await cal.reportLeave()
    await dialog.expectOpen('create')
    await expect
      .poll(async () => Math.round((await dialog.root().boundingBox())?.width ?? 0))
      .toBe(page.viewportSize()!.width)
    await dialog.expectDate(D.startDate, '2026-09-30') // bare "แจ้งลา" = today
    await dialog.setDate(D.startDate, '2026-10-20')
    await dialog.setDate(D.endDate, '2026-10-20')
    await dialog.save()
    await expect(dialog.saved()).toBeVisible()
    await expect(dialog.impactLines()).toHaveText([impactLine('2026-10-19', 500, 400)])
    await dialog.close()

    await expect(cal.agenda()).toBeVisible()
    await expect(cal.agendaChip('2026-10-20', chipLabel('Ivy', VACATION))).toBeVisible()
    await expect(cal.grid()).toHaveCount(0)
  })
})
