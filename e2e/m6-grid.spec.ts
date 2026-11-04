/**
 * M6 — weekly planning grid (plan/m06-weekly-grid.md §7.3 G1–G15).
 * Determinism (PLAN §4.5, X46): production build, APP_NOW = 2026-09-30 10:00 +07, the browser clock pinned by the
 * auto fixture; every describe marked ⟲ resets planner_e2e in its own beforeAll. Strings come from `th`, numbers via
 * `formatCd`, week labels via `formatWeekHeader`; waits are on data-save-state, toasts or text — never sleeps.
 * Rows and cells are found by data-row-key / data-testid / accessible names only (C27).
 */
import type { Locator, Page, Response } from '@playwright/test'
import type { ISODate } from '../src/domain/types'
import { formatCd } from '../src/domain/units'
import { th } from '../src/i18n/th'
import { formatWeekHeader } from '../src/lib/format'
import {
  expect,
  loginAs,
  openGuardedPage,
  resetDb,
  test,
  waitForServerAction,
  type GoldenLogin,
} from './fixtures'
import { GridPage } from './pages/grid'
import { ProjectPage } from './pages/project'
import { EmployeesPage } from './pages/settings'
import { TaskListPage } from './pages/tasks'
import { TeamTasksPage } from './pages/team-tasks'
import { toastWith, undoButtonOf } from './pages/toast'

const POS = 'POS Upgrade'
const DW = 'Data Warehouse'
const MOBILE = 'Mobile App Revamp'
const CRM = 'CRM Migration'
const STORE = 'Store Analytics Dashboard'
const R1 = 'ปรับปรุงระบบ POS หน้าร้าน'
const UAT = 'ทำ UAT + คู่มือหน้าร้าน'
const ROLLOUT = 'Rollout สาขา'
const CRM_CINDY = 'ย้ายข้อมูลลูกค้า'
const DW_TASK = 'ย้าย pipeline ขึ้น BigQuery'

const d1 = (cd: number) => formatCd(cd, { unit: 'DAYS', decimals: 1 })
const W = (week: ISODate) => `W:${week}` as const

async function openGrid(page: Page, who: GoldenLogin, project: string): Promise<GridPage> {
  await loginAs(page, who)
  const grid = new GridPage(page)
  await grid.goto(project)
  return grid
}

async function openTasks(page: Page, who: GoldenLogin, project: string): Promise<TaskListPage> {
  await loginAs(page, who)
  const tasks = new TaskListPage(page)
  await tasks.shell.goto('/home')
  await tasks.gotoProject(project)
  return tasks
}

/** Shows the grid's shared tooltip for `target` (the pointer first leaves, so a fresh pointerover fires). */
async function hoverTip(page: Page, target: Locator): Promise<void> {
  await page.mouse.move(0, 0)
  await target.hover()
}

async function expectValue(grid: GridPage, rowKey: string, week: ISODate, text: string): Promise<void> {
  const cell = await grid.reveal(rowKey, week)
  await expect(grid.value(cell)).toHaveText(text)
}

/**
 * The column header starts right after the sticky frozen columns (± the grid's 1 px border). M7.1: the frozen area is
 * งาน + ผู้รับผิดชอบ (FR-816), measured from its two header cells instead of M6's single name-column constant.
 */
async function expectRightOfNames(grid: GridPage, header: Locator, gridX: number): Promise<void> {
  const frozen = await grid.frozenWidth()
  await expect
    .poll(async () => Math.abs((await header.boundingBox())!.x - gridX - frozen))
    .toBeLessThanOrEqual(2)
}

// ── G1 ───────────────────────────────────────────────────────────────────────────────────────────────────────
test.describe('G1 ⟲ (FR-408, FR-801, FR-802 week, toolbar) tab, timeline and chunks · cindy', () => {
  test.beforeAll(async () => {
    await resetDb()
  })

  test('แผนงาน is the 2nd tab; the grid opens at 31/8; scrolling right loads later chunks; วันนี้ puts 28/9 first', async ({
    page,
  }) => {
    await loginAs(page, 'cindy')
    const grid = new GridPage(page)
    const project = new ProjectPage(page)
    await grid.shell.goto('/home')
    await grid.sidebar.projectLink(POS).click()
    await page.waitForURL(/\/projects\/[0-9a-f-]{36}\/overview$/)
    await expect(project.tabs()).toHaveText([
      th.projects.tabs.overview,
      th.projects.tabs.plan,
      th.projects.tabs.tasks,
      th.projects.tabs.pages,
    ])
    await grid.openTab(POS)

    // toolbar: [สัปดาห์] pressed; M7 (S5.3, FR-802 complete): [วัน] present, not pressed
    await expect(grid.zoomWeek()).toHaveAttribute('aria-pressed', 'true')
    await expect(grid.zoomDay()).toBeVisible()
    await expect(grid.zoomDay()).toHaveAttribute('aria-pressed', 'false')

    // first visible week (right after the sticky name column) = today − 4 weeks
    const gridBox = (await grid.root().boundingBox())!
    const first = grid.columnHeader('2026-08-31')
    await expect(first).toHaveText(formatWeekHeader('2026-08-31'))
    await expectRightOfNames(grid, first, gridBox.x)

    // scrolling right 20 weeks requests the next chunk (the first 20 weeks after the window are already loaded)
    const later: Promise<Response> = page.waitForResponse(
      /\/api\/grid\/project\/[0-9a-f-]{36}\?.*from=2027-04-12/,
    )
    await grid.root().hover({ position: { x: (await grid.frozenWidth()) + 100, y: 120 } })
    await page.mouse.wheel(20 * 64, 0)
    expect((await later).status()).toBe(200)
    await expect(grid.columnHeader('2027-04-12')).toHaveText(formatWeekHeader('2027-04-12'))

    // วันนี้ → 28/9 is the first column after the name column
    await grid.today()
    const today = grid.columnHeader('2026-09-28')
    await expect(today).toContainText(formatWeekHeader('2026-09-28')) // + the hidden "สัปดาห์นี้" mark
    await expectRightOfNames(grid, today, gridBox.x)
  })
})

