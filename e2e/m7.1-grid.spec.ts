/**
 * M7.1 — ปรับกริดแผนงานโปรเจค (plan/m07.1-grid-improvements.md §7.3 P1–P10, S6; SPEC §4.8.1 AC-806…813).
 * Determinism (PLAN §4.5, X45/X46): production build, APP_NOW = 2026-09-30 10:00 +07, the browser clock pinned by the
 * auto fixture before the first goto; every describe resets planner_e2e (F1 golden) in its own beforeAll. Strings come
 * from `th`, numbers via `formatCd`, dates via `formatThaiDate` / `formatWeekHeader`; waits are on data-save-state,
 * server-action responses, aria state, toasts or text — never sleeps. Rows and cells are found by data-row-key /
 * data-testid / accessible names only (C27). Golden POS (F1): "ปรับปรุงระบบ POS หน้าร้าน" Cindy (250 cd at 28/9, no
 * dates), "ทำ UAT + คู่มือหน้าร้าน" Ivy (250 at 28/9, 125 at 5/10), "Rollout สาขา" Mint (TENTATIVE, from 30/11); Cindy
 * also has 250 cd in CRM Migration at 5/10 (masked for Mint, who is not in CRM).
 */
import type { Locator, Page, TestInfo } from '@playwright/test'
import { eq, sql } from 'drizzle-orm'
import type { ISODate } from '../src/domain/types'
import { formatCd } from '../src/domain/units'
import { th } from '../src/i18n/th'
import { FOOTER_ROWS, HEADER_TOTAL_H, ROW_H } from '../src/lib/grid/columns'
import { milestones, projects, user } from '../src/server/db/schema'
import type { Tx } from '../src/server/db/types'
import {
  expect,
  idOf,
  loginAs,
  projectIdByName,
  resetDb,
  test,
  type GoldenLogin,
  waitForServerAction,
  waitForServerActionWith,
} from './fixtures'
import { escapeRe, GridPage } from './pages/grid'
import { LoadChartPage } from './pages/load-chart'
import { PlanCalendarPage, planMonthTitle } from './pages/plan-calendar'
import { TaskListPage } from './pages/tasks'
import { toastWith, undoButtonOf } from './pages/toast'
import { taskIdOf } from './support/seed-tasks'

const POS = 'POS Upgrade'
const DW = 'Data Warehouse'
const CRM = 'CRM Migration'
const R1 = 'ปรับปรุงระบบ POS หน้าร้าน'
const UAT = 'ทำ UAT + คู่มือหน้าร้าน'
const ROLLOUT = 'Rollout สาขา'
const CRM_CINDY = 'ย้ายข้อมูลลูกค้า'
const SIGN_OFF = 'UAT sign-off'

const d1 = (cd: number) => formatCd(cd, { unit: 'DAYS', decimals: 1 })
/** "<load> / …" of a chart table cell (the capacity part is not what these scenarios are about) — at the start (days)
 *  or after the percent's "(" (M11.1: % of capacity is the default display, "50% (2.5 / 5.0 วัน)"). */
const loadOf = (load: string) => {
  const [prefix] = th.loadChart.daysValue(load, '\u0000').split('\u0000')
  return new RegExp(`(^|\\()${escapeRe(prefix!)}`)
}
/** Long month label of the month row, '2026-10' → "ตุลาคม 2569". */
const monthLong = (month: string) => {
  const [y, m] = month.split('-').map(Number) as [number, number]
  return th.grid.months.long(th.calendar.months[m - 1]!, y + 543)
}

async function openGrid(page: Page, who: GoldenLogin, project: string): Promise<GridPage> {
  await loginAs(page, who)
  const grid = new GridPage(page)
  await grid.goto(project)
  return grid
}

type Box = { x: number; y: number; width: number; height: number }
async function boxOf(l: Locator): Promise<Box> {
  await expect(l).toBeVisible()
  const b = await l.boundingBox()
  if (!b) throw new Error('element has no box')
  return b
}
/** `outer` covers `inner` horizontally (± 1 px). */
async function expectCoversX(outer: Locator, inner: Locator, what: string): Promise<void> {
  const o = await boxOf(outer)
  const i = await boxOf(inner)
  expect(o.x, `${what}: left`).toBeLessThanOrEqual(i.x + 1)
  expect(o.x + o.width, `${what}: right`).toBeGreaterThanOrEqual(i.x + i.width - 1)
}
/** Computed style of the boundary pseudo-element (the 2 px `--border-month` line, FR-818). */
function boundaryWidth(l: Locator): Promise<string> {
  return l.evaluate((el) => getComputedStyle(el, '::before').width)
}

/** A milestone in the DB (extras of resetDb): `createdBy` = Cindy, as if she had added it (M11.1: colour). */
async function insertMilestone(
  tx: Tx,
  o: { project: string; date: ISODate; color: 'PURPLE' | 'RED' | 'YELLOW' | 'GREEN' | 'BLUE'; name: string },
): Promise<void> {
  const [p] = await tx.select({ id: projects.id }).from(projects).where(eq(projects.name, o.project))
  const [u] = await tx.select({ id: user.id }).from(user).where(eq(user.nickname, 'Cindy'))
  await tx
    .insert(milestones)
    .values({ projectId: p!.id, date: o.date, color: o.color, name: o.name, createdBy: u!.id })
}
async function archiveProject(tx: Tx, name: string): Promise<void> {
  await tx
    .update(projects)
    .set({ archivedAt: sql`now()` })
    .where(eq(projects.name, name))
}

