/**
 * M10 — Home, search and live data blocks (plan/m10-home-search.md §7.3 H1–H4, P1–P7, B1–B6; SPEC §4.11 FR-1101…1105,
 * §4.13 FR-1301…1307, AC-1301…1303, §8.2, §8.6 KEY-01/05/06, §9 NFR-06/07b).
 *
 * Determinism (PLAN §4.5, X45/X46): production build, APP_NOW = 2026-09-30 10:00 +07 (Wed; this week = 28/9; greeting
 * "morning"), the browser clock pinned by the auto fixture before the first goto. Every describe resets planner_e2e in
 * its own beforeAll (⟲) and runs serially. Strings come from `th`; numbers via `formatCd` / `compactDays` /
 * `workloadCellText` / `formatPercentTenths`; dates via `formatHomeDate` / `formatWeekHeader` / `formatLeaveRange`.
 * Waits are on UI state, server-action responses, toasts or responses — never sleeps. No deliberate 4xx in M10
 * scenarios, so no `allowedConsoleErrors`; CSP and external-request guards stay on.
 *
 * SPEC v3.2 (M6.1) applied over the plan's outline: the screen's <h1> is the header bar's th.home.title (FR-1603), so the
 * greeting is found by its text; a task hit opens the task document `/t/<id>` (M6.1-D14 href), not the tasks tab.
 *
 * Golden facts (docs/reference/golden-fixtures.json, r8 §4.10/§4.6, M8 App. A.2):
 * - Cindy: THIS_WEEK = "ปรับปรุงระบบ POS หน้าร้าน" (POS, 2.50 this week); load 28/9…2/11 = 2.5, 2.5, 2.5, 3.75, 3.75, 2.5,
 *   then 0, 0 (cap 5); milestones visible in 14 days: "UAT sign-off" only (DUE_SOON, late) — "Design freeze" is DW's.
 * - F3 = Peter ลาพักร้อน 5–6 ต.ค. → Peter 5/10 OVER +2.00 (CAPACITY); team utilisation 4 weeks = 74.0 %.
 * - Ivy (MEMBER of POS, CRM) sees Cindy, Ivy, Mint only; Jack is not in CRM Migration ("ย้ายข้อมูลลูกค้า").
 */
import type { Locator, Page } from '@playwright/test'
import { formatCd } from '../src/domain/units'
import { th } from '../src/i18n/th'
import { formatHomeDate, formatLeaveRange, formatWeekHeader } from '../src/lib/format'
import { formatPercentTenths } from '../src/lib/home/percent'
import { compactDays, twoDecimals, workloadCellText } from '../src/lib/workload/format'
import {
  expect,
  idOf,
  LIVE_PAGES,
  loginAs,
  projectIdByName,
  resetDb,
  switchUser,
  test,
  userIdByNickname,
  waitForPageUrl,
  waitForServerAction,
} from './fixtures'
import { HomePage, templatePattern } from './pages/home'
import { LeaveDialog } from './pages/leave-dialog'
import { LiveBlocks } from './pages/live-blocks'
import { PageScreen } from './pages/page-screen'
import { Palette } from './pages/palette'
import { TaskListPage } from './pages/tasks'
import { escapeRegExp } from './pages/text'
import { allToasts, toastWith } from './pages/toast'
import { charterIdOf, taskIdOf } from './support/seed-tasks'

const POS = 'POS Upgrade'
const MOBILE = 'Mobile App Revamp'
const CRM = 'CRM Migration'
const CINDY_TASK = 'ปรับปรุงระบบ POS หน้าร้าน'
const UAT = 'ทำ UAT + คู่มือหน้าร้าน'
const DW_TASK = 'ย้าย pipeline ขึ้น BigQuery'
const MINT_TASK = 'พัฒนา front-end'
const CRM_TASK = 'ย้ายข้อมูลลูกค้า'
const UAT_MS = 'UAT sign-off'
/** The charter's live section heading and the heading after it (templates.th.ts, M10-D12). */
const LIVE_SECTION = 'งานและภาระของทีม'
const LIVE_SECTION_NEXT = 'ทีมงานและบทบาท'
const DESIGN_FREEZE = 'Design freeze'
const VACATION = th.leaveTypes.defaults[0].name
const S = th.tasks.status.defaults
const TODAY = '2026-09-30'
const W0 = '2026-09-28'
const W1 = '2026-10-05'
const CAP = 500
/** Cindy's 8-week load (cd) from 28/9 — r8 §4.10. */
const CINDY_LOAD = [250, 250, 250, 375, 375, 250, 0, 0] as const
const MONDAYS = [
  '2026-09-28',
  '2026-10-05',
  '2026-10-12',
  '2026-10-19',
  '2026-10-26',
  '2026-11-02',
  '2026-11-09',
  '2026-11-16',
]

