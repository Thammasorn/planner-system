/**
 * M9 — Workload and person views (plan/m09-workload-people.md §7.3 W1–W11, S6; SPEC §4.10 FR-1001…1009, FR-667 person
 * tab, FR-906 overload part, FR-409/FR-303 load parts, AC-604 verification, §3.3 MASK-2…5, §8.1 badge, §8.5).
 *
 * Determinism (PLAN §4.5, X45/X46): production build, APP_NOW = 2026-09-30 10:00 +07 (this week = 28/9), the browser
 * clock pinned by the auto fixture before the first goto; every describe resets planner_e2e in its own beforeAll (⟲) —
 * `F2+F3` = `resetDb('F2', { alsoFixtures: ['F3'] })`, the §8.5 mock state (M9-D26). Strings come from `th`; numbers via
 * `compactDays` / `twoDecimals` / `formatCd`; dates via `formatWeekHeader` / `formatThaiDate`; user ids via
 * `userIdByNickname`. Waits are on table / grid visibility, `data-save-state`, server-action responses, toasts or text —
 * never sleeps. Masking checks read the JSON the browser received and assert that hidden names / ids are absent.
 *
 * Golden facts used (docs/reference/golden-fixtures.json, r8):
 * - F2 = holiday Fri 23 ต.ค. → Jack and Mint 19/10: 5.00 vs cap 4.00 → OVER +1.00 (CAPACITY); Peter 19/10 2.5/4 OK.
 * - F3 = Peter ลาพักร้อน 5–6 ต.ค. → Peter 5/10: 5.00 vs cap 3.00 → OVER +2.00 (CAPACITY).
 * - F4 = Cindy ลาพักร้อน 12–14 ต.ค.
 * - Cindy 5/10 = CRM 2.50 (TENTATIVE project) only; Mint 5/10 = Mobile 5.00 (hidden from Ivy).
 * - Visibility: Ivy (MEMBER of POS, CRM) sees Cindy, Ivy, Mint; Cindy / Peter / Jack are LEADs (see every user).
 */
import type { Page, Request } from '@playwright/test'
import { cdToNumeric, formatCd } from '../src/domain/units'
import { th } from '../src/i18n/th'
import { formatLeaveRange, formatThaiDate, formatWeekHeader } from '../src/lib/format'
import { workloadDisplayText } from '../src/lib/load/display'
import { compactDays, twoDecimals } from '../src/lib/workload/format'
import {
  expect,
  idOf,
  loginAs,
  projectIdByName,
  resetDb,
  test,
  userIdByNickname,
  waitForServerAction,
  type GoldenLogin,
} from './fixtures'
import { CalendarPage, chipLabel } from './pages/calendar'
import { escapeRe } from './pages/grid'
import { LeaveDialog } from './pages/leave-dialog'
import { MyTasksPage } from './pages/my-tasks'
import { PersonPage } from './pages/people'
import { ProjectPage } from './pages/project'
import { SidebarPage } from './pages/sidebar'
import { TaskListPage } from './pages/tasks'
import { TeamTasksPage } from './pages/team-tasks'
import { undoButtonOf } from './pages/toast'
import { WorkloadPage } from './pages/workload'

const POS = 'POS Upgrade'
const DW = 'Data Warehouse'
const MOBILE = 'Mobile App Revamp'
const CRM = 'CRM Migration'
const STORE = 'Store Analytics Dashboard'
const UAT = 'ทำ UAT + คู่มือหน้าร้าน'
const AUTOMATION = 'ตั้งค่า automation'
const DW_TASK = 'ย้าย pipeline ขึ้น BigQuery'
const MINT_TASK = 'พัฒนา front-end'
const STORE_TASK = 'ทำ dashboard ผู้บริหาร'
const SHARED = 'งานร่วม AC-604'
const VACATION = th.leaveTypes.defaults[0].name

const d1 = (cd: number) => formatCd(cd, { unit: 'DAYS', decimals: 1 })
/** WorkloadCell text in the default display (M11.1-D4/D5: "% of capacity"; M9-D6's compact(load)/compact(cap) is the
 *  DAYS display, checked in e2e/m11.1-milestone-colour-load-percent.spec.ts). */
const cellText = (loadCd: number, capCd: number) => workloadDisplayText(loadCd, capCd, 'PERCENT')
/** The 12 Mondays of the default window [28/9, +12 w). */
const WINDOW = [
  '2026-09-28',
  '2026-10-05',
  '2026-10-12',
  '2026-10-19',
  '2026-10-26',
  '2026-11-02',
  '2026-11-09',
  '2026-11-16',
  '2026-11-23',
  '2026-11-30',
  '2026-12-07',
  '2026-12-14',
] as const
const POSITION_ORDER = ['Project Manager', 'Developer', 'Designer', 'QA', 'Data'] // golden positions with people
const sorted = (xs: readonly string[]) => [...xs].sort()