// ── P1 ───────────────────────────────────────────────────────────────────────────────────────────────────────
test.describe('P1 ⟲ (AC-810, FR-816/817, BR-100/101) split columns, hide assignees, summed cells · cindy', () => {
  test.beforeAll(async () => {
    await resetDb()
  })

  test('งาน / ผู้รับผิดชอบ; Jack on UAT; hidden → one row per task, 3.5 + 👥 2, read-only hint; single assignee writes', async ({
    page,
  }) => {
    const grid = await openGrid(page, 'cindy', POS)
    const tasks = new TaskListPage(page)
    // two frozen columns: the task name in งาน, the person in ผู้รับผิดชอบ (§8.3)
    await expect(grid.taskHeader()).toContainText(th.grid.columns.task)
    await expect(grid.assigneeHeader()).toContainText(th.grid.columns.assignee)
    await expect(grid.taskCell(R1, 'Cindy')).toContainText(R1)
    await expect(grid.taskCell(R1, 'Cindy')).not.toContainText('Cindy')
    await expect(grid.assigneeCell(R1, 'Cindy')).toContainText('Cindy')
    await expect(grid.showAssigneesSwitch()).toBeChecked() // default = shown

    // + Jack on UAT with 1.0 at 28/9
    await grid.rowHeader(UAT, 'Ivy').hover()
    await grid
      .rowHeader(UAT, 'Ivy')
      .getByRole('button', { name: th.grid.row.addPersonLabel(UAT) })
      .click()
    await expect(tasks.pickerInput()).toBeFocused()
    await tasks.pickAssignee('Jack')
    await tasks.closePicker()
    const jack = await grid.rowKeyOf(UAT, 'Jack')
    await grid.typeInto(await grid.reveal(jack, '2026-09-28'), '1')
    await grid.waitSaved()
    await expect(grid.value(await grid.reveal(jack, '2026-09-28'))).toHaveText(d1(100))

    // "ซ่อน" on the ผู้รับผิดชอบ header → one row per task
    const hidden = waitForServerActionWith(page, 'grid.showAssignees')
    await grid.hideAssigneesButton().click()
    await hidden
    await grid.expectAssigneesShown(false)
    await expect.poll(() => grid.rowLabels()).toEqual([R1, UAT, ROLLOUT])

    // BR-100: the summed cell = Ivy 2.5 + Jack 1.0; "👥 2" beside the name
    const uat = await grid.revealRowCell(UAT, '2026-09-28')
    await expect(grid.value(uat)).toHaveText(d1(350))
    await expect(grid.taskCell(UAT).locator('[data-sum-people]')).toHaveText(th.grid.sumMode.people(2))

    // BR-101: ≥ 2 assignees → read-only; typing writes nothing and shows the hint
    const writes = await grid.countServerActions(async () => {
      await grid.typeInto(uat, '4')
      await expect(grid.sumHint()).toBeVisible()
      await grid.waitSaved()
    })
    expect(writes, 'no write from a read-only summed cell').toBe(0)
    await expect(grid.value(uat)).toHaveText(d1(350))
    await expect(grid.sumHint()).toContainText(th.grid.sumMode.readOnlyHint(2))
    // [แสดงผู้รับผิดชอบ] turns the column on and focuses the task's first assignee row — keyboard-first (P1, §8.9):
    // focus stays on the cell and Alt+Enter runs the button while the hint is open
    const showButton = grid
      .sumHint()
      .getByRole('button', { name: th.grid.sumMode.showAssignees, exact: true })
    await expect(showButton).toHaveAttribute('aria-keyshortcuts', 'Alt+Enter')
    await expect(
      grid.root().locator('[data-cell]:focus'),
      'the hint never took focus from the grid',
    ).toHaveCount(1)
    const shown = waitForServerActionWith(page, 'grid.showAssignees')
    await page.keyboard.press('Alt+Enter')
    await shown
    await grid.expectAssigneesShown(true)
    await expect(grid.sumHint()).toHaveCount(0)
    await expect(
      page.locator(`[role="row"]:has(> [role="rowheader"][aria-label^="${UAT} · "]) :focus`),
      'focus on an assignee row of UAT',
    ).toHaveCount(1)

    // hidden again: a single-assignee task writes to its one assignment (Cindy)
    await grid.showAssignees(false)
    const r1 = await grid.revealRowCell(R1, '2026-10-05')
    await grid.typeInto(r1, '3')
    await grid.waitSaved()
    await expect(grid.value(r1)).toHaveText(d1(300))
    await expect(grid.sumHint()).toHaveCount(0)

    // the preference survives a reload; the value was saved on Cindy's row
    await grid.reload()
    await grid.expectAssigneesShown(false)
    await expect(grid.value(await grid.revealRowCell(R1, '2026-10-05'))).toHaveText(d1(300))
    await grid.showAssignees(true)
    await expect(grid.value(await grid.reveal(await grid.rowKeyOf(R1, 'Cindy'), '2026-10-05'))).toHaveText(
      d1(300),
    )
  })
})

