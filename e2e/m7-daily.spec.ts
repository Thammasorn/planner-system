/**
 * M7 — daily resolution (plan/m07-daily-resolution.md §7.3 D1–D7, S5.2).
 * Determinism (PLAN §4.5, X45/X46): production build, APP_NOW = 2026-09-30 10:00 +07, the browser clock pinned by the
 * auto fixture before the first goto; every describe resets planner_e2e in its own beforeAll. Strings come from `th`,
 * numbers via `formatCd`, dates via `formatThaiDate` / `formatWeekHeader`, golden data from golden-fixtures.json
 * (`loadGolden`) and SPEC A.2 (`DAY_EXAMPLE`). Waits are on data-save-state, aria-expanded, dialogs or toasts — never
 * sleeps. Rows and cells are found by data-row-key / data-testid / accessible names only (C27).
 *
 * D1 → D4 → D2 → D3 chain state on one resetDb() (serial). Ivy's "ทำ UAT + คู่มือหน้าร้าน" week 2026-09-28 is
 * WEEK 250 cd (golden), Ivy works 100 cd Mon–Fri, F1 has no holiday that week:
 *   D1 BR-22 Wed = 1.0 → DAY [50, 50, 100, 50, 50] (300) · D4 collapse → WEEK 300 → undo/redo/undo → DAY again ·
 *   D2 รวม = 2 → SCALE [34, 33, 67, 33, 33] → undo → DAY 300 · D3 Cancel, COLLAPSE 400, two-week dialog.
 */
import type { Locator, Page } from '@playwright/test'
import { daysOfWeek, isoWeekday } from '../src/domain/dates'
import type { Cd, ISODate, PeriodKey } from '../src/domain/types'
import { formatCd } from '../src/domain/units'
import { th } from '../src/i18n/th'
import { formatThaiDate } from '../src/lib/format'
import { DAY_EXAMPLE, loadGolden } from '../scripts/lib/fixtures'
import { expect, loginAs, resetDb, test, waitForServerActionWith, type GoldenLogin } from './fixtures'
import { GridPage } from './pages/grid'
import { undoButtonOf } from './pages/toast'

const golden = loadGolden()
const POS = 'POS Upgrade'
const MOBILE = DAY_EXAMPLE.project

/** The golden task of `assignee` in `project` (single-assignee golden tasks: merged rows '<task> · <person>'). */
function goldenTask(project: string, assignee: string) {
  const t = golden.tasks.find((x) => x.project === project && x.assignee === assignee)
  if (!t) throw new Error(`golden task of ${assignee} in ${project} not found`)
  return t
}
const UAT = goldenTask(POS, 'Ivy')
const FLOW = goldenTask(MOBILE, 'Jack')
/** golden-fixtures.json › expected.F2.setup.holidays[0] (Fri 2026-10-23). */
const F2_HOLIDAY = golden.expected.F2.setup.holidays![0]!

const d1 = (cd: number) => formatCd(cd, { unit: 'DAYS', decimals: 1 })
const d2 = (cd: number) => formatCd(cd, { unit: 'DAYS', decimals: 2 })
const W = (week: ISODate): PeriodKey => `W:${week}`
const D = (date: ISODate): PeriodKey => `D:${date}`
/** Mon–Fri of a week. */
const weekdays = (week: ISODate): ISODate[] => daysOfWeek(week).slice(0, 5)

/** "จ 0.5 · อ 0.5 · …" — the non-zero days of a week (BR-24 dialog breakdown / preview), from th weekday labels. */
function dayParts(week: ISODate, cds: readonly Cd[]): string {
  return daysOfWeek(week)
    .map((date, i) => [date, cds[i] ?? 0] as const)
    .filter(([, cd]) => cd > 0)
    .map(([date, cd]) => `${th.calendar.weekdays[isoWeekday(date) - 1]} ${d1(cd)}`)
    .join(' · ')
}

/** RegExp that matches `text` anywhere (for attributes that may carry more than one text). */
const containing = (text: string): RegExp => new RegExp(text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))

async function openGrid(page: Page, who: GoldenLogin, project: string): Promise<GridPage> {
  await loginAs(page, who)
  const grid = new GridPage(page)
  await grid.goto(project)
  return grid
}