const d1 = (cd: number) => formatCd(cd, { unit: 'DAYS', decimals: 1 })

/** Every status chip of a list row (any status), for flows that do not know the current status. */
function anyStatusChip(tasks: TaskListPage, name: string): Locator {
  return tasks.row(name).getByRole('button', { name: templatePattern(th.tasks.status.menuLabel, 1) })
}

/**
 * Leaves an editor whose edit lease this user holds through the in-app home link, so the lease is released at once
 * (EDI-6 `DELETE …/lock`, as in m4). A full navigation or the context closing leaves it for its 2-minute TTL (FR-541),
 * which would make the page read-only for the next user in this serial describe.
 */
async function leaveEditor(page: Page, pageId: string): Promise<void> {
  await new PageScreen(page).editor.expectEditable()
  const released = page.waitForResponse(
    (r) => r.request().method() === 'DELETE' && r.url().endsWith(`/api/pages/${pageId}/lock`),
  )
  await new HomePage(page).shell.navLink(th.nav.home).click()
  await released
}

/** The palette after the shell hydrated (Cmd/Ctrl+K registered). */
async function openPalette(page: Page): Promise<Palette> {
  const palette = new Palette(page)
  await palette.openByKeyboard()
  await expect(palette.dialog()).toBeVisible()
  return palette
}