// ── P2 ───────────────────────────────────────────────────────────────────────────────────────────────────────
// Actor: the manager — AC-808 opens POS and DW with the same account, and no golden worker is in both projects.
test.describe('P2 ⟲ (AC-808, FR-814) resize the งาน column · manager, ivy', () => {
  test.describe.configure({ mode: 'serial' })
  test.beforeAll(async () => {
    await resetDb()
  })

  test('manager: drag to 420 → full name; reload + DW keep 420; → ×5 = +80 in one save; double-click → 240', async ({
    page,
  }) => {
    const grid = await openGrid(page, 'manager', POS)
    await expect.poll(() => grid.taskColumnWidth()).toBe(240)
    await expect(grid.resizeHandle()).toHaveAttribute('aria-valuenow', '240')
    await expect(grid.resizeHandle()).toHaveAttribute('aria-orientation', 'vertical')

    await grid.resizeTaskColumn(180)
    await expect(grid.resizeHandle()).toHaveAttribute('aria-valuenow', '420')
    await expect.poll(() => grid.taskColumnWidth()).toBe(420)
    // the full name, no … (ellipsis = scrollWidth > clientWidth)
    await expect
      .poll(() => grid.taskName(UAT, 'Ivy').evaluate((el) => el.scrollWidth <= el.clientWidth))
      .toBe(true)

    await grid.reload()
    await expect.poll(() => grid.taskColumnWidth()).toBe(420)
    await grid.goto(DW) // per user, every project
    await expect.poll(() => grid.taskColumnWidth()).toBe(420)

    // keyboard: focus the separator, → five times = +80, one preference write for the gesture (M7.1-D9)
    const handle = grid.resizeHandle()
    await handle.focus()
    await expect(handle).toBeFocused()
    const writes = await grid.countServerActions(async () => {
      const saved = waitForServerActionWith(page, 'grid.taskColumnWidth')
      for (let i = 0; i < 5; i++) await page.keyboard.press('ArrowRight')
      await saved
    })
    expect(writes, 'one save per keyboard gesture').toBe(1)
    await expect(handle).toHaveAttribute('aria-valuenow', '500')
    await expect.poll(() => grid.taskColumnWidth()).toBe(500)

    const reset = waitForServerActionWith(page, 'grid.taskColumnWidth')
    await handle.dblclick()
    await reset
    await expect(handle).toHaveAttribute('aria-valuenow', '240')
    await expect.poll(() => grid.taskColumnWidth()).toBe(240)
  })

  test('ivy keeps her own 240', async ({ page }) => {
    const grid = await openGrid(page, 'ivy', POS)
    await expect.poll(() => grid.taskColumnWidth()).toBe(240)
    await expect(grid.resizeHandle()).toHaveAttribute('aria-valuenow', '240')
  })
})

// ── P3 ───────────────────────────────────────────────────────────────────────────────────────────────────────
test.describe('P3 ⟲ (AC-809, FR-815, BR-105) drag rows, Cmd+Z, Alt+arrows · cindy', () => {
  test.beforeAll(async () => {
    await resetDb()
  })

  test('drag "Rollout สาขา" to the top → grid + งาน tab; Cmd+Z / redo; reload; Alt+↑; Alt+→ moves the people + toast', async ({
    page,
  }) => {
    const grid = await openGrid(page, 'cindy', POS)
    const tasks = new TaskListPage(page)
    await grid.expectRowTaskNames([R1, UAT, ROLLOUT])
    // assignee rows are never draggable (FR-815): merged rows own their task, so each task has exactly one ⠿
    await expect(grid.root().locator('[data-drag-handle]')).toHaveCount(3)

    await grid.dragRow({ task: ROLLOUT, person: 'Mint' }, { task: R1, person: 'Cindy' })
    await grid.expectRowTaskNames([ROLLOUT, R1, UAT])
    await tasks.openTab() // client-side: the undo stack stays (M1)
    await tasks.expectRowNames([ROLLOUT, R1, UAT])
    await grid.openTab(POS)
    await grid.expectRowTaskNames([ROLLOUT, R1, UAT])

    // Cmd+Z → the old order; Cmd+Shift+Z → the move again (no toast: a move is not a delete)
    await (await grid.reveal(await grid.rowKeyOf(R1, 'Cindy'), '2026-09-28')).click()
    let answered = waitForServerAction(page)
    await grid.press('ControlOrMeta+z')
    await answered
    await grid.expectRowTaskNames([R1, UAT, ROLLOUT])
    answered = waitForServerAction(page)
    await grid.press('ControlOrMeta+Shift+z')
    await answered
    await grid.expectRowTaskNames([ROLLOUT, R1, UAT])

    // the new order is the server's (BR-105): grid and งาน tab after a reload
    await grid.reload()
    await grid.expectRowTaskNames([ROLLOUT, R1, UAT])
    await tasks.openTab()
    await tasks.reload()
    await tasks.expectRowNames([ROLLOUT, R1, UAT])
    await grid.openTab(POS)

    // Alt+↑ on the selected UAT row → above R1
    await grid.selectRow(UAT, 'Ivy')
    answered = waitForServerAction(page)
    await grid.press('Alt+ArrowUp')
    await answered
    await grid.expectRowTaskNames([ROLLOUT, UAT, R1])

    // Alt+→ on R1 → child of UAT; UAT's person and plan move to the new child (BR-31 / FR-610) with "เลิกทำ"
    await grid.selectRow(R1, 'Cindy')
    answered = waitForServerAction(page)
    await grid.press('Alt+ArrowRight')
    await answered
    const moved = th.tasks.toast.movedAssignees(1, R1)
    await expect(toastWith(page, moved)).toBeVisible()
    await expect(grid.rowHeader(UAT)).toBeVisible() // now a parent task row
    await expect(grid.rowHeader(R1, 'Cindy')).toBeVisible()
    await expect(grid.rowHeader(R1, 'Ivy')).toBeVisible()
    await expect(grid.rowHeader(UAT, 'Ivy')).toHaveCount(0)
    answered = waitForServerAction(page)
    await undoButtonOf(page, moved).click()
    await answered
    await expect(grid.rowHeader(UAT, 'Ivy')).toBeVisible()
    await expect(grid.rowHeader(R1, 'Ivy')).toHaveCount(0)
    await grid.expectRowTaskNames([ROLLOUT, UAT, R1])
  })
})