/** Shows the grid's shared tooltip for `target` (the pointer first leaves, so a fresh pointerover fires). */
async function hoverTip(page: Page, target: Locator): Promise<void> {
  await page.mouse.move(0, 0)
  await target.hover()
}

/** Global undo / redo with focus on the body (the M1 UndoProvider; X04), then the save settles. */
async function undo(grid: GridPage, redo = false): Promise<void> {
  await grid.page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur())
  await grid.press(redo ? 'ControlOrMeta+Shift+KeyZ' : 'ControlOrMeta+KeyZ')
  await grid.waitSaved()
}

/** The day cells of `week` show `cds` (Mon–Fri) — derived (dashed + aria-description) or solid. */
async function expectDays(
  grid: GridPage,
  rowKey: string,
  week: ISODate,
  cds: readonly Cd[],
  kind: 'derived' | 'solid',
): Promise<void> {
  const dates = weekdays(week)
  for (let i = 0; i < dates.length; i++) {
    const cell = await grid.revealDay(rowKey, dates[i]!)
    await expect(grid.value(cell), `${rowKey} ${dates[i]}`).toHaveText(cds[i] === 0 ? '' : d1(cds[i]!))
    if (kind === 'derived') {
      await expect(cell).toHaveAttribute('data-derived', 'true')
      await expect(cell).toHaveAttribute('aria-description', containing(th.grid.day.derivedDescription))
    } else {
      await expect(cell).not.toHaveAttribute('data-derived', 'true')
    }
  }
}

/** The narrow รวม column of an expanded week (= the week's W cell) shows `cd`. */
async function expectWeekTotal(grid: GridPage, rowKey: string, week: ISODate, cd: Cd): Promise<void> {
  const cell = await grid.reveal(rowKey, week)
  await expect(grid.value(cell)).toHaveText(d1(cd))
}