/** Collects the bodies of every GET whose pathname passes `match` while the page lives (masking checks, §11.2). */
function captureBodies(page: Page, match: (pathname: string) => boolean): () => Promise<string[]> {
  const bodies: Promise<string>[] = []
  page.on('response', (r) => {
    if (r.request().method() === 'GET' && match(new URL(r.url()).pathname))
      bodies.push(r.text().catch(() => ''))
  })
  return async () => Promise.all(bodies)
}

async function expectNoNeedles(bodies: readonly string[], needles: readonly string[]): Promise<void> {
  expect(bodies.length, 'captured responses').toBeGreaterThan(0)
  for (const body of bodies) for (const n of needles) expect(body.includes(n), `leaked "${n}"`).toBe(false)
}

async function openWorkload(page: Page, who: GoldenLogin): Promise<WorkloadPage> {
  await loginAs(page, who)
  const wl = new WorkloadPage(page)
  await wl.goto()
  return wl
}

// ── W1 ───────────────────────────────────────────────────────────────────────────────────────────────────────
test.describe('W1 ⟲ F2+F3 (FR-1001/1002/1006, §8.5, PRIN-P6) manager reads the table and the overload list', () => {
  test.beforeAll(async () => {
    await resetDb('F2', { alsoFixtures: ['F3'] })
  })

  test('groups by position, 12 weeks from 28/9, 5/4 🔴 and 5/3 🔴; list tab (3) → fix link focuses the week', async ({
    page,
  }) => {
    const peter = await userIdByNickname('Peter')
    const wl = await openWorkload(page, 'manager')
    await expect(page).toHaveURL((u) => u.pathname === '/workload')
    await expect(wl.sidebar.workloadLink()).toHaveAttribute('aria-current', 'page')

    await expect(wl.groupHeaders()).toHaveText(POSITION_ORDER)
    expect(await wl.weeks()).toEqual([...WINDOW])
    await expect(wl.weekHeaders().first()).toContainText(formatWeekHeader('2026-09-28'))
    await expect(wl.weekHeaders().last()).toContainText(formatWeekHeader('2026-12-14'))
    await expect(wl.weekHeaders().first()).toHaveAttribute('data-today', 'true')
    expect(sorted(await wl.personNames())).toEqual(sorted(['Cindy', 'Mint', 'Jack', 'Ivy', 'Peter'])) // no Manager

    const jack = wl.cell('Jack', '2026-10-19')
    await expect(wl.cellText(jack)).toHaveText(cellText(500, 400))
    await expect(jack).toHaveAttribute('data-level', 'OVER')
    await expect(wl.glyph(jack)).toHaveText(th.overload.glyph.OVER)
    await expect(jack).toContainText(th.overload.level.OVER) // hidden status text — never colour alone (A11Y-1)
    await expect(jack).toHaveAccessibleName(new RegExp(escapeRe(th.overload.cause.CAPACITY)))

    const peter5 = wl.cell('Peter', '2026-10-05')
    await expect(wl.cellText(peter5)).toHaveText(cellText(500, 300))
    await expect(peter5).toHaveAttribute('data-level', 'OVER')
    await expect(wl.glyph(peter5)).toHaveText(th.overload.glyph.OVER)

    const peter19 = wl.cell('Peter', '2026-10-19')
    await expect(wl.cellText(peter19)).toHaveText(cellText(250, 400))
    await expect(peter19).toHaveAttribute('data-level', 'OK')
    await expect(wl.glyph(peter19)).toHaveCount(0)

    await expect(wl.overloadsTab(3)).toBeVisible()
    await wl.openOverloadsTab()
    const rows = wl.overloadRows()
    await expect(rows.locator('th[scope="row"]')).toHaveText(['Peter', 'Jack', 'Mint'])
    const expected = [
      { week: '2026-10-05', excessCd: 200 },
      { week: '2026-10-19', excessCd: 100 },
      { week: '2026-10-19', excessCd: 100 },
    ] as const
    for (const [i, e] of expected.entries()) {
      const row = rows.nth(i) // the list order itself is under test (M9-D10)
      await expect(row).toHaveAttribute('data-week', e.week)
      await expect(row).toContainText(formatThaiDate(e.week, 'medium'))
      await expect(row).toContainText(th.overload.level.OVER)
      await expect(row).toContainText(th.overload.excess(twoDecimals(e.excessCd)))
      await expect(row).toContainText(th.overload.cause.CAPACITY)
    }

    await wl.fixLink('Peter', '2026-10-05').click()
    await page.waitForURL(
      (u) => u.pathname === `/people/${peter}/plan` && u.searchParams.get('week') === '2026-10-05',
    )
    const grid = new PersonPage(page).grid('Peter')
    await grid.waitPersonReady()
    await expect(grid.columnHeader('2026-10-05')).toHaveAttribute('data-focus-week', 'true')
  })
})