// ── P4 ───────────────────────────────────────────────────────────────────────────────────────────────────────
test.describe('P4 ⟲ (AC-811, FR-818) month row and month boundaries · ivy', () => {
  test.beforeAll(async () => {
    await resetDb()
  })

  test('week zoom: กันยายน / ตุลาคม / พฤศจิกายน 2569 above their weeks, boundaries through the grid; expanded 28/9', async ({
    page,
  }) => {
    const grid = await openGrid(page, 'ivy', POS)
    await expect(grid.monthHeader()).toBeVisible()
    await expect(grid.monthSpan('2026-09')).toHaveAccessibleName(monthLong('2026-09'))
    await expect(grid.monthSpan('2026-10')).toHaveAccessibleName(monthLong('2026-10'))
    await expect(grid.monthSpan('2026-11')).toHaveAccessibleName(monthLong('2026-11'))
    await expect(grid.monthSpan('2026-10')).toContainText(monthLong('2026-10')) // 4 weeks ≥ 144 px: long label

    await expectCoversX(grid.monthSpan('2026-09'), grid.columnHeader('2026-09-28'), 'ก.ย. over 28/9')
    for (const w of ['2026-10-05', '2026-10-12', '2026-10-19', '2026-10-26'])
      await expectCoversX(grid.monthSpan('2026-10'), grid.columnHeader(w), `ต.ค. over ${w}`)
    await expectCoversX(grid.monthSpan('2026-11'), grid.columnHeader('2026-11-02'), 'พ.ย. over 2/11')

    // a week column belongs to the month of its Monday: lines left of 5/10 and of 2/11 only
    await expect(grid.monthBoundaryBefore('W:2026-10-05')).toBeAttached()
    await expect(grid.monthBoundaryBefore('W:2026-11-02')).toBeAttached()
    for (const w of ['2026-09-28', '2026-10-12', '2026-10-26'])
      await expect(grid.columnHeader(w)).not.toHaveAttribute('data-month-start')
    expect(await boundaryWidth(grid.monthBoundaryBefore('W:2026-10-05'))).toBe('2px')
    // … through the body and the footer ("ตลอดความสูงกริด")
    const ivy = await grid.rowKeyOf(UAT, 'Ivy')
    for (const w of ['2026-10-05', '2026-11-02']) {
      const body = await grid.reveal(ivy, w)
      await expect(body).toHaveAttribute('data-month-start', '')
      expect(await boundaryWidth(body)).toBe('2px')
      await expect(grid.footerLoad(`W:${w}`)).toHaveAttribute('data-month-start', '')
    }
    await expect(grid.cell(ivy, '2026-09-28')).not.toHaveAttribute('data-month-start')

    // expand 28/9: 1 ต.ค. sits under ตุลาคม, the line between 30 ก.ย. and 1 ต.ค.
    await grid.expandWeek('2026-09-28')
    await expect(grid.dayHeader('2026-10-01')).toHaveAttribute('data-month-start', '')
    await expect(grid.dayHeader('2026-09-30')).not.toHaveAttribute('data-month-start')
    await expectCoversX(grid.monthSpan('2026-10'), grid.dayHeader('2026-10-01'), 'ต.ค. over 1 ต.ค.')
    await expectCoversX(grid.monthSpan('2026-09'), grid.dayHeader('2026-09-30'), 'ก.ย. over 30 ก.ย.')
    await expect(grid.dayCell(ivy, '2026-10-01')).toHaveAttribute('data-month-start', '')
    await grid.dayGroupHeader('2026-09-28').click() // collapse again (view only)
    await expect(grid.weekHeader('2026-09-28')).toHaveAttribute('aria-expanded', 'false')
  })
})