// ── G2 ───────────────────────────────────────────────────────────────────────────────────────────────────────
test.describe('G2 ⟲ (AC-801, FR-805, X76, A11Y-2b) keyboard range fill · cindy', () => {
  test.describe.configure({ mode: 'serial' })
  test.beforeAll(async () => {
    await resetDb()
  })

  test('keyboard only: 6 weeks × 3 in one save; รวม 18.0; same after reload', async ({ page }) => {
    const grid = await openGrid(page, 'cindy', CRM)
    const cindy = await grid.rowKeyOf(CRM_CINDY, 'Cindy')
    // the roving cell is the home cell: the first row, this week (28/9); Tab from the toolbar's last control enters it
    const home = grid.root().locator('[role="gridcell"][tabindex="0"]')
    await expect(home).toHaveAttribute('data-testid', `cell-${cindy}-W:2026-09-28`)
    await grid.lastToolbarControl().focus()
    await grid.press('Tab')
    await expect(grid.cell(cindy, '2026-09-28')).toBeFocused()
    await grid.press('ArrowRight')
    await expect(grid.cell(cindy, '2026-10-05')).toBeFocused()
    for (let i = 0; i < 5; i++) await grid.press('Shift+ArrowRight')
    const calls = await grid.countServerActions(async () => {
      await page.keyboard.type('3')
      await grid.press('Enter')
      await expect(grid.root()).not.toHaveAttribute('data-save-state', 'idle')
      await grid.waitSaved()
    })
    expect(calls).toBe(1)
    const weeks = ['2026-10-05', '2026-10-12', '2026-10-19', '2026-10-26', '2026-11-02', '2026-11-09']
    for (const w of weeks) await expectValue(grid, cindy, w, d1(300))
    await expect(grid.selectedCells()).toHaveCount(6)
    await expect(grid.total(cindy)).toHaveText(d1(1800))

    await grid.reload()
    for (const w of weeks) await expectValue(grid, cindy, w, d1(300))
    await expect(grid.total(cindy)).toHaveText(d1(1800))
  })

  test('§8.9 roving Tab stop: after ▶ scrolls the timeline, Tab from the toolbar still enters the grid', async ({
    page,
  }) => {
    const grid = await openGrid(page, 'cindy', CRM)
    const cindy = await grid.rowKeyOf(CRM_CINDY, 'Cindy')
    const next = grid.toolbar().getByRole('button', { name: th.grid.toolbar.next, exact: true })

    // nothing focused yet: ▶ ×3 (4 weeks each from 31/8) moves the Tab stop with the first visible column → 23/11
    await next.focus()
    for (let i = 0; i < 3; i++) await grid.press('Enter')
    await expect(grid.columnHeader('2026-11-23')).toBeAttached()
    await grid.lastToolbarControl().focus()
    await grid.press('Tab')
    await expect(grid.cell(cindy, '2026-11-23')).toBeFocused()

    // a focused cell scrolled out of the rendered window by ▶ ×6: the grid root takes the Tab stop and hands focus
    // back to that cell (scrolled into view again)
    await grid.press('ArrowRight')
    const focused = grid.cell(cindy, '2026-11-30')
    await expect(focused).toBeFocused()
    await next.focus()
    for (let i = 0; i < 6; i++) await grid.press('Enter')
    await expect(focused).toHaveCount(0)
    await expect(grid.root()).toHaveAttribute('tabindex', '0')
    await grid.lastToolbarControl().focus()
    await grid.press('Tab')
    await expect(focused).toBeFocused()
    await expect(focused).toBeInViewport()
  })

  test('FR-643 / X76: a blocker added in the M3 panel shows ⛔ on the grid row, naming the blocker', async ({
    page,
  }) => {
    const tasks = await openTasks(page, 'cindy', POS)
    await tasks.openPanel(ROLLOUT)
    await tasks.addBlockerInPanel(UAT)
    const grid = new GridPage(page)
    await grid.openTab(POS)
    // v3.9: the default 240 px column has no room for "รอ 1 งาน": the chip is icon-only, same name and same tooltip
    const badge = grid
      .rowHeader(ROLLOUT, 'Mint')
      .getByRole('img', { name: th.tasks.blockers.badgeWaiting(1), exact: true })
    await expect(badge).toBeVisible()
    await badge.hover()
    await expect(page.getByRole('tooltip')).toContainText(UAT)
  })
})