// ── D1 → D4 → D2 → D3 ────────────────────────────────────────────────────────────────────────────────────────
test.describe('D1–D4 ⟲ (AC-804, FR-803, BR-22/23/24, AC-805 continuity) one Ivy week · ivy', () => {
  test.describe.configure({ mode: 'serial' })
  test.beforeAll(async () => {
    await resetDb()
  })

  const WEEK: ISODate = '2026-09-28'
  const WED: ISODate = '2026-09-30'
  const base = UAT.allocationsCd[WEEK]! // 250 cd, WEEK
  const DAY_PLAN: Cd[] = [50, 50, 100, 50, 50] // after D1 (BR-22: 250 − 50 + 100 = 300)

  test('D1 (AC-804) expand 28/9 → 0.5 × 5 dashed → Wed 1.0 → week 3.0, other days solid; after reload 3.0 ⋯', async ({
    page,
  }) => {
    const grid = await openGrid(page, 'ivy', POS)
    const ivy = await grid.rowKeyOf(UAT.name, 'Ivy')
    await grid.reveal(ivy, WEEK)
    await expect(grid.weekHeader(WEEK)).toHaveAttribute('aria-expanded', 'false')

    // the expand is a view action: no server action
    const calls = await grid.countServerActions(() => grid.expandWeek(WEEK))
    expect(calls).toBe(0)
    await expect(grid.dayGroupHeader(WEEK)).toHaveText(formatThaiDate(WEEK, 'medium'))
    const dates = weekdays(WEEK)
    for (let i = 0; i < 5; i++)
      await expect(grid.dayHeader(dates[i]!)).toContainText(th.calendar.weekdays[i]!)
    // Sat/Sun only when someone is scheduled then or a DAY row exists (M7-D10): neither here
    await expect(grid.dayHeader(daysOfWeek(WEEK)[5]!)).toHaveCount(0)
    await expect(grid.dayHeader(daysOfWeek(WEEK)[6]!)).toHaveCount(0)

    await expectDays(grid, ivy, WEEK, [50, 50, 50, 50, 50], 'derived')
    await expectWeekTotal(grid, ivy, WEEK, base)

    await grid.typeInto(await grid.revealDay(ivy, WED), '1')
    await grid.waitSaved()
    await expect(grid.br24().root).toHaveCount(0)
    await expectWeekTotal(grid, ivy, WEEK, 300)
    await expectDays(grid, ivy, WEEK, DAY_PLAN, 'solid')

    await grid.reload()
    const week = await grid.reveal(ivy, WEEK)
    await expect(grid.value(week)).toHaveText(d1(300))
    await expect(week).toHaveAttribute('data-resolution', 'DAY')
    await expect(week.locator('[data-glyph="dayDetail"]')).toBeAttached()
    await grid.expandWeek(WEEK)
    await expectDays(grid, ivy, WEEK, DAY_PLAN, 'solid')
  })

  test('D4 (BR-23) ↕ รวมเป็นรายสัปดาห์ → 0.6 dashed with undo toast; undo / redo / undo; reload = undo state', async ({
    page,
  }) => {
    const grid = await openGrid(page, 'ivy', POS)
    const ivy = await grid.rowKeyOf(UAT.name, 'Ivy')
    await grid.expandWeek(WEEK)
    const total = await grid.reveal(ivy, WEEK)
    await total.hover()
    await grid.collapseButton(ivy, WEEK).click()
    await expect(grid.toast(th.grid.day.collapsedToast)).toBeVisible()
    await expect(undoButtonOf(page, th.grid.day.collapsedToast)).toBeVisible()
    await grid.waitSaved()
    await expect(grid.br24().root).toHaveCount(0) // no confirm, no BR-24 dialog
    await expectDays(grid, ivy, WEEK, [60, 60, 60, 60, 60], 'derived')
    await expectWeekTotal(grid, ivy, WEEK, 300)

    await undo(grid)
    await expect(grid.br24().root).toHaveCount(0)
    await expectDays(grid, ivy, WEEK, DAY_PLAN, 'solid')
    await undo(grid, true)
    await expectDays(grid, ivy, WEEK, [60, 60, 60, 60, 60], 'derived')
    await undo(grid)
    await expect(grid.br24().root).toHaveCount(0)
    await expectDays(grid, ivy, WEEK, DAY_PLAN, 'solid')

    await grid.reload()
    await grid.expandWeek(WEEK)
    await expectDays(grid, ivy, WEEK, DAY_PLAN, 'solid')
    await expectWeekTotal(grid, ivy, WEEK, 300)
  })

  test('D2 (BR-24 SCALE) รวม 3.0 → 2 → dialog → ปรับตามสัดส่วนเดิม → 0.3/0.3/0.7/0.3/0.3; undo has no dialog', async ({
    page,
  }) => {
    const grid = await openGrid(page, 'ivy', POS)
    const ivy = await grid.rowKeyOf(UAT.name, 'Ivy')
    await grid.expandWeek(WEEK)
    const total = await grid.reveal(ivy, WEEK)
    await grid.typeInto(total, '2')

    const br24 = grid.br24()
    await expect(br24.root).toHaveCount(1)
    await expect(br24.root).toContainText(th.grid.br24.title(1))
    await expect(br24.root).toContainText(th.grid.br24.breakdown(dayParts(WEEK, DAY_PLAN)))
    await expect(br24.root).toContainText(th.grid.br24.change(d1(300), d1(200)))
    const SCALED: Cd[] = [34, 33, 67, 33, 33] // largest remainder of 200 over 50/50/100/50/50, earliest first
    await expect(br24.root).toContainText(th.grid.br24.scalePreview(dayParts(WEEK, SCALED)))
    await expect(total).toHaveAttribute('data-pending-choice', 'true')

    await br24.scale()
    await grid.waitSaved()
    await expect(total).not.toHaveAttribute('data-pending-choice', 'true')
    await expectDays(grid, ivy, WEEK, SCALED, 'solid')
    await expectWeekTotal(grid, ivy, WEEK, 200)
    await hoverTip(page, await grid.revealDay(ivy, WEEK))
    await expect(grid.tooltip()).toContainText(th.grid.day.dayTooltip(d2(34)))

    await undo(grid)
    await expect(br24.root).toHaveCount(0)
    await expectDays(grid, ivy, WEEK, DAY_PLAN, 'solid')
    await expectWeekTotal(grid, ivy, WEEK, 300)
  })

  test('D3 (BR-24 COLLAPSE, Cancel, one dialog for 2 weeks) Cancel writes nothing; COLLAPSE; 2-week dialog; one undo', async ({
    page,
  }) => {
    const grid = await openGrid(page, 'ivy', POS)
    const ivy = await grid.rowKeyOf(UAT.name, 'Ivy')
    const NEXT: ISODate = '2026-10-05'
    const nextBase = UAT.allocationsCd[NEXT]! // 125 cd WEEK → 25 × 5 derived
    await grid.expandWeek(WEEK)
    const total = await grid.reveal(ivy, WEEK)
    const br24 = grid.br24()

    // Cancel → nothing sent, รวม back to 3.0
    const cancelled = await grid.countServerActions(async () => {
      await grid.typeInto(total, '4')
      await expect(br24.root).toHaveCount(1)
      await br24.cancel()
      await grid.waitSaved()
    })
    expect(cancelled).toBe(0)
    await expectWeekTotal(grid, ivy, WEEK, 300)
    await expectDays(grid, ivy, WEEK, DAY_PLAN, 'solid')

    // COLLAPSE → WEEK 400, 0.8 dashed
    await grid.typeInto(total, '4')
    await expect(br24.root).toHaveCount(1)
    await br24.collapse()
    await grid.waitSaved()
    await expectDays(grid, ivy, WEEK, [80, 80, 80, 80, 80], 'derived')
    await expectWeekTotal(grid, ivy, WEEK, 400)

    // BR-22 on both weeks: 10-05 Mon 0.5 → 150 = [50,25,25,25,25]; 28/9 Mon 1 → 420 = [100,80,80,80,80]
    await grid.expandWeek(NEXT)
    await expectDays(grid, ivy, NEXT, [25, 25, 25, 25, 25], 'derived')
    await expectWeekTotal(grid, ivy, NEXT, nextBase)
    await grid.typeInto(await grid.revealDay(ivy, NEXT), '0.5')
    await grid.waitSaved()
    await expectWeekTotal(grid, ivy, NEXT, 150)
    await expectDays(grid, ivy, NEXT, [50, 25, 25, 25, 25], 'solid')
    await grid.typeInto(await grid.revealDay(ivy, WEEK), '1')
    await grid.waitSaved()
    await expectWeekTotal(grid, ivy, WEEK, 420)
    await expect(br24.root).toHaveCount(0)

    // collapse both views (Cmd+↑ on a day cell; never data)
    const views = await grid.countServerActions(async () => {
      for (const week of [WEEK, NEXT]) {
        await (await grid.revealDay(ivy, week)).click()
        await grid.press('ControlOrMeta+ArrowUp')
        await expect(grid.weekHeader(week)).toHaveAttribute('aria-expanded', 'false')
        await expect(grid.cell(ivy, week)).toBeFocused()
      }
    })
    expect(views).toBe(0)
    for (const [week, cd] of [
      [WEEK, 420],
      [NEXT, 150],
    ] as const) {
      const cell = await grid.reveal(ivy, week)
      await expect(grid.value(cell)).toHaveText(d1(cd))
      await expect(cell.locator('[data-glyph="dayDetail"]')).toBeAttached()
    }

    // select 28/9 + 5/10, type 2 → ONE dialog for both weeks → COLLAPSE
    await grid.cell(ivy, WEEK).click()
    await grid.press('Shift+ArrowRight')
    await page.keyboard.type('2')
    await grid.press('Enter')
    await expect(br24.root).toHaveCount(1)
    await expect(br24.root).toContainText(th.grid.br24.title(2))
    await expect(br24.root).toContainText(
      th.grid.br24.pairLine('Ivy', formatThaiDate(WEEK), d1(420), d1(200)),
    )
    await expect(br24.root).toContainText(
      th.grid.br24.pairLine('Ivy', formatThaiDate(NEXT), d1(150), d1(200)),
    )
    await br24.collapse()
    await grid.waitSaved()
    for (const week of [WEEK, NEXT]) {
      const cell = await grid.reveal(ivy, week)
      await expect(grid.value(cell)).toHaveText(d1(200))
      await expect(cell).toHaveAttribute('data-resolution', 'WEEK')
      await expect(cell.locator('[data-glyph="dayDetail"]')).toHaveCount(0)
    }

    // one undo restores both DAY weeks, without a dialog
    await undo(grid)
    await expect(br24.root).toHaveCount(0)
    for (const [week, cd] of [
      [WEEK, 420],
      [NEXT, 150],
    ] as const) {
      const cell = await grid.reveal(ivy, week)
      await expect(grid.value(cell)).toHaveText(d1(cd))
      await expect(cell.locator('[data-glyph="dayDetail"]')).toBeAttached()
    }
  })
})