// ── P5 ───────────────────────────────────────────────────────────────────────────────────────────────────────
// M11.1 (SPEC v3.4, D24 reversed): M7.1's plan markers were merged into milestones. What stays of AC-812 here is the
// line layer (BR-102) drawn for milestones in their colour; choosing a colour and the migration are covered by
// e2e/m11.1-milestone-colour-load-percent.spec.ts.
test.describe('P5 ⟲ (AC-812 v3.4, BR-102, FR-709) milestone lines in the line layer; no "เส้นกำกับ" menu · cindy, ivy', () => {
  test.beforeAll(async () => {
    await resetDb(undefined, {
      extras: async (tx) => {
        await insertMilestone(tx, { project: POS, date: '2026-10-23', color: 'RED', name: SIGN_OFF })
      },
    })
  })
  const FRI = '2026-10-23'

  test('cindy: a red milestone 23/10 → solid line at the right edge of 19/10 through header, body and footer; no ⚑ menu', async ({
    page,
  }) => {
    const grid = await openGrid(page, 'cindy', POS)
    await expect(grid.markersMenuButton()).toHaveCount(0)
    await expect(grid.toolbar().getByText(th.milestones.fromMarkerName)).toHaveCount(0)
    await grid.scrollToWeek('2026-10-19')
    await expect(grid.diamond(SIGN_OFF)).toHaveAttribute('data-color', 'RED')
    for (const piece of ['header', 'body', 'footer'] as const) {
      await expect(grid.markerLines(piece)).toHaveCount(1)
      await expect(grid.markerLines(piece)).toHaveAttribute('data-color', 'RED')
    }
    const line = grid.markerLines('body')
    expect(await line.evaluate((el) => getComputedStyle(el).borderLeftStyle)).toBe('solid')
    const col = await boxOf(grid.columnHeader('2026-10-19'))
    const l = (await line.boundingBox())!
    expect(
      Math.abs(l.x + l.width / 2 - (col.x + col.width)),
      'line on the right edge of 19/10',
    ).toBeLessThanOrEqual(2)
    const rows = (await grid.rowLabels()).length
    expect(l.height, 'line through every row').toBeGreaterThanOrEqual(rows * ROW_H - 1)
    // the header context menu has no "add a marker" item any more
    await grid.columnHeader('2026-10-19').click({ button: 'right' })
    await expect(grid.cellMenu()).toHaveCount(0)
  })

  test('ivy (member): day zoom → the line sits after Fri 23 (never at รวม); calendar shows ◆ in red', async ({
    page,
  }) => {
    const grid = await openGrid(page, 'ivy', POS)
    await grid.zoom('day')
    await grid.scrollToWeek('2026-10-19')
    await expect(grid.dayHeader(FRI)).toBeAttached()
    await expect(grid.markerLines('body')).toHaveCount(1)
    const fri = await boxOf(grid.dayHeader(FRI))
    const total = await boxOf(grid.columnHeader('2026-10-19'))
    const dl = (await grid.markerLines('body').boundingBox())!
    expect(
      Math.abs(dl.x + dl.width / 2 - (fri.x + fri.width)),
      'day zoom: right edge of Fri 23',
    ).toBeLessThanOrEqual(2)
    expect(dl.x, 'not at the right edge of รวม').toBeLessThan(total.x + total.width - 8)
    await grid.zoom('week')

    const cal = new PlanCalendarPage(page)
    await cal.switchTo('CALENDAR')
    await cal.gotoMonth('2026-10')
    await expect(cal.milestonesOn(FRI)).toHaveCount(1)
    await expect(cal.milestonesOn(FRI)).toContainText(SIGN_OFF)
    await expect(cal.milestonesOn(FRI)).toHaveAttribute('data-color', 'RED')
  })
})

// ── P6 (AC-809 archived) ─────────────────────────────────────────────────────────────────────────────────────
test.describe('P6 ⟲ (AC-809 archived) archived = read-only · cindy', () => {
  test.beforeAll(async () => {
    await resetDb(undefined, {
      extras: async (tx) => {
        await archiveProject(tx, POS)
      },
    })
  })

  test('cindy on archived POS: no ⠿ and Alt+↑ does nothing', async ({ page }) => {
    const pos = await projectIdByName(POS)
    await loginAs(page, 'cindy')
    const grid = new GridPage(page)
    await grid.open(POS, pos)
    await expect(page.getByText(th.projects.archivedBanner).first()).toBeVisible()

    // FR-815: no ⠿ without edit rights; Alt+↑ is a no-op
    await expect(grid.root().locator('[data-drag-handle]')).toHaveCount(0)
    await grid.selectRow(UAT, 'Ivy')
    const writes = await grid.countServerActions(async () => {
      await grid.press('Alt+ArrowUp')
      await grid.press('Alt+ArrowRight')
      await grid.waitSaved()
    })
    expect(writes).toBe(0)
    await grid.expectRowTaskNames([R1, UAT, ROLLOUT])
  })
})

// ── P7 ───────────────────────────────────────────────────────────────────────────────────────────────────────
test.describe('P7 ⟲ (AC-806, FR-810–812, BR-103/103a) project calendar · cindy', () => {
  test.beforeAll(async () => {
    await resetDb()
  })

  test('ปฏิทิน: plan bars; dates for "Rollout สาขา" in the panel → Nov 2569 bar over two weeks with Mint ◐; reload; ?view=grid', async ({
    page,
  }) => {
    const grid = await openGrid(page, 'cindy', POS)
    const cal = new PlanCalendarPage(page)
    const tasks = new TaskListPage(page)
    const rollout = await taskIdOf(POS, ROLLOUT)
    await expect(cal.viewButton('GRID')).toHaveAttribute('aria-pressed', 'true')
    await cal.switchTo('CALENDAR')
    await expect(cal.viewButton('CALENDAR')).toHaveAttribute('aria-pressed', 'true')
    await expect(cal.monthTitle()).toHaveText(planMonthTitle('2026-09'))
    // Monday first (FR-907)
    await expect(cal.monthGrid().getByRole('columnheader').first()).toHaveText(th.calendar.weekdays[0])
    // v3.6 (BR-103a): every golden POS task has planned load, so none is "ไม่มีวันที่" — R1 / UAT show plan bars here
    await expect(cal.noDates()).toContainText(th.planCalendar.noDates(0))
    await expect(cal.bars(await taskIdOf(POS, UAT)).first()).toHaveAttribute('data-from-plan', 'true')

    // set the dates in the task panel (the calendar is read-only): open Rollout from its plan bar (30/11 → 1/1/2570)
    await cal.gotoMonth('2026-12')
    const planBar = cal.bars(rollout).first()
    await expect(planBar).toHaveAttribute('data-from-plan', 'true')
    await cal.barButton(planBar).click()
    await expect(tasks.panelTitle(ROLLOUT)).toBeVisible()
    await tasks.panelProps().setDate('start', '2026-11-03')
    await tasks.panelProps().setDate('due', '2026-11-12')
    // explicit dates win over the plan: no Rollout bar left in December
    await expect(cal.bars(rollout)).toHaveCount(0)

    await cal.gotoMonth('2026-11')
    const bars = cal.bars(rollout)
    await expect(bars).toHaveCount(2) // 3–8 Nov and 9–12 Nov (two week rows)
    const first = cal.day('2026-11-03').locator(`[data-task-bar="${rollout}"]`)
    const second = cal.day('2026-11-09').locator(`[data-task-bar="${rollout}"]`)
    await expect(first).toHaveAttribute('data-cut-right', 'true')
    await expect(first).not.toHaveAttribute('data-cut-left')
    await expect(first).toContainText('▸')
    await expect(second).toHaveAttribute('data-cut-left', 'true')
    await expect(second).toContainText('◂')
    for (const bar of [first, second]) {
      await expect(bar).not.toHaveAttribute('data-from-plan')
      await expect(bar).toContainText(`${ROLLOUT} · Mint`)
      await expect(bar).toHaveAttribute('data-tentative', 'true')
      await expect(bar).toContainText(th.projects.tentativeGlyph)
      await expect(cal.barButton(bar)).toHaveAccessibleName(
        new RegExp(escapeRe(th.projects.certainty.TENTATIVE)),
      )
    }

    // click a bar → the task panel
    await cal.barButton(second).click()
    await expect(tasks.panelTitle(ROLLOUT)).toBeVisible()
    await expect.poll(() => new URL(page.url()).searchParams.get('task')).toBe(rollout)

    // the view is remembered (plan.view) and ?view=grid wins over it
    await page.reload()
    await expect(cal.view()).toHaveAttribute('data-view', 'CALENDAR')
    await cal.waitReady()
    await grid.open(POS, await projectIdByName(POS), '?view=grid')
    await expect(cal.view()).toHaveAttribute('data-view', 'GRID')
    await expect(cal.root()).toHaveCount(0)
  })
})