// ── G3 ───────────────────────────────────────────────────────────────────────────────────────────────────────
test.describe('G3 ⟲ F3 (AC-802) f and h use the cell’s own capacity · peter', () => {
  test.beforeAll(async () => {
    await resetDb('F3')
  })

  test('f on a week with 2 days of leave → 3.0 (leave glyph + own type name); h → 1.5; footer capacity 3.0', async ({
    page,
  }) => {
    const grid = await openGrid(page, 'peter', DW)
    const row = await grid.rowKeyOf(DW_TASK, 'Peter')
    const cell = await grid.reveal(row, '2026-10-05')
    await expect(grid.value(cell)).toHaveText(d1(500))
    await cell.click()
    await grid.press('f')
    await grid.waitSaved()
    await expect(grid.value(cell)).toHaveText(d1(300))
    await expect(cell).toHaveAttribute('data-leave', 'true')
    await expect(cell.locator('[data-glyph="leave"]')).toBeAttached()
    await hoverTip(page, cell)
    await expect(grid.tooltip()).toContainText('ลาพักร้อน')
    await grid.press('h')
    await grid.waitSaved()
    await expect(grid.value(cell)).toHaveText(d1(150))
    await expect(grid.footerCapacity(W('2026-10-05'))).toHaveText(d1(300))
  })
})

// ── G4 ───────────────────────────────────────────────────────────────────────────────────────────────────────
test.describe('G4 ⟲ (AC-803, FR-804) paste a 2×4 fraction block, copy it back in days · cindy', () => {
  test.beforeAll(async () => {
    await resetDb()
  })

  test('fraction paste → 8 cells; days view; exact TSV copy', async ({ page }) => {
    const grid = await openGrid(page, 'cindy', POS)
    const cindy = await grid.rowKeyOf(R1, 'Cindy')
    const ivy = await grid.rowKeyOf(UAT, 'Ivy')
    const weeks = ['2026-11-09', '2026-11-16', '2026-11-23', '2026-11-30'] as const
    await grid.setUnit('FRACTION')
    const start = await grid.reveal(cindy, weeks[0])
    await start.click()
    await grid.paste('0.5\t1\t0.75\t0.25\r\n1\t0.5\t0.25\t0.75\r\n')
    await grid.waitSaved()
    await expect(grid.toast(th.grid.toast.pasted(8))).toBeVisible()
    const frac = [
      ['0.50', '1.00', '0.75', '0.25'],
      ['1.00', '0.50', '0.25', '0.75'],
    ]
    for (const [i, w] of weeks.entries()) {
      await expectValue(grid, cindy, w, frac[0]![i]!)
      await expectValue(grid, ivy, w, frac[1]![i]!)
    }

    await grid.setUnit('DAYS')
    const days = [
      [d1(250), d1(500), d1(375), d1(125)],
      [d1(500), d1(250), d1(125), d1(375)],
    ]
    for (const [i, w] of weeks.entries()) {
      await expectValue(grid, cindy, w, days[0]![i]!)
      await expectValue(grid, ivy, w, days[1]![i]!)
    }
    await grid.select(grid.cell(cindy, weeks[0]), grid.cell(ivy, weeks[3]))
    await expect(grid.selectedCells()).toHaveCount(8)
    expect(await grid.copy()).toBe('2.50\t5.00\t3.75\t1.25\r\n5.00\t2.50\t1.25\t3.75')
  })
})

// ── G5 ───────────────────────────────────────────────────────────────────────────────────────────────────────
test.describe('G5 ⟲ (AC-805, §7.5) three edits, three undos, reload', () => {
  test.beforeAll(async () => {
    await resetDb()
  })

  test('Cmd+Z ×3 reverts in reverse order; after reload the values stay and redo does nothing', async ({
    page,
  }) => {
    const grid = await openGrid(page, 'cindy', POS)
    const cindy = await grid.rowKeyOf(R1, 'Cindy')
    const [a, b, c] = ['2026-08-31', '2026-09-07', '2026-09-14'] as const
    await grid.typeInto(await grid.reveal(cindy, a), '1')
    await grid.typeInto(await grid.reveal(cindy, b), '2')
    await grid.typeInto(await grid.reveal(cindy, c), '3')
    await grid.waitSaved()
    await expectValue(grid, cindy, a, d1(100))
    await expectValue(grid, cindy, b, d1(200))
    await expectValue(grid, cindy, c, d1(300))

    await grid.press('ControlOrMeta+z')
    await expectValue(grid, cindy, c, d1(375))
    await grid.waitSaved()
    await grid.press('ControlOrMeta+z')
    await expectValue(grid, cindy, b, d1(500))
    await grid.waitSaved()
    await grid.press('ControlOrMeta+z')
    await expectValue(grid, cindy, a, d1(500))
    await grid.waitSaved()

    await grid.reload()
    await expectValue(grid, cindy, a, d1(500))
    await expectValue(grid, cindy, b, d1(500))
    await expectValue(grid, cindy, c, d1(375))
    const cell = await grid.reveal(cindy, a)
    await cell.click()
    const calls = await grid.countServerActions(async () => {
      await grid.press('ControlOrMeta+Shift+z')
      await grid.waitSaved()
    })
    expect(calls).toBe(0)
    await expectValue(grid, cindy, a, d1(500))
  })
})