// ── D5 ───────────────────────────────────────────────────────────────────────────────────────────────────────
test.describe('D5 ⟲ (FR-802 day zoom, grid.zoom preference, SPEC A.2 Kickoff workshop) · jack', () => {
  test.beforeAll(async () => {
    await resetDb(undefined, { dayExample: true })
  })

  test('day zoom shows Kickoff 0.5 solid, flow 0.5 dashed, footer 1.5 / 0.5 / 2.0; persists; week zoom 0.5 ⋯ / 3.5', async ({
    page,
  }) => {
    const WEEK: ISODate = DAY_EXAMPLE.day // Monday 2026-09-07
    const grid = await openGrid(page, 'jack', MOBILE)
    const saved = waitForServerActionWith(page, 'grid.zoom')
    await grid.zoom('day')
    expect((await saved).ok()).toBe(true)
    await grid.scrollToWeek(WEEK)

    // headers are not toggles in day zoom
    await expect(grid.weekHeader(WEEK)).toHaveCount(0)
    await expect(grid.dayGroupHeader(WEEK)).toHaveCount(0)
    await expect(grid.dayHeader(WEEK)).toBeAttached()

    const expectDayZoom = async () => {
      for (const person of DAY_EXAMPLE.assignees) {
        const row = await grid.rowKeyOf(DAY_EXAMPLE.task, person)
        const cell = await grid.revealDay(row, DAY_EXAMPLE.day)
        await expect(grid.value(cell)).toHaveText(d1(DAY_EXAMPLE.cd))
        await expect(cell).not.toHaveAttribute('data-derived', 'true')
      }
      const flow = await grid.rowKeyOf(FLOW.name, 'Jack')
      const flowWeek = FLOW.allocationsCd[WEEK]! // 250 cd WEEK → 50 × 5
      await expectDays(grid, flow, WEEK, Array<Cd>(5).fill(flowWeek / 5), 'derived')
      // footer: 50 (Jack kickoff) + 50 (Mint kickoff) + 50 (Jack flow) on Monday; Jack's flow only on Tuesday
      await expect(grid.footerLoad(D(DAY_EXAMPLE.day))).toHaveText(d1(150))
      await expect(grid.footerLoad(D(weekdays(WEEK)[1]!))).toHaveText(d1(50))
      await expect(grid.footerCapacity(D(DAY_EXAMPLE.day))).toHaveText(d1(200))
    }
    await expectDayZoom()

    await grid.reload()
    await expect(grid.zoomButton('day')).toHaveAttribute('aria-pressed', 'true')
    await grid.scrollToWeek(WEEK)
    await expectDayZoom()

    await grid.zoom('week')
    const jackKickoff = await grid.rowKeyOf(DAY_EXAMPLE.task, 'Jack')
    const cell = await grid.reveal(jackKickoff, WEEK)
    await expect(grid.value(cell)).toHaveText(d1(DAY_EXAMPLE.cd))
    await expect(cell.locator('[data-glyph="dayDetail"]')).toBeAttached()
    await expect(grid.footerLoad(W(WEEK))).toHaveText(d1(FLOW.allocationsCd[WEEK]! + 2 * DAY_EXAMPLE.cd))
  })
})