// ── P8 ───────────────────────────────────────────────────────────────────────────────────────────────────────
test.describe('P8 ⟲ (AC-807, FR-813, BR-104, §3.3) กราฟภาระ · cindy, mint', () => {
  test.describe.configure({ mode: 'serial' })
  test.beforeAll(async () => {
    await resetDb()
  })

  test('cindy: Cindy / Ivy / Mint lines; 28/9 = 2.5 / 2.5 / 0, Ivy 1.3 at 5/10; รวมงานโปรเจคอื่น → Cindy 2.5 at 5/10 + footer switch', async ({
    page,
  }) => {
    const [cindy, ivy, mint] = await Promise.all([idOf('user', 'Cindy'), idOf('user', 'Ivy'), idOf('user', 'Mint')])
    const grid = await openGrid(page, 'cindy', POS)
    const chart = new LoadChartPage(page)
    await grid.setChart(true)
    await expect(chart.panel()).toBeVisible()
    await expect.poll(() => chart.legendNames()).toEqual(['Cindy', 'Ivy', 'Mint'])
    await expect(chart.lineChart()).toBeVisible() // the lazy MUI X chunk rendered (no CSP violation: guards)

    await chart.showTable(true)
    await expect.poll(() => chart.tableNames()).toEqual(['Cindy', 'Ivy', 'Mint'])
    await expect(chart.cell(cindy, '2026-09-28')).toHaveText(loadOf(d1(250)))
    await expect(chart.cell(ivy, '2026-09-28')).toHaveText(loadOf(d1(250)))
    await expect(chart.cell(mint, '2026-09-28')).toHaveText(loadOf('0'))
    await expect(chart.cell(ivy, '2026-10-05')).toHaveText(loadOf(d1(125)))
    // the same numbers as the grid
    await expect(grid.value(await grid.reveal(await grid.rowKeyOf(UAT, 'Ivy'), '2026-10-05'))).toHaveText(
      d1(125),
    )
    await expect(chart.cell(cindy, '2026-10-05')).toHaveText(loadOf('0'))

    await chart.includeOthers(true)
    await expect(chart.cell(cindy, '2026-10-05')).toHaveText(loadOf(d1(250)))
    await expect(grid.includeOthersSwitch(), 'one state with the footer').toBeChecked()
    await chart.showTable(false)
    await expect(chart.lineChart()).toBeVisible()

    // the pane is remembered (grid.chart)
    await grid.reload()
    await expect(grid.chartPane()).toBeVisible()
    await expect(grid.chartToggle()).toHaveAttribute('aria-pressed', 'true')
  })

  test('mix (not in CRM): sees Cindy’s other-project number, no response carries a CRM name', async ({
    page,
  }) => {
    const bodies: Promise<string>[] = []
    page.on('response', (r) => {
      const url = new URL(r.url())
      const type = r.headers()['content-type'] ?? ''
      if (
        (url.hostname === 'localhost' || url.hostname === '127.0.0.1') &&
        /json|text|x-component/.test(type)
      )
        bodies.push(r.text().catch(() => ''))
    })
    const cindy = await idOf('user', 'Cindy')
    const grid = await openGrid(page, 'mint', POS)
    const chart = new LoadChartPage(page)
    await grid.setChart(true)
    await chart.includeOthers(true)
    await chart.showTable(true)
    await expect(chart.cell(cindy, '2026-10-05')).toHaveText(loadOf(d1(250)))
    await page.waitForLoadState('networkidle')
    const all = await Promise.all(bodies)
    expect(all.length).toBeGreaterThan(0)
    for (const secret of [CRM, CRM_CINDY, await projectIdByName(CRM)])
      expect(
        all.some((b) => b.includes(secret)),
        `no response contains ${secret}`,
      ).toBe(false)
  })
})

// ── P9 ───────────────────────────────────────────────────────────────────────────────────────────────────────
const VIEWPORTS = [
  { width: 390, height: 844 },
  { width: 768, height: 1024 },
  { width: 1280, height: 800 },
  { width: 1920, height: 1080 },
  { width: 2560, height: 1440 },
] as const