// ── W2 ───────────────────────────────────────────────────────────────────────────────────────────────────────
test.describe('W2 ⟲ F2+F3 (FR-1003/1004, FR-405) views without refetch, filters in the URL, certainty live', () => {
  test.beforeAll(async () => {
    await resetDb('F2', { alsoFixtures: ['F3'] })
  })

  test('views switch on the client; position / project / onlyOver filters select people; CRM → แน่นอน updates Cindy', async ({
    page,
  }) => {
    const wl = await openWorkload(page, 'manager')
    await wl.setView('ALL')
    const cindy5 = () => wl.cell('Cindy', '2026-10-05')
    await expect(wl.cellText(cindy5())).toHaveText(cellText(250, 500))

    // view switches never refetch /api/workload (M9-D2)
    let tableRequests = 0
    const onRequest = (r: Request) => {
      if (new URL(r.url()).pathname === '/api/workload') tableRequests++
    }
    page.on('request', onRequest)
    await wl.setView('COMMITTED')
    await expect(wl.cellText(cindy5())).toHaveText(th.workload.cell.empty) // CRM is TENTATIVE → committed 0
    await wl.setView('AT_RISK')
    await expect(cindy5()).toHaveAttribute('data-palette', 'tentative')
    await wl.setView('ALL')
    await expect(wl.cellText(cindy5())).toHaveText(cellText(250, 500))
    page.off('request', onRequest)
    expect(tableRequests).toBe(0)

    // filters select people (cells keep the full load) and live in the URL (M9-D5)
    await wl.filterPosition('Data')
    await expect(wl.personLinks()).toHaveText(['Peter'])
    await expect(page).toHaveURL(/[?&]positionId=/)
    await wl.clearFilters()
    await expect(wl.personLinks()).toHaveCount(5)

    await wl.filterProject(MOBILE)
    await expect.poll(async () => sorted(await wl.personNames())).toEqual(['Jack', 'Mint'])
    await expect(page).toHaveURL(/[?&]projectId=/)
    await wl.clearFilters()
    await expect(wl.personLinks()).toHaveCount(5)

    await wl.onlyOver(true)
    await expect.poll(async () => sorted(await wl.personNames())).toEqual(['Jack', 'Mint', 'Peter'])
    await expect(page).toHaveURL(/[?&]onlyOver=/)
    await wl.onlyOver(false)
    await expect(wl.personLinks()).toHaveCount(5)
    await expect(page).not.toHaveURL(/onlyOver=/)

    // FR-405: certainty change elsewhere refreshes /workload without a page reload (invalidateLoad)
    await page.evaluate(() => {
      ;(window as unknown as { __m9Marker?: number }).__m9Marker = 1
    })
    const crm = await projectIdByName(CRM)
    await wl.sidebar.projectLink(CRM).click()
    await page.waitForURL((u) => u.pathname === `/projects/${crm}/overview`)
    const project = new ProjectPage(page)
    await project.setCertainty('CONFIRMED')
    await wl.goto()
    await wl.setView('COMMITTED')
    await expect(wl.cellText(cindy5())).toHaveText(cellText(250, 500))
    expect(await page.evaluate(() => (window as unknown as { __m9Marker?: number }).__m9Marker)).toBe(1)
    await wl.setView('ALL') // leave the preference as the seed had it
  })
})