// ── D6 ───────────────────────────────────────────────────────────────────────────────────────────────────────
test.describe('D6 ⟲ (KEY-07, A11Y-2b, §4.8 day cells, same-kind rules, BR-26 DAY) keyboard only · ivy', () => {
  test.beforeAll(async () => {
    await resetDb()
  })

  test('Cmd+↓ / h / 1.5 rejected / paste stops at รวม / Shift+F10 รวมเป็นรายสัปดาห์ / Cmd+↑', async ({
    page,
  }) => {
    const WEEK: ISODate = '2026-10-05' // Ivy WEEK 125 cd → 25 × 5 derived
    const [mon, tue, , thu] = weekdays(WEEK) as [ISODate, ISODate, ISODate, ISODate, ISODate]
    const grid = await openGrid(page, 'ivy', POS)
    const ivy = await grid.rowKeyOf(UAT.name, 'Ivy')
    await (await grid.reveal(ivy, WEEK)).click()

    // Cmd+↓ expands the view and focuses the first day cell — no server action
    const expanded = await grid.countServerActions(async () => {
      await grid.press('ControlOrMeta+ArrowDown')
      await expect(grid.dayGroupHeader(WEEK)).toHaveAttribute('aria-expanded', 'true')
      await expect(grid.dayCell(ivy, mon)).toBeFocused()
    })
    expect(expanded).toBe(0)
    await expectDays(grid, ivy, WEEK, [25, 25, 25, 25, 25], 'derived')
    await expect(grid.dayCell(ivy, mon)).toBeFocused()

    // h = half the day's capacity (50 cd) → BR-22: 125 − 25 + 50 = 150
    await grid.press('h')
    await grid.waitSaved()
    await expect(grid.value(grid.dayCell(ivy, mon))).toHaveText(d1(50))
    await expectWeekTotal(grid, ivy, WEEK, 150)

    // 1.5 on a day cell is rejected for that cell (BR-26): editor stays open, aria-invalid, toast; nothing saved
    await grid.press('ArrowRight')
    await expect(grid.dayCell(ivy, tue)).toBeFocused()
    const rejected = await grid.countServerActions(async () => {
      await page.keyboard.type('1.5')
      await grid.press('Enter')
      await expect(grid.dayCell(ivy, tue).locator('[data-cell-editor]')).toHaveAttribute(
        'aria-invalid',
        'true',
      )
      await expect(grid.toast(th.grid.errors.maxDay)).toBeVisible()
      await grid.press('Escape')
      await grid.waitSaved()
    })
    expect(rejected).toBe(0)
    await expect(grid.value(grid.dayCell(ivy, tue))).toHaveText(d1(25))

    // paste 3 values at Thursday: Thu + Fri written, stops at the รวม column (another kind)
    await grid.press('ArrowRight')
    await grid.press('ArrowRight')
    await expect(grid.dayCell(ivy, thu)).toBeFocused()
    await grid.paste(['0.5', '0.5', '0.5'].join('\t'))
    await expect(grid.toast(th.grid.day.mixedKinds)).toBeVisible()
    await grid.waitSaved()
    await expectDays(grid, ivy, WEEK, [50, 25, 25, 50, 50], 'solid')
    await expectWeekTotal(grid, ivy, WEEK, 200)

    // Shift+F10 → cell menu → Enter on "↕ รวมเป็นรายสัปดาห์"
    await grid.press('Shift+F10')
    const item = grid.cellMenu().getByRole('menuitem', { name: th.grid.day.collapseToWeek, exact: true })
    await expect(item).toBeFocused()
    await grid.press('Enter')
    await expect(grid.cellMenu()).toHaveCount(0)
    await expect(grid.toast(th.grid.day.collapsedToast)).toBeVisible()
    await grid.waitSaved()
    await expect(grid.br24().root).toHaveCount(0)

    // Cmd+↑ collapses the view and focuses the week cell — no server action
    await expect(grid.dayCell(ivy, thu)).toBeFocused()
    const collapsed = await grid.countServerActions(async () => {
      await grid.press('ControlOrMeta+ArrowUp')
      await expect(grid.weekHeader(WEEK)).toHaveAttribute('aria-expanded', 'false')
      await expect(grid.cell(ivy, WEEK)).toBeFocused()
    })
    expect(collapsed).toBe(0)
    const week = grid.cell(ivy, WEEK)
    await expect(grid.value(week)).toHaveText(d1(200))
    await expect(week).toHaveAttribute('data-resolution', 'WEEK')
    await expect(week.locator('[data-glyph="dayDetail"]')).toHaveCount(0)
  })
})