// =============================================================================================================
test.describe('H ⟲ home dashboard (FR-1101, UI-04, PRIN-P6, NFR-07b) · F3 + milestones', () => {
  test.describe.configure({ mode: 'serial' })
  test.beforeAll(async () => {
    await resetDb('F3', { milestones: true })
  })

  test('H1 cindy lands on /home: greeting, Thai date, my week, 8-week load, milestones, leave, recent pages; no manager cards', async ({
    page,
  }) => {
    await loginAs(page, 'cindy')
    await page.goto('/')
    await expect(page).toHaveURL(/\/home$/) // X32: the first page
    const home = new HomePage(page)
    await home.goto()

    // M10-D19: greeting by the Bangkok hour (10:00 → morning) + "พุธ 30 ก.ย. 2569"; the <h1> stays the header bar's
    await expect(home.greeting('Cindy')).toBeVisible()
    await expect(page.getByText(formatHomeDate(TODAY), { exact: false }).first()).toBeVisible()
    await expect(home.heading()).toHaveCount(1)
    await expect(home.heading()).toContainText(th.home.title)

    // FR-1101a: exactly one row, with project and my cd this week; no quick add (X68)
    await expect(home.myTasks().getByRole('listitem')).toHaveCount(1)
    const row = home.taskRow(CINDY_TASK)
    await expect(row).toContainText(POS)
    await expect(row).toContainText(th.home.myTasks.planned(d1(250)))
    await expect(home.myTasks().getByRole('textbox')).toHaveCount(0)

    // FR-1101b: 8 bars, each labelled with week, load and capacity; texts never colour alone (M10-D14)
    await expect(home.loadBars()).toHaveCount(8)
    for (const [i, cd] of CINDY_LOAD.entries()) {
      if (cd === 0) continue
      await expect(
        home.loadBar(formatWeekHeader(MONDAYS[i]!), compactDays(cd), compactDays(CAP)),
      ).toBeVisible()
    }
    await expect(home.myLoad()).toContainText(workloadCellText(250, CAP))
    await expect(home.myLoad()).toContainText(workloadCellText(375, CAP))

    // FR-1101c / r8 D2: only UAT sign-off; Design freeze (DW) never reaches Cindy
    const uat = home.milestoneItem(UAT_MS)
    await expect(uat).toBeVisible()
    await expect(uat).toContainText(th.milestones.status.DUE_SOON)
    await expect(uat).toContainText(th.milestones.late)
    await expect(home.milestones().getByRole('listitem')).toHaveCount(1)
    expect(await page.content()).not.toContain(DESIGN_FREEZE)

    // FR-1101d (X68): three lines; Peter next week masked as "ลา" (MASK-5)
    await expect(home.leaveLine(th.home.leave.today)).toHaveText(th.home.leave.none)
    await expect(home.leaveLine(th.home.leave.thisWeek)).toHaveText(th.home.leave.none)
    const next = home.leaveLine(th.home.leave.nextWeek)
    await expect(next).toContainText(
      th.home.leave.entry('Peter', formatLeaveRange('2026-10-05', '2026-10-06', null)),
    )
    await expect(next).toContainText(th.masking.leave)
    expect(await page.content()).not.toContain(VACATION)

    // FR-1101e: the POS charter is among the recent pages (a row = link to the page + "· <project> · <editor>")
    await expect(
      home
        .recentPages()
        .getByRole('listitem')
        .filter({ has: page.getByRole('link', { name: th.pages.charterTitle, exact: true }) })
        .filter({ hasText: POS }),
    ).not.toHaveCount(0)

    // FR-1101f: workers get no manager cards
    await expect(page.getByRole('heading', { name: th.home.manager.overloadedTitle })).toHaveCount(0)
    await expect(page.getByRole('heading', { name: th.home.manager.utilisationTitle })).toHaveCount(0)
  })

  test('H2 cindy ticks her task on home: checked at once, toast, leaves after the refetch; Cmd+Z brings it back', async ({
    page,
  }) => {
    await loginAs(page, 'cindy')
    const home = new HomePage(page)
    await home.goto()
    const answered = waitForServerAction(page)
    await home.tick(CINDY_TASK)
    await expect(home.checkbox(CINDY_TASK)).toBeChecked() // optimistic (M10-D33), before the refetch removes the row
    await answered
    await expect(toastWith(page, th.tasks.toast.completed)).toBeVisible() // BR-52: no released load (plan ends 28/9)
    await expect(home.taskRow(CINDY_TASK)).toHaveCount(0) // M10-D13: completed tasks leave THIS_WEEK
    const undone = waitForServerAction(page)
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur()) // global undo ignores inputs
    await page.keyboard.press('ControlOrMeta+z')
    await undone
    await expect(home.checkbox(CINDY_TASK)).not.toBeChecked()
    await expect(home.taskRow(CINDY_TASK)).toBeVisible()

    const tasks = new TaskListPage(page)
    await tasks.goto(await projectIdByName(POS))
    await expect(tasks.statusChip(CINDY_TASK, S.todo)).toBeVisible()
  })

  test('H3 manager: manager cards first — Peter OVER +2 next week (CAPACITY), utilisation 74.0 %, Workload in one click', async ({
    page,
  }) => {
    await loginAs(page, 'manager')
    const home = new HomePage(page)
    await home.goto()
    const peter = await userIdByNickname('Peter')

    await expect(home.cards().first()).toContainText(th.home.manager.overloadedTitle) // PRIN-P6: first on the page
    const over = home.overloaded().getByRole('listitem').filter({ hasText: 'Peter' })
    await expect(over).toHaveCount(1)
    await expect(over).toContainText(th.home.manager.week(formatWeekHeader(W1)))
    await expect(over).toContainText(th.overload.level.OVER)
    await expect(over).toContainText(th.overload.excess(compactDays(200)))
    await expect(over).toContainText(th.overload.cause.CAPACITY)
    await expect(over.getByRole('link').first()).toHaveAttribute('href', `/people/${peter}/plan?week=${W1}`)

    await expect(home.utilisation()).toContainText(formatPercentTenths(740))
    await expect(home.milestoneItem(UAT_MS)).toBeVisible()
    await expect(home.milestoneItem(DESIGN_FREEZE)).toBeVisible()
    await expect(home.leaveLine(th.home.leave.nextWeek)).toContainText(VACATION) // full details for the manager

    await page.getByRole('link', { name: th.home.manager.openWorkload }).click()
    await expect(page).toHaveURL(/\/workload(\?|$)/)
  })

  test('H4 ivy on a phone (390 × 844): one column, no horizontal scroll, no trace of Peter’s leave', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await loginAs(page, 'ivy')
    const home = new HomePage(page)
    await home.goto()
    const a = await home.myTasks().boundingBox()
    const b = await home.myLoad().boundingBox()
    const c = await home.leave().boundingBox()
    if (!a || !b || !c) throw new Error('home cards have no box')
    expect(Math.abs(a.x - b.x), 'stacked cards share x').toBeLessThanOrEqual(1)
    expect(Math.abs(a.x - c.x), 'stacked cards share x').toBeLessThanOrEqual(1)
    expect(b.y).toBeGreaterThan(a.y)
    const fits = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)
    expect(fits, 'no horizontal page scroll').toBe(true)
    for (const line of [th.home.leave.today, th.home.leave.thisWeek, th.home.leave.nextWeek])
      await expect(home.leaveLine(line)).toHaveText(th.home.leave.none)
    expect(await page.content()).not.toContain('Peter')
  })
})