// ── W3 ───────────────────────────────────────────────────────────────────────────────────────────────────────
test.describe('W3 ⟲ F3 (FR-1005) the side panel lists the tasks behind a number', () => {
  test.beforeAll(async () => {
    await resetDb('F3')
  })

  test('Peter 5/10 → panel with the DW task 5.00 and ล้น; Esc returns focus; the link opens the task in its plan', async ({
    page,
  }) => {
    const dw = await projectIdByName(DW)
    const wl = await openWorkload(page, 'manager')
    const cell = wl.cell('Peter', '2026-10-05')
    await cell.click()
    const panel = wl.panel('Peter', '2026-10-05')
    await expect(panel).toBeVisible()
    await expect(panel.getByRole('heading', { level: 2 })).toHaveText(
      th.workload.panel.title('Peter', formatWeekHeader('2026-10-05')),
    )
    const item = panel.locator('li[data-item-kind="task"]').filter({ hasText: DW_TASK })
    await expect(item).toHaveCount(1)
    await expect(item).toContainText(th.workload.tooltip.days(twoDecimals(500)))
    await expect(item).toContainText(DW)
    await expect(panel).toContainText(th.overload.level.OVER)
    await expect(panel).toContainText(th.overload.excess(twoDecimals(200)))

    await page.keyboard.press('Escape')
    await expect(panel).toHaveCount(0)
    await expect(cell).toBeFocused()

    await cell.click()
    await expect(panel).toBeVisible()
    const taskId = await item.getAttribute('data-task-id')
    expect(taskId).toMatch(/^[0-9a-f-]{36}$/)
    await wl.panelTaskLink(panel, DW_TASK).click()
    await page.waitForURL(
      (u) => u.pathname === `/projects/${dw}/plan` && u.searchParams.get('task') === taskId,
    )
    await expect(new TaskListPage(page).panelTitle(DW_TASK)).toBeVisible()
  })
  test('1440 px with the panel closed: no horizontal page scroll; 390 px: the panel is a sheet over the table, Esc returns focus', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    const wl = await openWorkload(page, 'manager')
    await expect(wl.panel('Peter', '2026-10-05')).toHaveCount(0)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)

    await page.setViewportSize({ width: 390, height: 844 })
    const cell = wl.cell('Peter', '2026-10-05')
    await cell.click()
    const sheet = wl.panelSheet('Peter', '2026-10-05')
    await expect(sheet).toBeVisible()
    await expect(sheet).toHaveAttribute('aria-modal', 'true')
    await expect(sheet.locator('li[data-item-kind="task"]').filter({ hasText: DW_TASK })).toHaveCount(1)
    // the sheet covers the table, it does not replace it (the modal aria-hides it, so match by data attributes)
    await expect(wl.table()).toBeAttached()
    const peterId = await userIdByNickname('Peter')
    await expect(
      wl.table().locator(`tr[data-user-id="${peterId}"] [data-wl-cell][data-week="2026-10-05"]`),
    ).toBeAttached()

    await page.keyboard.press('Escape')
    await expect(sheet).toHaveCount(0)
    await expect(cell).toBeFocused()
  })
})

// ── W4 ───────────────────────────────────────────────────────────────────────────────────────────────────────
test.describe('W4 ⟲ F2+F3 (MASK-2/3/4, FR-1008 404) Ivy sees only her people and masked parts', () => {
  test.use({ allowedConsoleErrors: [/status of 404/] })
  test.beforeAll(async () => {
    await resetDb('F2', { alsoFixtures: ['F3'] })
  })

  test('rows Cindy / Ivy / Mint; Mint 5/10 tooltip = งานในโปรเจคอื่น 5.00; no hidden name or id; Jack / Peter pages 404', async ({
    page,
  }) => {
    const [jack, peter] = await Promise.all([userIdByNickname('Jack'), userIdByNickname('Peter')])
    const bodies = captureBodies(page, (p) => p.startsWith('/api/workload'))
    const wl = await openWorkload(page, 'ivy')
    expect(sorted(await wl.personNames())).toEqual(['Cindy', 'Ivy', 'Mint'])

    const tip = await wl.hover('Mint', '2026-10-05')
    await expect(tip).toContainText(
      `${th.masking.otherProjects} ${th.workload.tooltip.days(twoDecimals(500))}`,
    )
    await expect(tip).not.toContainText(MOBILE)

    await expectNoNeedles(await bodies(), [MOBILE, MINT_TASK, DW, DW_TASK, STORE, jack, peter])

    const person = new PersonPage(page)
    for (const id of [jack, peter]) {
      const { status } = await person.goto(id, 'plan')
      expect(status, id).toBe(404)
      await expect(person.notFound()).toBeVisible()
      expect(await page.content()).not.toContain(MOBILE)
    }
  })
})