// ── G6 ───────────────────────────────────────────────────────────────────────────────────────────────────────
// M7 (S5.3, X27 → BR-24): the M6 "DAY week is read-only" skip is gone — a WEEK value on the DAY week opens the BR-24
// dialog (Cancel keeps it), Delete clears it without a dialog (M7-D5) and Cmd+Z restores the 7-day snapshot.
test.describe('G6 ⟲ (X27 → BR-24, BR-20a, §4.8 การลบ) DAY weeks: BR-24 dialog, Delete + undo · ivy', () => {
  test.beforeAll(async () => {
    await resetDb()
  })

  test('FR-612 on 11-11..11-13 makes a DAY week (⋯ + day tooltip); typing opens BR-24 once, Delete clears it', async ({
    page,
  }) => {
    const tasks = await openTasks(page, 'ivy', POS)
    await tasks.openPanel(UAT)
    const dialog = await tasks.planFor('Ivy', UAT)
    await dialog.fill('2', '2026-11-11', '2026-11-13')
    await dialog.apply()
    await expect(tasks.toast(th.plan.applied(d1(200), 'Ivy'))).toBeVisible()

    const grid = new GridPage(page)
    await grid.openTab(POS)
    const ivy = await grid.rowKeyOf(UAT, 'Ivy')
    const dayCell = await grid.reveal(ivy, '2026-11-09')
    const expectDayWeek = async () => {
      await expectValue(grid, ivy, '2026-11-09', d1(200))
      await expect(dayCell).toHaveAttribute('data-resolution', 'DAY')
      await expect(dayCell.locator('[data-glyph="dayDetail"]')).toBeAttached()
    }
    await expectDayWeek()
    await hoverTip(page, dayCell)
    await expect(grid.tooltip()).toContainText(th.grid.cell.dayTooltip('พ 0.67 · พฤ 0.67 · ศ 0.66'))

    // range typing: 11-02 and 11-16 are written, the DAY week 11-09 asks once (BR-24) → Cancel keeps it
    await grid.select(grid.cell(ivy, '2026-11-02'), grid.cell(ivy, '2026-11-16'))
    await page.keyboard.type('1')
    await grid.press('Enter')
    const br24 = grid.br24()
    await expect(br24.root).toHaveCount(1)
    await expect(br24.root).toContainText(th.grid.br24.title(1))
    await expect(br24.root).toContainText(th.grid.br24.change(d1(200), d1(100)))
    await br24.cancel()
    await grid.waitSaved()
    await expectValue(grid, ivy, '2026-11-02', d1(100))
    await expectDayWeek()
    await expectValue(grid, ivy, '2026-11-16', d1(100))

    // Delete on the DAY week clears it — no dialog (M7-D5); Cmd+Z restores 2.0 + ⋯ (complete 7-day snapshot)
    await grid.cell(ivy, '2026-11-09').click()
    await grid.press('Delete')
    await grid.waitSaved()
    await expect(br24.root).toHaveCount(0)
    await expectValue(grid, ivy, '2026-11-09', '')
    await grid.press('ControlOrMeta+KeyZ')
    await grid.waitSaved()
    await expect(br24.root).toHaveCount(0)
    await expectDayWeek()

    await grid.cell(ivy, '2026-11-16').click()
    await grid.press('Delete')
    await grid.waitSaved()
    await expectValue(grid, ivy, '2026-11-16', '')
  })
})