// =============================================================================================================
test.describe('P ⟲ Cmd/Ctrl+K palette and quick commands (FR-1102…1105, KEY-01/05/06, NFR-06) · F1', () => {
  test.describe.configure({ mode: 'serial' })
  test.beforeAll(async () => {
    await resetDb(undefined, { milestones: true, livePages: true })
  })

  test('P1 "ลูกค้า": Cindy finds the CRM task (Thai substring) and opens it; Jack gets nothing of CRM', async ({
    page,
  }) => {
    await loginAs(page, 'cindy')
    await new HomePage(page).goto()
    const palette = await openPalette(page)
    await palette.typeQuery('ลูกค้า')
    const hit = palette.results('tasks').filter({ hasText: CRM_TASK })
    await expect(hit).toHaveCount(1)
    await expect(hit).toContainText(th.search.inProject(CRM))
    await hit.click()
    await expect(page).toHaveURL(new RegExp(`/t/${await taskIdOf(CRM, CRM_TASK)}$`))
    await expect(page.getByRole('heading', { level: 1 })).toContainText(CRM_TASK)

    await switchUser(page, 'jack')
    await new HomePage(page).goto()
    const p2 = await openPalette(page)
    await p2.typeQuery('ลูกค้า')
    // settle on the server answer (a result or the empty state) before asserting absence
    await expect(
      p2.dialog().getByText(th.palette.empty, { exact: true }).or(p2.dialog().getByRole('option').first()),
    ).not.toHaveCount(0)
    await expect(p2.dialog().getByText(th.palette.loading, { exact: true })).toHaveCount(0)
    await expect(p2.option(new RegExp(escapeRegExp(CRM_TASK)))).toHaveCount(0)
    expect(await p2.dialog().textContent()).not.toContain(CRM)
  })

  test('P2 ivy: local categories — no hidden person, Mint, POS Upgrade, Coral', async ({ page }) => {
    await loginAs(page, 'ivy')
    await new HomePage(page).goto()
    const palette = await openPalette(page)
    await palette.typeQuery('Pet')
    await expect(palette.results('people')).toHaveCount(0) // Ivy cannot see Peter (M10-D21)
    await palette.typeQuery('Mi')
    await expect(palette.results('people').filter({ hasText: 'Mint' })).toHaveCount(1)
    await palette.typeQuery('POS')
    await expect(palette.results('projects').filter({ hasText: POS })).toHaveCount(1)
    await palette.typeQuery('Cor')
    await expect(palette.results('clients').filter({ hasText: 'Coral' })).toHaveCount(1)
  })

  test('P3 cindy: keystroke → first result < 200 ms (NFR-06, local index)', async ({ page }) => {
    await loginAs(page, 'cindy')
    await new HomePage(page).goto()
    const palette = await openPalette(page)
    await palette.typeQuery('POS') // warm-up: the index is loaded
    await expect(palette.results('projects').first()).toBeVisible()
    const ms = await palette.measureFirstResult('PO')
    expect(ms, `first result after ${ms.toFixed(1)} ms`).toBeLessThan(200)
  })

  test('P4 cindy: quick commands สร้าง task · สร้างหน้า · แจ้งลา · ไปหน้าวันนี้', async ({ page }) => {
    await loginAs(page, 'cindy')
    const home = new HomePage(page)
    await home.goto()
    const C = th.palette.commands
    const NEW_TASK = 'งานจาก palette'

    // สร้าง task → project picker → name only (P1) → toast with "เปิด"
    let palette = await openPalette(page)
    await palette.runCommand(C.createTask.label)
    await palette.option(new RegExp(`^${escapeRegExp(POS)}`)).click()
    await expect(palette.input()).toHaveAttribute('placeholder', th.palette.createTask.namePlaceholder(POS))
    await palette.input().fill(NEW_TASK)
    const created = waitForServerAction(page)
    await palette.input().press('Enter')
    await created
    await expect(toastWith(page, th.palette.createTask.created(NEW_TASK, POS))).toBeVisible()
    const tasks = new TaskListPage(page)
    await tasks.goto(await projectIdByName(POS))
    await expect(tasks.statusChip(NEW_TASK, S.todo)).toBeVisible()

    // สร้างหน้า from /home → a blank wiki page with the template chooser
    await home.goto()
    palette = await openPalette(page)
    await palette.runCommand(C.createPage.label)
    await waitForPageUrl(page)
    const screen = new PageScreen(page)
    await expect(screen.templateRegion()).toBeVisible()
    await expect(screen.breadcrumb()).toContainText(th.palette.wiki)

    // แจ้งลา → M5's dialog
    palette = await openPalette(page)
    await palette.runCommand(C.reportLeave.label)
    const leave = new LeaveDialog(page)
    await leave.expectOpen('create')
    await page.keyboard.press('Escape')
    await leave.expectClosed()

    // ไปหน้าวันนี้ from /calendar → /home
    await home.shell.goto('/calendar')
    palette = await openPalette(page)
    await palette.runCommand(C.goToday.label)
    await expect(page).toHaveURL(/\/home$/)

    // reopening สร้าง task shows the last used project first (palette.lastProjectId, M10-D27)
    palette = await openPalette(page)
    await palette.runCommand(C.createTask.label)
    const first = palette.dialog().getByRole('option').first()
    await expect(first).toContainText(POS)
    await expect(first).toContainText(th.palette.createTask.lastUsed)
  })

  test('P5 cindy: N on home opens "สร้าง task"; on the tasks tab it focuses quick add; in the editor it is a letter (KEY-05)', async ({
    page,
  }) => {
    await loginAs(page, 'cindy')
    const home = new HomePage(page)
    await home.goto()
    const palette = new Palette(page)
    await page.keyboard.press('n')
    await expect(palette.dialog()).toBeVisible()
    await expect(
      palette
        .dialog()
        .getByText(th.palette.createTask.pickProject)
        .or(palette.dialog().getByPlaceholder(th.palette.createTask.projectPlaceholder)),
    ).not.toHaveCount(0)
    await page.keyboard.press('Escape')
    await expect(palette.dialog()).toHaveCount(0)

    const tasks = new TaskListPage(page)
    await tasks.goto(await projectIdByName(POS))
    await page.keyboard.press('n') // M10-D25: M3's page-local binding wins
    await expect(tasks.quickAdd()).toBeFocused()
    await expect(palette.dialog()).toHaveCount(0)
    await page.keyboard.press('Escape')

    const screen = new PageScreen(page)
    await screen.goto(await idOf('page', LIVE_PAGES.wiki))
    await screen.editor.focusEnd()
    await page.keyboard.type('nn')
    await expect(screen.editor.content()).toContainText('nn')
    await expect(palette.dialog()).toHaveCount(0)
  })

  test('P6 cindy: Cmd+K with a text selection opens the BlockNote link popover; without one, the palette (KEY-01, R2)', async ({
    page,
  }) => {
    await loginAs(page, 'cindy')
    const screen = new PageScreen(page)
    await screen.goto(await idOf('page', LIVE_PAGES.wiki))
    const palette = new Palette(page)
    // the editor is read-only until the first lease answer: keys typed before that are dropped (as in m4 E6)
    await screen.editor.waitReady()
    await screen.editor.expectEditable()
    await screen.editor.focusEnd()
    await page.keyboard.type(' ลิงก์ทดสอบ')
    await expect(screen.editor.content()).toContainText('ลิงก์ทดสอบ')
    await screen.editor.selectText('ลิงก์ทดสอบ')
    // BlockNote's Mod+K link handler lives in the formatting toolbar: wait until it has mounted with the selection
    await expect(screen.editor.formattingToolbar()).toBeVisible()
    await palette.openByKeyboard()
    await expect(
      page.getByPlaceholder(th.editor.blocknote.link_toolbar.form.url_placeholder, { exact: true }),
    ).toBeVisible()
    await expect(palette.dialog()).toHaveCount(0)
    await page.keyboard.press('Escape')

    await screen.editor.focusEnd() // collapsed selection
    // BlockNote's Mod+K link handler lives in the formatting toolbar: wait until it has gone with the selection
    await expect(screen.editor.formattingToolbar()).toBeHidden()
    await palette.openByKeyboard()
    await expect(palette.dialog()).toBeVisible()
  })

  test('P7 `?` lists the palette shortcuts under ช่องค้นหา (KEY-06)', async ({ page }) => {
    await loginAs(page, 'cindy')
    await new HomePage(page).goto()
    await page.keyboard.press('Shift+Slash')
    const help = page.getByRole('dialog', { name: th.shortcuts.title })
    await expect(help).toBeVisible()
    await expect(help.getByText(th.shortcuts.scopes.palette, { exact: true })).toBeVisible()
    for (const item of [
      th.shortcuts.items.paletteMove,
      th.shortcuts.items.paletteOpen,
      th.shortcuts.items.paletteBack,
    ])
      await expect(help.getByText(item, { exact: true })).toBeVisible()
  })
})