// ── D7 ───────────────────────────────────────────────────────────────────────────────────────────────────────
test.describe('D7 ⟲ (F2: BR-40 day glyphs, BR-45 tone, M7-D7 spill, FR-807 holiday) · jack', () => {
  test.beforeAll(async () => {
    await resetDb('F2')
  })

  test('Jack 19/10: 1.3 dashed 🔴 Mon–Thu, 🎌 Friday; Mon = 1 → spill to Friday 0.8 ⚠ 🔴, รวม 4.8; footer 🔴', async ({
    page,
  }) => {
    const WEEK: ISODate = '2026-10-19'
    const dates = weekdays(WEEK)
    const fri: ISODate = F2_HOLIDAY.date
    expect(fri).toBe(dates[4])
    const base = FLOW.allocationsCd[WEEK]! // 500 cd WEEK over 4 working days → 125 each
    const grid = await openGrid(page, 'jack', MOBILE)
    const jack = await grid.rowKeyOf(FLOW.name, 'Jack')
    await grid.expandWeek(WEEK)

    // Friday header: 🎌 + holiday tooltip; Friday cells grey and empty
    const friHeader = grid.dayHeader(fri)
    await expect(friHeader.locator('[data-glyph="holiday"]')).toBeAttached()
    await hoverTip(page, friHeader)
    await expect(grid.tooltip()).toContainText(th.grid.header.holiday(F2_HOLIDAY.name))
    const friCell = await grid.revealDay(jack, fri)
    await expect(friCell).toHaveAttribute('data-holiday', 'true')
    await expect(grid.value(friCell)).toHaveText('')

    // Mon–Thu derived 1.25 (shown 1 decimal) with the OVER glyph and its text
    for (const date of dates.slice(0, 4)) {
      const cell = await grid.revealDay(jack, date)
      await expect(grid.value(cell)).toHaveText(d1(base / 4))
      await expect(cell).toHaveAttribute('data-derived', 'true')
      await expect(cell).toHaveAttribute('data-day-level', 'OVER')
      await expect(cell.locator('[data-glyph="over"]')).toBeAttached()
      await expect(cell).toContainText(th.overload.level.OVER)
    }
    const footer = grid.footerLoad(D(dates[0]!))
    await expect(footer).toHaveAttribute('data-tone', 'over')
    await expect(footer.locator('[data-glyph="over"]')).toBeAttached()
    await hoverTip(page, footer)
    await expect(grid.tooltip()).toContainText(th.overload.peopleOver('Jack, Mint'))

    // Mon = 1 → BR-22 total 500 − 125 + 100 = 475; clamp Tue–Thu at 1.0 and spill 0.75 to the holiday (M7-D7)
    await grid.typeInto(await grid.revealDay(jack, dates[0]!), '1')
    await grid.waitSaved()
    await expect(grid.toast(th.grid.day.splitClampedToast)).toBeVisible()
    await expect(grid.toast(th.grid.warn.nonWorkingDay)).toBeVisible()
    for (const date of dates.slice(0, 4)) {
      const cell = await grid.revealDay(jack, date)
      await expect(grid.value(cell)).toHaveText(d1(100))
      await expect(cell).not.toHaveAttribute('data-derived', 'true')
      await expect(cell.locator('[data-glyph="over"]')).toHaveCount(0)
    }
    await expect(grid.value(friCell)).toHaveText(d1(75))
    await expect(friCell.locator('[data-glyph="warn"]')).toBeAttached()
    await expect(friCell.locator('[data-glyph="over"]')).toBeAttached()
    await expectWeekTotal(grid, jack, WEEK, base - base / 4 + 100)

    // the footer day stays OVER: Mint still has 1.25 that day
    await expect(footer.locator('[data-glyph="over"]')).toBeAttached()
    await hoverTip(page, footer)
    await expect(grid.tooltip()).toContainText(th.overload.peopleOver('Mint'))
  })
})

// ── V1 ───────────────────────────────────────────────────────────────────────────────────────────────────────
test.describe('V1 (SPEC §8.12, D19) the sticky รวม header abuts the last whole column · 1920 / 1280 × week / day · jack', () => {
  test.beforeAll(async () => {
    await resetDb()
  })

  for (const width of [1920, 1280] as const) {
    test(`at ${width} px: no clipped sliver beside รวม in week and day zoom, before and after a sub-column scroll`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: width === 1920 ? 1080 : 800 })
      const grid = await openGrid(page, 'jack', MOBILE)
      for (const level of ['week', 'day'] as const) {
        await grid.zoom(level)
        for (const by of [0, 23, 37]) {
          await grid.root().evaluate((el, dx) => {
            el.scrollLeft += dx
          }, by)
          await expect
            .poll(
              async () => {
                const fit = await grid.totalHeaderFit() // period row only (M7.1 adds the month row)
                return fit.gap <= 1 && fit.straddle === 0
              },
              { message: `${level} zoom, scrolled +${by}px` },
            )
            .toBe(true)
        }
      }
      // leave the persisted grid.zoom preference as the other describes expect it
      await grid.zoom('week')
    })
  }
})