// ── G7 ───────────────────────────────────────────────────────────────────────────────────────────────────────
test.describe('G7 ⟲ (§4.8 การลบ, KEY-05, ? help) task rows in the grid · cindy', () => {
  test.beforeAll(async () => {
    await resetDb()
  })

  test('N adds a task; + คน assigns; × unassigns with undo; Delete removes the task, Cmd+Z restores it; ?', async ({
    page,
  }) => {
    const grid = await openGrid(page, 'cindy', POS)
    const tasks = new TaskListPage(page)
    await grid.cell(await grid.rowKeyOf(R1, 'Cindy'), '2026-09-28').click()
    await grid.press('n')
    const quick = grid.root().getByRole('textbox', { name: th.grid.row.addTaskLabel })
    await expect(quick).toBeFocused()
    const created = waitForServerAction(page)
    await page.keyboard.type('งาน G7')
    await grid.press('Enter')
    await created
    await grid.press('Escape')
    const row = grid.rowHeader('งาน G7')
    await expect(row).toBeVisible()
    await expect(row).toContainText(th.grid.row.unassigned)

    await row.hover()
    await row.getByRole('button', { name: th.grid.row.addPersonLabel('งาน G7') }).click()
    await expect(tasks.pickerInput()).toBeFocused()
    await tasks.pickAssignee('Ivy')
    // The row re-keys t:→a: when Ivy merges into it; the picker must survive that and keep focus.
    await expect(tasks.pickerInput()).toBeFocused()
    await tasks.closePicker()
    // (the modal picker hides the grid from the a11y tree, so the row key is read once it has closed)
    const merged = await grid.rowKeyOf('งาน G7', 'Ivy')
    // Closing returns focus to a cell of the merged row (not to <body>).
    await expect(page.locator(`[data-row-key="${merged}"] [data-cell]:focus`)).toHaveCount(1)
    await grid.typeInto(await grid.reveal(merged, '2026-11-16'), '2')
    await grid.waitSaved()
    await expectValue(grid, merged, '2026-11-16', d1(200))

    const unassigned = th.tasks.toast.unassigned('Ivy')
    let answered = waitForServerAction(page)
    await grid.rowHeader('งาน G7', 'Ivy').hover()
    await grid
      .rowHeader('งาน G7', 'Ivy')
      .getByRole('button', { name: th.grid.row.removeAssignee('Ivy') })
      .click()
    await answered
    await expect(toastWith(page, unassigned)).toBeVisible()
    await expect(grid.rowHeader('งาน G7')).toContainText(th.grid.row.unassigned)
    answered = waitForServerAction(page)
    await undoButtonOf(page, unassigned).click()
    await answered
    await expectValue(grid, await grid.rowKeyOf('งาน G7', 'Ivy'), '2026-11-16', d1(200))

    const deleted = th.tasks.toast.deleted('งาน G7')
    await grid.selectRow('งาน G7', 'Ivy')
    answered = waitForServerAction(page)
    await grid.press('Delete')
    await answered
    await expect(toastWith(page, deleted)).toBeVisible()
    await expect(grid.rowHeader('งาน G7', 'Ivy')).toHaveCount(0)
    answered = waitForServerAction(page)
    await grid.press('ControlOrMeta+z')
    await answered
    await expectValue(grid, await grid.rowKeyOf('งาน G7', 'Ivy'), '2026-11-16', d1(200))

    // v3.9: selecting the row opened the panel beside the grid, which leaves too few week columns to reach 28/9
    await tasks.panel().getByRole('button', { name: th.tasks.panel.close, exact: true }).click()
    await expect(tasks.panel()).toHaveCount(0)
    await grid.cell(await grid.rowKeyOf(R1, 'Cindy'), '2026-09-28').click()
    await grid.press('Shift+Slash')
    const help = tasks.helpDialog()
    await expect(help).toBeVisible()
    await expect(help).toContainText(th.shortcuts.scopes.grid)
    await expect(help).toContainText(th.shortcuts.items.gridFull)
  })
})

// ── G8 ───────────────────────────────────────────────────────────────────────────────────────────────────────
test.describe('G8 ⟲ (FR-405, FR-806, FR-809, X29) load views, certainty, other projects · cindy', () => {
  test.beforeAll(async () => {
    await resetDb()
  })

  test('committed view hides tentative CRM; certainty → แน่นอน updates without reload; other projects numbers only', async ({
    page,
  }) => {
    const grid = await openGrid(page, 'cindy', CRM)
    const project = new ProjectPage(page)
    await page.evaluate(() => {
      ;(window as unknown as { __noReload: number }).__noReload = 1
    })
    await grid.setView('COMMITTED')
    await expect(grid.footerLoad(W('2026-10-12'))).toHaveText('')

    await project.openTab('overview')
    await project.setCertainty('CONFIRMED')
    await grid.openTab(CRM)
    await expect(grid.footerLoad(W('2026-10-12'))).toHaveText(d1(500))
    expect(await page.evaluate(() => (window as unknown as { __noReload?: number }).__noReload)).toBe(1)
    await expect(grid.footerLoadLabel('Cindy, Ivy')).toBeVisible()
    await expect(grid.footerCapacity(W('2026-10-12'))).toHaveText(d1(1000))
    await expect(grid.footerUtil(W('2026-10-12'))).toHaveText(th.grid.footer.percent(50))

    await expect(grid.footerLoad(W('2026-09-28'))).toHaveText('')
    const others = page.waitForResponse(/\/api\/grid\/project\/[0-9a-f-]{36}\?.*includeOthers=1/)
    await grid.includeOthers(true)
    const body = await (await others).text()
    await expect(grid.footerLoad(W('2026-09-28'))).toHaveText(d1(500))
    expect(body).not.toContain(POS)
    for (const name of [R1, UAT, ROLLOUT]) expect(body).not.toContain(name)
  })
})