// ── W5 ───────────────────────────────────────────────────────────────────────────────────────────────────────
test.describe('W5 ⟲ F2+F3 (FR-1007, X31) the sidebar badge per viewer, live after a leave delete', () => {
  test.describe.configure({ mode: 'serial' })
  test.beforeAll(async () => {
    await resetDb('F2', { alsoFixtures: ['F3'] })
  })

  for (const [who, n] of [
    ['manager', 3],
    ['ivy', 1],
    ['mint', 2],
    ['peter', 3],
  ] as const) {
    test(`${who}: ●${n} with its spoken label`, async ({ page }) => {
      await loginAs(page, who)
      const sidebar = new SidebarPage(page)
      await sidebar.shell.goto('/home')
      await expect(sidebar.workloadBadge()).toHaveAccessibleName(th.workload.badge.label(n))
      await expect(sidebar.workloadBadge()).toContainText(String(n))
      await expect(sidebar.workloadLink()).toHaveAttribute('href', '/workload')
    })
  }

  test('peter deletes his 5–6 ต.ค. leave on /calendar → the badge reads 2 without a reload', async ({
    page,
  }) => {
    await loginAs(page, 'peter')
    const cal = new CalendarPage(page)
    await cal.goto('2026-10')
    const sidebar = new SidebarPage(page)
    await expect(sidebar.workloadBadge()).toHaveAccessibleName(th.workload.badge.label(3))
    await cal.chip('2026-10-05', chipLabel('Peter', VACATION)).click()
    const dialog = new LeaveDialog(page)
    await dialog.expectOpen('edit')
    await dialog.delete() // the undo toast is left alone
    await expect(sidebar.workloadBadge()).toHaveAccessibleName(th.workload.badge.label(2))
    await expect(sidebar.workloadBadge()).toContainText('2')
  })
})

// ── W6 ───────────────────────────────────────────────────────────────────────────────────────────────────────
test.describe('W6 ⟲ (FR-1008, MASK-4) Cindy on Peter’s page: header + one masked row only', () => {
  test.beforeAll(async () => {
    await resetDb()
  })

  test('header Peter · Data · จ–ศ 1.00; grid = m:<peter> 5.0 / 2.5, no project row, no quick add; no hidden names', async ({
    page,
  }) => {
    const peter = await userIdByNickname('Peter')
    await loginAs(page, 'cindy')
    const bodies = captureBodies(page, (p) => p.startsWith('/api/grid/person/'))
    const person = new PersonPage(page)
    expect((await person.goto(peter, 'plan')).status).toBe(200)

    await expect(person.heading()).toHaveText('Peter')
    await expect(person.position()).toContainText('Data')
    const short = th.employees.schedule.weekdayShort
    await expect(person.schedule()).toContainText(
      th.people.schedule.perDay(`${short[1]}–${short[5]}`, cdToNumeric(100)),
    )
    await expect(person.tab('plan')).toHaveAttribute('aria-selected', 'true')

    const grid = person.grid('Peter')
    await grid.waitPersonReady()
    await expect(grid.maskedRows()).toHaveCount(1)
    await expect(grid.maskedRows()).toHaveAttribute('data-row-key', `m:${peter}`)
    await expect(grid.maskedRows()).toHaveAccessibleName(th.masking.otherProjects)
    await expect(grid.projectRows()).toHaveCount(0)
    await expect(grid.root().getByRole('textbox', { name: th.grid.row.addTaskLabel })).toHaveCount(0)
    await expect(grid.value(await grid.reveal(`m:${peter}`, '2026-09-28'))).toHaveText(d1(500))
    // M11.1 (FR-1008/FR-1010): the person footer follows load.display — default %; days → "5/5"
    await expect(grid.footerLoad('W:2026-09-28').locator('[data-footer-text]')).toHaveText(/^\d+%$/)
    await grid.setLoadDisplay('DAYS')
    await expect(grid.footerLoad('W:2026-09-28').locator('[data-footer-text]')).toHaveText(
      new RegExp(`^${escapeRe(compactDays(500))}/`),
    )
    await expect(grid.value(await grid.reveal(`m:${peter}`, '2026-10-19'))).toHaveText(d1(250))

    await expectNoNeedles(await bodies(), [DW, DW_TASK, STORE, STORE_TASK])
  })
})