async function attachShot(testInfo: TestInfo, page: Page, name: string): Promise<void> {
  await testInfo.attach(name, { body: await page.screenshot(), contentType: 'image/png' })
}
async function expectNoDocOverflow(page: Page, what: string): Promise<void> {
  const o = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: window.innerWidth }))
  expect(o.sw, `scrollWidth ≤ innerWidth: ${what}`).toBeLessThanOrEqual(o.iw)
}
/** No two visible boxes of `l` intersect (> 1 px each way) — texts never drawn over each other. */
async function expectNoOverlap(l: Locator, what: string): Promise<void> {
  const boxes = await l.evaluateAll((els) =>
    els
      .map((e) => {
        const r = e.getBoundingClientRect()
        return { l: r.left, t: r.top, r: r.right, b: r.bottom, text: (e.textContent ?? '').trim() }
      })
      .filter((r) => r.r - r.l > 0 && r.b - r.t > 0),
  )
  for (let i = 0; i < boxes.length; i++)
    for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i]!
      const b = boxes[j]!
      const dx = Math.min(a.r, b.r) - Math.max(a.l, b.l)
      const dy = Math.min(a.b, b.b) - Math.max(a.t, b.t)
      expect(dx > 1 && dy > 1, `${what}: "${a.text}" overlaps "${b.text}"`).toBe(false)
    }
}

test.describe('P9 ⟲ (AC-813, §8.13) viewports 390 / 768 / 1280 / 1920 / 2560 with screenshots · cindy', () => {
  test.beforeAll(async () => {
    await resetDb(undefined, {
      extras: (tx) =>
        insertMilestone(tx, { project: POS, date: '2026-10-23', color: 'YELLOW', name: SIGN_OFF }),
    })
  })

  test('grid (shown / hidden assignees, month row, a milestone line, chart pane) and calendar render without overlap', async ({
    page,
  }, testInfo) => {
    test.setTimeout(6 * 60_000)
    const pos = await projectIdByName(POS)
    await loginAs(page, 'cindy')
    const grid = new GridPage(page)
    const cal = new PlanCalendarPage(page)
    let first = true
    for (const vp of VIEWPORTS) {
      const at = `@${vp.width}`
      await page.setViewportSize(vp)
      await grid.open(POS, pos, '?view=grid')
      if (first) {
        await grid.setChart(true)
        first = false
      }
      await expect(grid.chartPane()).toBeVisible()
      await expect(grid.monthHeader()).toBeVisible()
      // SPEC §7: the grid opens with this week in view at every width (M7.1 review: it opened at the timeline start)
      await expect.poll(() => grid.todayHeaderWhole(), `this week in view on open ${at}`).toBe(true)
      // FR-813 / §8.12: the open chart pane never squeezes the grid below header + 6 rows + footer (M7.1 review);
      // a shorter plan hugs its content (D19, grid.module.css `min(354px, --grid-content-h)`) and must show all of it
      const { clientH, contentH } = await grid
        .root()
        .evaluate((el) => ({ clientH: el.clientHeight, contentH: el.scrollHeight }))
      expect(clientH, `grid height with the chart open ${at}`).toBeGreaterThanOrEqual(
        Math.min(HEADER_TOTAL_H + (6 + FOOTER_ROWS) * ROW_H, contentH),
      )
      await grid.scrollToWeek('2026-10-19')
      await expect(grid.diamond(SIGN_OFF)).toBeAttached()
      await expect(grid.markerLines('body')).toHaveAttribute('data-color', 'YELLOW')

      for (const shown of [true, false]) {
        await grid.showAssignees(shown)
        const mode = shown ? 'shown' : 'hidden'
        await expectNoOverlap(
          grid.root().locator('[data-month] > span:first-child'),
          `month labels ${mode} ${at}`,
        )
        await expectNoOverlap(
          grid.root().locator('[data-col-key] > button, [data-col-key] > span:first-child'),
          `week labels ${mode} ${at}`,
        )
        await expectNoOverlap(
          grid.root().locator('[data-frozen-header] > span'),
          `frozen headers ${mode} ${at}`,
        )
        await expectNoOverlap(grid.toolbar().locator(':scope > *'), `grid toolbar ${mode} ${at}`)
        // ‹ วันนี้ › on one line at every width (M7.1 review: › was stranded on its own line at 390)
        const navMid = await page
          .getByTestId('toolbar-nav')
          .locator(':scope > *')
          .evaluateAll((els) =>
            els.map((e) => {
              // border-box midpoint: clientHeight leaves out the outlined [วันนี้]'s 1 px border
              const r = e.getBoundingClientRect()
              return Math.round(r.top + r.height / 2)
            }),
          )
        expect(new Set(navMid).size, `‹ วันนี้ › on one line ${mode} ${at}`).toBe(1)
        await expectNoDocOverflow(page, `grid ${mode} ${at}`)
        await attachShot(testInfo, page, `m7.1-grid-${mode}-${vp.width}.png`)
      }
      await grid.showAssignees(true)

      await cal.switchTo('CALENDAR')
      if (vp.width < 600) {
        await expect(cal.agenda().or(page.getByTestId('plan-agenda-empty'))).toBeVisible()
        await expect(cal.monthGrid()).toHaveCount(0)
      } else {
        await expect(cal.monthGrid()).toBeVisible()
        await expect(cal.agenda()).toHaveCount(0)
        await expectNoOverlap(cal.monthGrid().getByRole('columnheader'), `calendar weekdays ${at}`)
      }
      await expectNoOverlap(cal.toolbar().locator(':scope > *'), `calendar toolbar ${at}`)
      await expectNoDocOverflow(page, `calendar ${at}`)
      await attachShot(testInfo, page, `m7.1-calendar-${vp.width}.png`)
      await cal.switchTo('GRID')
    }
  })

  test('day zoom: a fresh load opens with today in view, not at the timeline start (SPEC §7, M7.1 review)', async ({
    page,
  }) => {
    const pos = await projectIdByName(POS)
    await loginAs(page, 'cindy')
    const grid = new GridPage(page)
    for (const vp of [VIEWPORTS[0], VIEWPORTS[2], VIEWPORTS[4]]) {
      await page.setViewportSize(vp)
      await grid.open(POS, pos, '?view=grid')
      if ((await grid.zoomDay().getAttribute('aria-pressed')) !== 'true') {
        // saved as grid.zoom (debounced): wait for the write so the next open starts in day zoom
        const saved = waitForServerActionWith(page, 'grid.zoom')
        await grid.zoom('day')
        expect((await saved).ok()).toBe(true)
        await grid.open(POS, pos, '?view=grid')
      }
      await expect(grid.zoomDay()).toHaveAttribute('aria-pressed', 'true')
      await expect.poll(() => grid.todayHeaderWhole(), `today in view @${vp.width}`).toBe(true)
      expect(
        await grid.root().evaluate((el) => el.scrollLeft),
        `not the timeline start @${vp.width}`,
      ).toBeGreaterThan(0)
    }
    const reset = waitForServerActionWith(page, 'grid.zoom')
    await grid.zoom('week')
    expect((await reset).ok()).toBe(true)
  })
})