// ── G9 ───────────────────────────────────────────────────────────────────────────────────────────────────────
test.describe('G9 ⟲ (FR-612, AC-603 plans, BR-25) plan a range, delete + undo the tree · cindy', () => {
  test.beforeAll(async () => {
    await resetDb()
  })

  test('10 days over 11-11..11-24 → 3.0⋯ / 5.0 / 2.0⋯; deleting the parent and undoing brings the plan back', async ({
    page,
  }) => {
    const tasks = await openTasks(page, 'cindy', POS)
    await tasks.addTree('แม่ G9', ['ลูก 1', 'ลูก 2', 'ลูก 3'])
    await tasks.openAssigneePicker('ลูก 2')
    await tasks.pickAssignee('Ivy')
    await tasks.closePicker()
    await tasks.openPanel('ลูก 2')
    const dialog = await tasks.planFor('Ivy', 'ลูก 2')
    await dialog.fill('10', '2026-11-11', '2026-11-24')
    expect(await dialog.previewRows()).toEqual([
      [formatWeekHeader('2026-11-09'), th.plan.kind.BOUNDARY],
      [formatWeekHeader('2026-11-16'), th.plan.kind.WHOLE],
      [formatWeekHeader('2026-11-23'), th.plan.kind.BOUNDARY],
    ])
    await expect(dialog.root()).toContainText(th.plan.capacityInRange(d1(1000)))
    await dialog.apply()
    await expect(tasks.toast(th.plan.applied(d1(1000), 'Ivy'))).toBeVisible()

    const grid = new GridPage(page)
    const expectPlan = async () => {
      const row = await grid.rowKeyOf('ลูก 2', 'Ivy')
      await expectValue(grid, row, '2026-11-09', d1(300))
      await expect(grid.cell(row, '2026-11-09')).toHaveAttribute('data-resolution', 'DAY')
      await expectValue(grid, row, '2026-11-16', d1(500))
      await expect(grid.cell(row, '2026-11-16')).toHaveAttribute('data-resolution', 'WEEK')
      await expectValue(grid, row, '2026-11-23', d1(200))
      await expect(grid.cell(row, '2026-11-23')).toHaveAttribute('data-resolution', 'DAY')
    }
    await grid.openTab(POS)
    await expectPlan()

    await tasks.openTab()
    const answered = waitForServerAction(page)
    await tasks.row('แม่ G9').click()
    await tasks.press('แม่ G9', 'Delete')
    await answered
    const deleted = th.tasks.toast.deletedWithChildren('แม่ G9', 3)
    await expect(toastWith(page, deleted)).toBeVisible()
    const restored = waitForServerAction(page)
    await undoButtonOf(page, deleted).click()
    await restored
    await expect(tasks.row('ลูก 2')).toBeVisible()
    await grid.openTab(POS)
    await expectPlan()
    await grid.reload()
    await expectPlan()
  })
})

// ── G10 ──────────────────────────────────────────────────────────────────────────────────────────────────────
test.describe('G10 ⟲ (AC-604 M6 part) two people on one task · jack', () => {
  test.beforeAll(async () => {
    await resetDb()
  })

  test('Jack 3 + Mint 2 in 11-16..11-20: task row 5.0, person rows 3.0 / 2.0, footer 5.0', async ({
    page,
  }) => {
    const tasks = await openTasks(page, 'jack', MOBILE)
    await tasks.addTasks(['งาน AC604'])
    await tasks.settledId('งาน AC604')
    await tasks.openAssigneePicker('งาน AC604')
    await tasks.pickAssignee('Jack')
    await tasks.pickAssignee('Mint')
    await tasks.closePicker()
    await tasks.openPanel('งาน AC604')
    let dialog = await tasks.planFor('Jack', 'งาน AC604')
    await dialog.fill('3', '2026-11-16', '2026-11-20')
    await dialog.apply()
    dialog = await tasks.planFor('Mint', 'งาน AC604')
    await dialog.fill('2', '2026-11-16', '2026-11-20')
    await dialog.apply()

    const grid = new GridPage(page)
    await grid.openTab(MOBILE)
    const task = await grid.rowKeyOf('งาน AC604')
    expect(task.startsWith('t:')).toBe(true)
    await expect(grid.cell(task, '2026-11-16')).toBeAttached()
    await expectValue(grid, task, '2026-11-16', d1(500))
    await expectValue(grid, await grid.rowKeyOf('งาน AC604', 'Jack'), '2026-11-16', d1(300))
    await expectValue(grid, await grid.rowKeyOf('งาน AC604', 'Mint'), '2026-11-16', d1(200))
    await expect(grid.footerLoad(W('2026-11-16'))).toHaveText(d1(500))
  })
})

// ── G11 ──────────────────────────────────────────────────────────────────────────────────────────────────────
test.describe('G11 ⟲ (AC-203 grid clause) a deactivated person stays on the plan · manager', () => {
  test.beforeAll(async () => {
    await resetDb()
  })

  test('Cindy deactivated: her row keeps the task with "(ปิดใช้งาน)" and 5.0; capacity drops; still editable', async ({
    page,
  }) => {
    await loginAs(page, 'manager')
    const employees = new EmployeesPage(page)
    await employees.goto()
    const deactivated = waitForServerAction(page)
    await employees.rowAction('Cindy', th.employees.actions.deactivate)
    await deactivated
    await expect(employees.statusChip('Cindy', 'deactivated')).toBeVisible()

    const grid = new GridPage(page)
    await grid.goto(POS)
    const header = grid.rowHeader(R1, 'Cindy')
    await expect(header).toContainText(th.users.deactivatedSuffix)
    const cindy = await grid.rowKeyOf(R1, 'Cindy')
    await expectValue(grid, cindy, '2026-08-31', d1(500))
    await expect(grid.footerCapacity(W('2026-10-05'))).toHaveText(d1(1000))
    await expect(grid.cell(cindy, '2026-08-31')).not.toHaveAttribute('aria-readonly', 'true')
  })
})