// ── W7 ───────────────────────────────────────────────────────────────────────────────────────────────────────
test.describe('W7 ⟲ (AC-604) one task, two people: each person page shows only its own number', () => {
  test.beforeAll(async () => {
    await resetDb()
  })

  test('Jack 3 + Mint 2 in 16–20 พ.ย. → /people/Jack 3.0 (footer 5.5 ⚠), /people/Mint 2.0 (footer 2.0)', async ({
    page,
  }) => {
    const [mobile, jack, mint] = await Promise.all([
      projectIdByName(MOBILE),
      userIdByNickname('Jack'),
      userIdByNickname('Mint'),
    ])
    await loginAs(page, 'jack')
    const tasks = new TaskListPage(page)
    await tasks.goto(mobile)
    await tasks.addTasks([SHARED])
    await tasks.settledId(SHARED)
    await tasks.openAssigneePicker(SHARED)
    await tasks.pickAssignee('Jack')
    await tasks.pickAssignee('Mint')
    await tasks.closePicker()
    await tasks.openPanel(SHARED)
    let plan = await tasks.planFor('Jack', SHARED)
    await plan.fill('3', '2026-11-16', '2026-11-20')
    await plan.apply()
    plan = await tasks.planFor('Mint', SHARED)
    await plan.fill('2', '2026-11-16', '2026-11-20')
    await plan.apply()

    const person = new PersonPage(page)
    expect((await person.goto(jack, 'plan')).status).toBe(200)
    let grid = person.grid('Jack')
    await grid.waitPersonReady()
    await expect(person.projectRow(mobile)).toBeVisible()
    const jackRow = await grid.rowKeyOf(SHARED, 'Jack')
    const rIndex = async (rowKey: string) => Number(await grid.rowHeaderByKey(rowKey).getAttribute('data-r'))
    expect(await rIndex(`p:${mobile}`)).toBeLessThan(await rIndex(jackRow)) // under the Mobile project row
    await expect(grid.value(await grid.reveal(jackRow, '2026-11-16'))).toHaveText(d1(300))
    await grid.setLoadDisplay('DAYS') // M11.1: the footer numbers below are the days display (default is %)
    await expect(grid.rowHeader(SHARED, 'Mint')).toHaveCount(0)
    // footer = Jack's full load: 3.0 + Store 2.5 (TENTATIVE) = 5.5 vs 5 → RISK (⚠ + hidden text, never colour alone)
    await expect(grid.footerLoad('W:2026-11-16').locator('[data-footer-text]')).toHaveText(
      new RegExp(`^${escapeRe(compactDays(550))}/`),
    )
    await expect(grid.footerGlyph('2026-11-16')).toHaveAttribute('data-glyph', 'risk')
    await expect(grid.footerLoad('W:2026-11-16')).toContainText(th.overload.level.RISK)

    expect((await person.goto(mint, 'plan')).status).toBe(200)
    grid = person.grid('Mint')
    await grid.waitPersonReady()
    const mintRow = await grid.rowKeyOf(SHARED, 'Mint')
    await expect(grid.value(await grid.reveal(mintRow, '2026-11-16'))).toHaveText(d1(200))
    await expect(grid.rowHeader(SHARED, 'Jack')).toHaveCount(0)
    await expect(grid.footerLoad('W:2026-11-16').locator('[data-footer-text]')).toHaveText(
      new RegExp(`^${escapeRe(compactDays(200))}/`),
    ) // still days: one preference for every screen (M11.1-D4)
  })
})

// ── W8 ───────────────────────────────────────────────────────────────────────────────────────────────────────
test.describe('W8 ⟲ (FR-906, M7-D15, person-grid edit) edits from the person grid; overload lines after leave', () => {
  test.describe.configure({ mode: 'serial' })
  test.beforeAll(async () => {
    await resetDb()
  })

  test('Ivy types 3 on her CRM row in week 19/10 → her workload cell reads 3/5 without a reload', async ({
    page,
  }) => {
    const ivy = await userIdByNickname('Ivy')
    const wl = await openWorkload(page, 'ivy')
    await expect(wl.cellText(wl.cell('Ivy', '2026-10-19'))).toHaveText(cellText(250, 500))
    await page.evaluate(() => {
      ;(window as unknown as { __m9Marker?: number }).__m9Marker = 1
    })

    await wl.row('Ivy').getByRole('link', { name: 'Ivy', exact: true }).click() // client-side → person grid
    await page.waitForURL((u) => u.pathname === `/people/${ivy}/plan`)
    const grid = new PersonPage(page).grid('Ivy')
    await grid.waitPersonReady()
    const row = await grid.rowKeyOf(AUTOMATION, 'Ivy')
    const cell = await grid.reveal(row, '2026-10-19')
    await grid.typeInto(cell, '3')
    await grid.waitSaved()
    await expect(grid.value(cell)).toHaveText(d1(300))

    await wl.goto()
    await expect(wl.cellText(wl.cell('Ivy', '2026-10-19'))).toHaveText(cellText(300, 500))
    expect(await page.evaluate(() => (window as unknown as { __m9Marker?: number }).__m9Marker)).toBe(1)
  })

  test('Peter records 5–6 ต.ค. → capacity line (M5) and the new OVER line with a fix link', async ({
    page,
  }) => {
    const peter = await userIdByNickname('Peter')
    await loginAs(page, 'peter')
    const cal = new CalendarPage(page)
    await cal.goto('2026-10')
    const dialog = new LeaveDialog(page)
    await cal.reportLeave()
    await dialog.expectOpen('create')
    await dialog.setDate(th.timeOff.dialog.startDate, '2026-10-05')
    await dialog.setDate(th.timeOff.dialog.endDate, '2026-10-06')
    await expect(dialog.typeSelect()).toHaveText(VACATION)
    await dialog.save()
    await expect(dialog.saved()).toBeVisible()
    await expect(dialog.impactLines()).toHaveText([
      th.capacity.impactLine(formatThaiDate('2026-10-05'), cdToNumeric(500), cdToNumeric(300)),
    ])
    const line = dialog.overloadLine('2026-10-05')
    await expect(dialog.overloadLines()).toHaveCount(1)
    await expect(line).toContainText(
      th.overload.impact.line(
        formatThaiDate('2026-10-05'),
        th.overload.level.OVER,
        th.overload.excess(twoDecimals(200)),
        th.overload.cause.CAPACITY,
      ),
    )
    await expect(line.getByRole('link', { name: th.overload.impact.fix, exact: true })).toHaveAttribute(
      'href',
      `/people/${peter}/plan?week=2026-10-05`,
    )
    await expect(line).toContainText(th.overload.impact.part(DW, twoDecimals(500)))
  })
})