// ── P10 ──────────────────────────────────────────────────────────────────────────────────────────────────────
/**
 * NFR-13 local smoke (plan §7.3 P10: not a gate; the full measurement is M12). Runs only with E2E_PERF=1 so timing
 * noise never fails the suite. The chart part needs 20 synthetic people (`perf-small`), which no fixture provides yet
 * (`FixtureId` = F2 | F3 | F4): it is skipped with that note. Drag / resize frame rates are taken on M6's synthetic
 * 200-row "Perf grid" from requestAnimationFrame timestamps and attached as annotations.
 */
test.describe('P10 ⟲ (NFR-13) perf smoke: resize / drag ≥ 50 fps on 200 rows · cindy', () => {
  test.skip(
    process.env.E2E_PERF !== '1',
    'local perf smoke — set E2E_PERF=1 (plan/m07.1 §7.3 P10, not a gate)',
  )
  test.beforeAll(async () => {
    await resetDb(undefined, { syntheticGrid: true })
  })

  test('chart < 200 ms with 20 people', () => {
    // covered at node level by src/lib/grid/load-series.test.ts › NFR-13 (20 × 26 generated model, CI); the end-to-end
    // render timing needs a 20-person fixture and is measured in M12
    test.skip(
      true,
      'no 20-person fixture (resetDb("perf-small") does not exist): node-level check in load-series.test.ts; e2e in M12',
    )
  })

  test('resize and row drag keep ≥ 50 fps', async ({ page }, testInfo) => {
    const grid = await openGrid(page, 'cindy', 'Perf grid')
    const startFrames = () =>
      page.evaluate(() => {
        const w = window as unknown as { __frames: number[]; __run: boolean }
        w.__frames = []
        w.__run = true
        const tick = (t: number) => {
          w.__frames.push(t)
          if (w.__run) requestAnimationFrame(tick)
        }
        requestAnimationFrame(tick)
      })
    const stopFrames = () =>
      page.evaluate(() => {
        const w = window as unknown as { __frames: number[]; __run: boolean }
        w.__run = false
        const f = w.__frames
        const span = (f.at(-1) ?? 0) - (f[0] ?? 0)
        return span > 0 ? ((f.length - 1) * 1000) / span : 0
      })

    // resize: 40 pointer moves, one save on release
    const handle = grid.resizeHandle()
    await handle.hover()
    const hb = (await handle.boundingBox())!
    await startFrames()
    const saved = waitForServerActionWith(page, 'grid.taskColumnWidth')
    await page.mouse.move(hb.x + hb.width / 2, hb.y + hb.height / 2)
    await page.mouse.down()
    await page.mouse.move(hb.x + hb.width / 2 + 200, hb.y + hb.height / 2, { steps: 40 })
    await page.mouse.up()
    await saved
    const resizeFps = await stopFrames()

    // row drag over ~20 rows, cancelled with Esc (no move)
    const drag = grid.root().locator('[data-drag-handle]').first()
    await drag.hover()
    const db = (await drag.boundingBox())!
    await startFrames()
    const writes = await grid.countServerActions(async () => {
      await page.mouse.move(db.x + db.width / 2, db.y + db.height / 2)
      await page.mouse.down()
      await page.mouse.move(db.x + db.width / 2, db.y + 20 * ROW_H, { steps: 40 })
      await expect(grid.dropIndicator()).toBeVisible()
      await page.keyboard.press('Escape')
      await page.mouse.up()
      await expect(grid.dropIndicator()).toHaveCount(0)
    })
    const dragFps = await stopFrames()
    expect(writes, 'Esc cancels the drag').toBe(0)

    testInfo.annotations.push({
      type: 'perf',
      description: `resize ${resizeFps.toFixed(1)} fps · drag ${dragFps.toFixed(1)} fps`,
    })
    expect(resizeFps).toBeGreaterThanOrEqual(50)
    expect(dragFps).toBeGreaterThanOrEqual(50)
  })
})