// ── G12 ──────────────────────────────────────────────────────────────────────────────────────────────────────
test.describe('G12 ⟲ (BR-52 on every path, FR-406 X) released load in the toasts', () => {
  test.describe.configure({ mode: 'serial' })
  test.beforeAll(async () => {
    await resetDb()
  })

  test('cindy: list tick, board drag and /tasks drag show the released load; the grid fades the done week', async ({
    page,
  }) => {
    const tasks = await openTasks(page, 'cindy', POS)

    const rollout = th.tasks.toast.released(d1(1875), 5)
    let answered = waitForServerAction(page)
    await tasks.checkbox(ROLLOUT).click()
    await answered
    await expect(toastWith(page, rollout)).toBeVisible()
    answered = waitForServerAction(page)
    await undoButtonOf(page, rollout).click()
    await answered
    await tasks.expectCompleted(ROLLOUT, false)

    await tasks.setView('board')
    await tasks.dragCard(UAT, th.tasks.status.defaults.done)
    await expect(toastWith(page, th.tasks.toast.released(d1(125), 1))).toBeVisible()

    const team = new TeamTasksPage(page)
    await team.goto()
    await expect(team.board.board()).toBeVisible() // tasks.view = BOARD is shared with the project tab (X74)
    await team.board.dragCard(CRM_CINDY, th.tasks.status.categories.DONE)
    await expect(toastWith(page, th.tasks.toast.released(d1(1500), 5))).toBeVisible()

    const grid = new GridPage(page)
    await grid.goto(POS)
    const show = grid.showCompletedSwitch()
    if (!(await show.isChecked())) await show.click()
    await expect(show).toBeChecked()
    const ivy = await grid.rowKeyOf(UAT, 'Ivy')
    const done = await grid.reveal(ivy, '2026-10-05')
    await expect(done).toHaveAttribute('data-not-counted', 'true')
    await hoverTip(page, done)
    await expect(grid.tooltip()).toContainText(th.grid.cell.notCounted)
    await expect(grid.footerLoad(W('2026-10-05'))).toHaveText('')
    // BR-51: the undone Rollout counts again — its cell is not faded and the footer holds its 5.0 (r8 §6.3)
    const mint = await grid.rowKeyOf(ROLLOUT, 'Mint')
    const counted = await grid.reveal(mint, '2026-12-14')
    await expect(counted).not.toHaveAttribute('data-not-counted', 'true')
    await expect(grid.footerLoad(W('2026-12-14'))).toHaveText(d1(500))
  })

  test('manager: archiving Store names the 35.0 person-days it releases', async ({ page }) => {
    await loginAs(page, 'manager')
    const grid = new GridPage(page)
    const project = new ProjectPage(page)
    await grid.shell.goto('/home')
    await grid.sidebar.projectLink(STORE).click()
    await page.waitForURL(/\/projects\/[0-9a-f-]{36}\/overview$/)
    const answered = waitForServerAction(page)
    await project.archiveButton().click()
    await answered
    await expect(toastWith(page, th.projects.toasts.archivedReleased(STORE, d1(3500)))).toBeVisible()
  })
})

// ── G13 ──────────────────────────────────────────────────────────────────────────────────────────────────────
test.describe('G13 ⟲ (§7.4 rollback) a failed save reverts and retries · cindy', () => {
  test.use({ allowedConsoleErrors: [/status of 500/] })
  test.beforeAll(async () => {
    await resetDb()
  })

  test('500 → the cell reverts with "ลองใหม่"; retry saves; reload keeps 4.0', async ({ page }) => {
    const grid = await openGrid(page, 'cindy', POS)
    const cindy = await grid.rowKeyOf(R1, 'Cindy')
    let failed = false
    await page.route('**/*', async (route) => {
      const req = route.request()
      if (!failed && req.method() === 'POST' && req.headers()['next-action']) {
        failed = true
        await route.fulfill({ status: 500, body: 'boom' })
        return
      }
      await route.fallback()
    })
    const cell = await grid.reveal(cindy, '2026-08-31')
    await grid.typeInto(cell, '4')
    await expect(grid.value(cell)).toHaveText(d1(400))
    await expect(grid.root()).toHaveAttribute('data-save-state', 'error')
    await expect(grid.value(cell)).toHaveText(d1(500))
    const toast = grid.toast(th.grid.toast.saveFailed)
    await expect(toast).toBeVisible()
    await page.unroute('**/*')

    const answered = waitForServerAction(page)
    await toast.getByRole('button', { name: th.grid.toast.retry, exact: true }).click()
    await answered
    await grid.waitSaved()
    await expect(grid.value(cell)).toHaveText(d1(400))
    await grid.reload()
    await expectValue(grid, cindy, '2026-08-31', d1(400))
  })

  test('an edit still in the 400 ms debounce is flushed when the user switches tab (§7.4 route change)', async ({
    page,
  }) => {
    const grid = await openGrid(page, 'cindy', POS)
    const project = new ProjectPage(page)
    const cindy = await grid.rowKeyOf(R1, 'Cindy')
    const cell = await grid.reveal(cindy, '2026-09-07')
    await expect(grid.value(cell)).toHaveText(d1(500))
    const saved = waitForServerAction(page)
    await grid.typeInto(cell, '2')
    await expect(grid.root()).toHaveAttribute('data-save-state', 'pending') // not sent yet
    // Unmounts the grid inside the debounce window. This asserts the edit is not lost; it does not tell the
    // unmount flush apart from the debounce timer firing after unmount (save-queue.test.tsx covers the flush itself).
    await project.openTab('tasks')
    const response = await saved
    expect(response.ok()).toBe(true)
    await grid.openTab(POS)
    await expectValue(grid, cindy, '2026-09-07', d1(200))
    await grid.reload()
    await expectValue(grid, cindy, '2026-09-07', d1(200))
  })
})