// =============================================================================================================
test.describe('B ⟲ live blocks มุมมองงาน / ภาระทีมโปรเจค (FR-1301…1307, AC-1301…1303) · F1 + livePages', () => {
  test.describe.configure({ mode: 'serial' })
  test.beforeAll(async () => {
    await resetDb(undefined, { milestones: true, livePages: true })
  })

  test('B1 AC-1301 cindy: /มุมมองงาน in the POS charter → POS board → drag to กำลังทำ → the tasks tab agrees', async ({
    page,
  }) => {
    await loginAs(page, 'cindy')
    const screen = new PageScreen(page)
    const charterId = await charterIdOf(POS)
    await screen.goto(charterId)
    const live = new LiveBlocks(page)
    await expect(live.taskViews()).toHaveCount(1) // M10-D12: the template's own block
    await screen.editor.newBlock()
    await screen.editor.slash(th.editor.slash.taskView.title)
    await page.keyboard.press('Enter')
    await expect(live.taskViews()).toHaveCount(2)
    await screen.editor.waitSaved()

    const block = live.taskViews().last() // R17: the inserted one
    await live.waitLoaded(block)
    await expect(live.card(block, CINDY_TASK)).toBeVisible()
    await expect(block).not.toContainText(DW_TASK)
    await live.dragCard(block, CINDY_TASK, S.doing)
    await expect(
      live.column(block, S.doing).getByRole('article', { name: CINDY_TASK, exact: true }),
    ).toBeVisible()
    await expect(
      allToasts(page).getByRole('button', { name: th.undo.undo, exact: true }).first(),
    ).toBeVisible()
    await leaveEditor(page, charterId)

    const tasks = new TaskListPage(page)
    await tasks.goto(await projectIdByName(POS))
    await expect(tasks.statusChip(CINDY_TASK, S.doing)).toBeVisible()
  })

  test('B2 AC-1302 manager: copy the block → Data Warehouse page shows DW tasks; wiki page shows the placeholder; both persist', async ({
    page,
  }) => {
    await loginAs(page, 'manager')
    const screen = new PageScreen(page)
    const live = new LiveBlocks(page)
    const charterId = await charterIdOf(POS)
    await screen.goto(charterId)
    const source = live.taskViews().first() // the charter template's block (M10-D12)
    await live.waitLoaded(source)
    // M10-D8: live blocks are not node-selectable (`meta.selectable: false`), so a block is copied with the text range
    // around it — the charter section from its heading to the next heading holds both live blocks (R12: real clipboard)
    await screen.editor.selectBlocks(LIVE_SECTION, LIVE_SECTION_NEXT)
    await page.keyboard.press('ControlOrMeta+c')
    await leaveEditor(page, charterId)

    const dwId = await idOf('page', LIVE_PAGES.dw)
    await screen.goto(dwId)
    await screen.editor.expectEditable() // the edit lease is held: a paste before that is ignored
    await screen.editor.focusEnd()
    await page.keyboard.press('ControlOrMeta+v')
    const dwBlock = live.taskViews().last()
    await live.waitLoaded(dwBlock)
    await expect(dwBlock).toContainText(DW_TASK) // FR-1304: bound to the page's project, never to a stored id
    await expect(dwBlock).not.toContainText(CINDY_TASK)
    await screen.editor.waitSaved()
    await leaveEditor(page, dwId)

    const wikiId = await idOf('page', LIVE_PAGES.wiki)
    await screen.goto(wikiId)
    await screen.editor.expectEditable()
    await screen.editor.focusEnd()
    await page.keyboard.press('ControlOrMeta+v')
    await expect(live.all()).toHaveCount(2) // taskView + projectWorkload
    for (const block of [live.all().first(), live.all().last()]) {
      await expect(live.wikiPlaceholder(block)).toBeVisible()
    }
    await screen.editor.waitSaved()

    await screen.goto(dwId) // reload: props only were stored
    await live.waitLoaded(live.taskViews().last())
    await expect(live.taskViews().last()).toContainText(DW_TASK)
    await screen.goto(wikiId)
    await expect(live.all()).toHaveCount(2)
    for (const block of [live.all().first(), live.all().last()]) {
      await expect(live.wikiPlaceholder(block)).toBeVisible()
    }
    await leaveEditor(page, wikiId) // B6 edits this page as Cindy
  })

  test('B3 AC-1303 ivy: the POS workload block masks other projects — rows Cindy, Ivy, Mint; no Mobile name anywhere', async ({
    page,
  }) => {
    await loginAs(page, 'ivy')
    const screen = new PageScreen(page)
    const response = page.waitForResponse((r) => /\/api\/pages\/[0-9a-f-]{36}\/embed\/workload/.test(r.url()))
    const charterId = await charterIdOf(POS)
    await screen.goto(charterId)
    const res = await response
    const text = await res.text()
    for (const secret of [MOBILE, MINT_TASK]) expect(text, `response leaks ${secret}`).not.toContain(secret)

    const live = new LiveBlocks(page)
    const block = live.workloads().first()
    await live.waitLoaded(block)
    const names = await live.rows(block).getByRole('rowheader').allTextContents()
    expect(names.map((n) => n.trim()).sort()).toEqual(['Cindy', 'Ivy', 'Mint'])
    const mintCell = live.cell(block, 'Mint', W0)
    // M11.1 (FR-1303/FR-1010): the block shows % of capacity by default; the tooltip keeps the days
    await expect(mintCell.locator('[data-wl-cell]')).toHaveAttribute('data-display', 'PERCENT')
    await expect(mintCell).toContainText('%')
    await mintCell.hover()
    await expect(page.getByRole('tooltip')).toContainText(th.masking.otherProjects)
    await expect(page.getByRole('tooltip')).toContainText(th.workload.tooltip.days(twoDecimals(250)))
    const html = await page.content()
    for (const secret of [MOBILE, MINT_TASK]) expect(html, `page leaks ${secret}`).not.toContain(secret)
    await leaveEditor(page, charterId) // Ivy, a POS member, holds the edit lease; B6/B7 edit the charter as Cindy
  })

  test('B4 FR-1306 cindy: a status change in another tab shows in the board block on focus, without reload', async ({
    page,
    context,
  }) => {
    await loginAs(page, 'cindy')
    const screen = new PageScreen(page)
    await screen.goto(await charterIdOf(POS))
    const live = new LiveBlocks(page)
    const block = live.taskViews().first()
    await live.waitLoaded(block)
    await expect(live.card(block, UAT)).toBeVisible()

    const other = await context.newPage()
    await other.clock.setFixedTime(new Date('2026-09-30T10:00:00+07:00'))
    const tasks = new TaskListPage(other)
    await tasks.goto(await projectIdByName(POS))
    await anyStatusChip(tasks, UAT).click()
    await tasks.pickStatus(S.waitData)
    await other.close()

    await page.bringToFront()
    await page.evaluate(() => {
      document.dispatchEvent(new Event('visibilitychange'))
      window.dispatchEvent(new Event('visibilitychange'))
      window.dispatchEvent(new Event('focus'))
    })
    await expect(
      live.column(block, S.waitData).getByRole('article', { name: UAT, exact: true }),
    ).toBeVisible()
  })

  test('B5 FR-1307 cindy: Cmd+K "ทำ UAT" finds the task, never the charter through block content', async ({
    page,
  }) => {
    await loginAs(page, 'cindy')
    await new HomePage(page).goto()
    const palette = await openPalette(page)
    await palette.typeQuery('ทำ UAT')
    await expect(palette.taskResult(UAT)).toBeVisible()
    await expect(
      palette
        .pageResults()
        .filter({ hasText: th.pages.charterTitle })
        .filter({ hasText: th.palette.matchedInContent }),
    ).toHaveCount(0)
  })

  test('B6 M10-D5 cindy: no มุมมองงาน in a wiki page’s slash menu; in the POS charter it ranks first for /board', async ({
    page,
  }) => {
    await loginAs(page, 'cindy')
    const screen = new PageScreen(page)
    await screen.goto(await idOf('page', LIVE_PAGES.wiki))
    await screen.editor.newBlock()
    await screen.editor.slash(th.editor.slash.taskView.title.slice(0, 3)) // the first three letters
    expect(await screen.editor.slashTitles()).not.toContain(th.editor.slash.taskView.title)
    await page.keyboard.press('Escape')

    await screen.goto(await charterIdOf(POS))
    await screen.editor.newBlock()
    await screen.editor.slash(th.editor.slash.taskView.aliases[1]) // an English alias
    expect((await screen.editor.slashTitles())[0]).toBe(th.editor.slash.taskView.title)
    await page.keyboard.press('Escape')
  })

  test('B7 M10-D8 (S3.1) cindy: a board block is isolated from the editor — drag, click, filters, Cmd+K, Cmd+Z', async ({
    page,
  }) => {
    await loginAs(page, 'cindy')
    const screen = new PageScreen(page)
    await screen.goto(await charterIdOf(POS))
    await screen.editor.expectEditable()
    const live = new LiveBlocks(page)
    const block = live.taskViews().first()
    await live.waitLoaded(block)
    await expect(live.card(block, UAT)).toBeVisible()
    const before = await pageText(page)
    const blockCount = await screen.editor.blocks().count()

    // 1. dnd-kit drag between columns: the status changes; BlockNote's native side-menu drag never starts.
    await page.evaluate(() => {
      const w = window as unknown as { __nativeDragStarts: number }
      w.__nativeDragStarts = 0
      document.addEventListener('dragstart', () => (w.__nativeDragStarts += 1), true)
    })
    const inDoing = await live.column(block, S.doing).getByRole('article', { name: UAT, exact: true }).count()
    const to = inDoing > 0 ? S.todo : S.doing
    await live.dragCard(block, UAT, to)
    await expect(live.column(block, to).getByRole('article', { name: UAT, exact: true })).toBeVisible()
    expect(
      await page.evaluate(() => (window as unknown as { __nativeDragStarts: number }).__nativeDragStarts),
    ).toBe(0)
    await expect(screen.editor.blocks()).toHaveCount(blockCount)

    // 2. A click on the block's empty area: no node selection, focus stays out of the page text; typing edits nothing.
    const column = live.column(block, to)
    const box = await column.boundingBox()
    if (!box) throw new Error('B7: no column box')
    await page.mouse.click(box.x + box.width - 4, box.y + box.height - 4)
    await expect(page.locator('.ProseMirror-selectednode')).toHaveCount(0)
    await page.keyboard.type('zz')
    expect(await pageText(page)).toBe(before)

    // 5. Cmd+Z inside the block (on a card's drag handle, not an input) undoes the task move, not page text.
    const handle = block.getByRole('button', { name: th.tasks.board.cardDragHandle(UAT), exact: true })
    await handle.focus()
    const undone = waitForServerAction(page)
    await page.keyboard.press('ControlOrMeta+z')
    await undone
    await expect(live.column(block, to).getByRole('article', { name: UAT, exact: true })).toHaveCount(0)
    expect(await pageText(page)).toBe(before)

    // 3. Keys in the filter popover's selects never reach the document.
    await block.getByRole('button', { name: th.editor.liveBlocks.filters.button, exact: true }).click()
    const filters = page.getByRole('dialog', { name: th.editor.liveBlocks.filters.button })
    await expect(filters).toBeVisible()
    const limit = filters.getByRole('combobox', { name: th.editor.liveBlocks.filters.limit })
    await limit.focus()
    await page.keyboard.type('ab')
    await page.keyboard.press('Escape')
    await page.keyboard.press('Escape')
    await expect(filters).toBeHidden()
    expect(await pageText(page)).toBe(before)

    // 4. Cmd+K inside the block opens the palette.
    await handle.focus()
    await page.keyboard.press('ControlOrMeta+k')
    const palette = new Palette(page)
    await expect(palette.dialog()).toBeVisible()
    await page.keyboard.press('Escape')
    expect(await pageText(page)).toBe(before)
  })
})

/** The page's own text: the editor's text with every live block left out (their content is server data). */
async function pageText(page: Page): Promise<string> {
  return page.locator('.bn-editor').evaluate((root) => {
    const clone = root.cloneNode(true) as Element
    for (const el of clone.querySelectorAll('[data-live-block]')) el.remove()
    return clone.textContent ?? ''
  })
}