// ── W9 ───────────────────────────────────────────────────────────────────────────────────────────────────────
test.describe('W9 ⟲ (FR-1009, FR-667, X22) /my buckets, tick + undo, board view, phone width', () => {
  test.beforeAll(async () => {
    await resetDb()
  })

  test('สัปดาห์นี้ [UAT 2.50 วัน] · หลังจากนั้น [automation from 12/10]; count 1 → 0 → 1; บอร์ด; 390 px', async ({
    page,
  }) => {
    await loginAs(page, 'ivy')
    const my = new MyTasksPage(page)
    const sidebar = new SidebarPage(page)
    await my.goto()
    await expect(my.bucketTaskLinks('THIS_WEEK')).toHaveText([UAT])
    await expect(my.planned(UAT)).toHaveText(th.my.planned(twoDecimals(250)))
    await expect(my.bucket('NEXT_WEEK')).toContainText(th.my.emptyBucket)
    await expect(my.bucketTaskLinks('LATER')).toHaveText([AUTOMATION])
    await expect(my.item(AUTOMATION)).toContainText(th.my.fromWeek(formatWeekHeader('2026-10-12')))
    await expect(my.bucket('UNPLANNED')).toHaveCount(0) // hidden when empty
    await expect(sidebar.myTaskCount()).toHaveText('1') // = open tasks in สัปดาห์นี้ (M9-D17)

    await my.tick(UAT)
    await expect(my.bucketTaskLinks('THIS_WEEK')).toHaveCount(0)
    await expect(sidebar.myTaskCount()).toHaveText('0')
    // BR-52: completing in week 28/9 releases the 1.25 days of 5/10
    const toast = th.tasks.toast.released(formatCd(125, { unit: 'DAYS', decimals: 1 }), 1)
    const restored = waitForServerAction(page)
    await undoButtonOf(page, toast).click()
    await restored
    await expect(my.bucketTaskLinks('THIS_WEEK')).toHaveText([UAT])
    await expect(sidebar.myTaskCount()).toHaveText('1')

    await my.setView('board')
    await expect(page).toHaveURL(/[?&]view=board(&|$)/)
    const board = new TaskListPage(page)
    await expect(board.card(UAT)).toBeVisible()
    await expect(board.card(AUTOMATION)).toBeVisible()

    await page.setViewportSize({ width: 390, height: 844 })
    await my.setView('weeks')
    await expect(my.bucketTaskLinks('THIS_WEEK')).toHaveText([UAT])
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  })
})