// ── G14 ──────────────────────────────────────────────────────────────────────────────────────────────────────
test.describe('G14 ⟲ (VERSION_CONFLICT) two people edit the same cell · cindy + ivy', () => {
  test.beforeAll(async () => {
    await resetDb()
  })

  test('the stale save shows the conflict toast and the latest value', async ({ page, browser }) => {
    const cindyGrid = await openGrid(page, 'cindy', POS)
    const other = await openGuardedPage(browser)
    try {
      const ivyGrid = await openGrid(other.page, 'ivy', POS)
      const ivyRow = await ivyGrid.rowKeyOf(UAT, 'Ivy')
      await ivyGrid.typeInto(await ivyGrid.reveal(ivyRow, '2026-09-14'), '1')
      await ivyGrid.waitSaved()
      await expectValue(ivyGrid, ivyRow, '2026-09-14', d1(100))

      const row = await cindyGrid.rowKeyOf(UAT, 'Ivy')
      await expectValue(cindyGrid, row, '2026-09-14', d1(250)) // stale
      await cindyGrid.typeInto(await cindyGrid.reveal(row, '2026-09-14'), '2')
      await expect(cindyGrid.toast(th.grid.toast.conflict)).toBeVisible()
      await cindyGrid.waitSaved()
      await expectValue(cindyGrid, row, '2026-09-14', d1(100))
      await cindyGrid.reload()
      await expectValue(cindyGrid, row, '2026-09-14', d1(100))
    } finally {
      await other.close()
    }
  })
})

// ── G15 ──────────────────────────────────────────────────────────────────────────────────────────────────────
test.describe('G15 ⟲ syntheticGrid (§9 smoke, M6-D22) 220 rows stay virtualised and fast · cindy', () => {
  test.beforeAll(async () => {
    await resetDb(undefined, { syntheticGrid: true })
  })

  test('first data → painted < 600 ms; keydown → cell text < 100 ms; < 60 rendered rows', async ({
    page,
  }) => {
    const grid = await openGrid(page, 'cindy', 'Perf grid')
    const paint = await page.evaluate(() => {
      const m = performance.measure('grid', 'grid:first-data', 'grid:painted')
      return m.duration
    })
    console.log(`G15 grid first data → painted: ${paint.toFixed(1)} ms`)
    expect(paint).toBeLessThan(600)

    const rows = await grid.renderedRows().count()
    console.log(`G15 rendered rows: ${rows}`)
    expect(rows).toBeLessThan(60)

    const cell = grid
      .root()
      .locator('[role="gridcell"][data-cell][data-today="true"]:not([aria-readonly])')
      .first()
    await cell.click()
    await page.keyboard.type('1')
    // keydown(Enter) → the committed number in the cell, observed in the page (no Playwright round trips inside)
    await cell.evaluate((el, expected) => {
      const w = window as unknown as { __g15: Promise<number> }
      w.__g15 = new Promise<number>((resolve) => {
        let start = 0
        el.ownerDocument.addEventListener(
          'keydown',
          (e) => {
            if (e.key === 'Enter') start = performance.now()
          },
          { capture: true, once: true },
        )
        const done = () => {
          const v = el.querySelector('[data-cell-value]')
          if (start > 0 && v?.textContent === expected) {
            obs.disconnect()
            resolve(performance.now() - start)
          }
        }
        const obs = new MutationObserver(done)
        obs.observe(el, { subtree: true, childList: true, characterData: true })
      })
    }, d1(100))
    await grid.press('Enter')
    const typed = await page.evaluate(() => (window as unknown as { __g15: Promise<number> }).__g15)
    console.log(`G15 keydown(Enter) → cell text: ${typed.toFixed(1)} ms`)
    expect(typed).toBeLessThan(100)
    await expect(grid.value(cell)).toHaveText(d1(100))
    await grid.waitSaved()
  })
})