// ── W10 ──────────────────────────────────────────────────────────────────────────────────────────────────────
test.describe('W10 ⟲ F4 (FR-667 person tab, วันลา tab, MASK-5) person tabs as Cindy, Ivy and Peter', () => {
  test.describe.configure({ mode: 'serial' })
  test.beforeAll(async () => {
    await resetDb('F4')
  })

  test("Cindy on Ivy's งาน tab: her two tasks in the list, then the board", async ({ page }) => {
    const ivy = await userIdByNickname('Ivy')
    await loginAs(page, 'cindy')
    const person = new PersonPage(page)
    expect((await person.goto(ivy, 'tasks')).status).toBe(200)
    await expect(person.tab('tasks')).toHaveAttribute('aria-selected', 'true')
    await person.waitTasksReady()
    await expect
      .poll(async () => sorted(await person.taskLinks().allTextContents()))
      .toEqual(sorted([UAT, AUTOMATION]))
    await new TeamTasksPage(page).setView('board')
    await expect(person.board().card(UAT)).toBeVisible()
    await expect(person.board().card(AUTOMATION)).toBeVisible()
  })

  test("Ivy on Cindy's วันลา tab: one entry ลา 12–14 ต.ค., no type, no actions", async ({ page }) => {
    const cindy = await userIdByNickname('Cindy')
    await loginAs(page, 'ivy')
    const person = new PersonPage(page)
    expect((await person.goto(cindy, 'leave')).status).toBe(200)
    const range = formatLeaveRange('2026-10-12', '2026-10-14', null)
    const entries = person.leaveEntries('upcoming')
    await expect(entries).toHaveCount(1)
    await expect(entries).toContainText(range)
    await expect(entries).toContainText(th.masking.leave)
    await expect(entries).not.toContainText(VACATION)
    await expect(entries).toHaveAttribute('data-kind', 'masked')
    await expect(person.editLeaveButton(range)).toHaveCount(0)
    await expect(person.addLeaveButton()).toHaveCount(0)
  })

  test("Peter (LEAD → sees Ivy) on Ivy's งาน tab: empty with the hidden-projects hint; no POS / CRM in /api/tasks", async ({
    page,
  }) => {
    const ivy = await userIdByNickname('Ivy')
    await loginAs(page, 'peter')
    const bodies = captureBodies(page, (p) => p === '/api/tasks')
    const person = new PersonPage(page)
    expect((await person.goto(ivy, 'tasks')).status).toBe(200)
    await person.waitTasksReady()
    await expect(person.tasksEmpty()).toBeVisible()
    await expect(person.tasksHint()).toHaveText(th.people.tasks.hiddenHint)
    await expect(person.taskLinks()).toHaveCount(0)
    await expectNoNeedles(await bodies(), [POS, CRM, UAT, AUTOMATION])
  })
})

// ── W11 ──────────────────────────────────────────────────────────────────────────────────────────────────────
test.describe('W11 ⟲ (FR-409, FR-303) load on the project overview and the client page', () => {
  test.beforeAll(async () => {
    await resetDb()
  })

  test('Cindy: POS members 2.50 / 3.75 / 11.25, 12 bars, 14/12 committed 0.00; Coral 17.50 (visible only)', async ({
    page,
  }) => {
    const [pos, coral, cindy, ivy, mint] = await Promise.all([
      projectIdByName(POS),
      idOf('client', 'Coral'),
      userIdByNickname('Cindy'),
      userIdByNickname('Ivy'),
      userIdByNickname('Mint'),
    ])
    await loginAs(page, 'cindy')
    const project = new ProjectPage(page)
    await project.goto(pos)
    const section = page.getByTestId('project-load')
    await expect(section.getByRole('heading', { name: th.workload.projectLoad.heading })).toBeVisible()
    const sum = (userId: string) => section.locator(`tr[data-user-id="${userId}"] [data-testid="member-sum"]`)
    await expect(sum(cindy)).toHaveText(twoDecimals(250))
    await expect(sum(ivy)).toHaveText(twoDecimals(375))
    await expect(sum(mint)).toHaveText(twoDecimals(1125))
    const bars = page.getByTestId('project-load-bars').getByRole('listitem')
    await expect(bars).toHaveCount(12)
    await expect(bars.and(page.locator('[data-week="2026-12-14"]'))).toHaveAccessibleName(
      th.workload.projectLoad.bar(formatWeekHeader('2026-12-14'), twoDecimals(500), twoDecimals(0)),
    )

    await project.shell.goto(`/clients/${coral}`)
    const load = page.getByTestId('client-load')
    await expect(load).toContainText(th.workload.clientLoad.total(twoDecimals(1750)))
    await expect(load).toContainText(th.workload.clientLoad.visibleOnly)
  })

  test('manager: Coral 33.75 over POS + DW, without the visible-only note', async ({ page }) => {
    const coral = await idOf('client', 'Coral')
    await loginAs(page, 'manager')
    await new SidebarPage(page).shell.goto(`/clients/${coral}`)
    const load = page.getByTestId('client-load')
    await expect(load).toContainText(th.workload.clientLoad.total(twoDecimals(3375)))
    await expect(load).not.toContainText(th.workload.clientLoad.visibleOnly)
  })
})
