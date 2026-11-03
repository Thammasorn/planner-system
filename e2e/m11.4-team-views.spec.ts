/**
 * M11.4 (owner request 2026-11-03; SPEC v3.8 FR-668 ตาราง, FR-669 ปฏิทิน, AC-617/618): /tasks gets two more views.
 * ตาราง = real tasks in the M11 database-table look (sort by header, edit status in the cell, show/hide columns in
 * `tasks.table`, right-click delete with undo); ปฏิทิน = the project calendar across every visible project, bars from
 * the plan (BR-103a) via GET /api/tasks/plan-spans, masked like /api/tasks.
 *
 * Determinism (PLAN §4.5): APP_NOW = 2026-09-30, golden F1 — no golden task has dates, so POS "ทำ UAT + คู่มือหน้าร้าน"
 * is a plan-only bar 14/9 … 9/10 (its grid weeks, Mon–Fri). Peter is a member of Data Warehouse and Store only.
 */
import type { Locator, Page, Response } from '@playwright/test'
import { th } from '../src/i18n/th'
import type { TeamPlanSpansResponse } from '../src/lib/contracts/plan-spans'
import type { TeamTasksResponse } from '../src/lib/contracts/tasks'
import { expect, loginAs, projectIdByName, resetDb, test, waitForServerAction } from './fixtures'
import { TaskListPage } from './pages/tasks'
import { undoButtonOf } from './pages/toast'
import { taskIdOf } from './support/seed-tasks'

const POS = 'POS Upgrade'
const UAT = 'ทำ UAT + คู่มือหน้าร้าน'

const grid = (page: Page) => page.getByRole('grid', { name: th.teamTasks.table.label })
const viewButton = (page: Page, label: string) =>
  page.getByRole('group', { name: th.tasks.view.label }).getByRole('button', { name: label, exact: true })
const header = (page: Page, label: string) =>
  grid(page).getByRole('columnheader').filter({ has: page.getByRole('button', { name: label, exact: true }) })
const rowOf = (page: Page, taskId: string): Locator => grid(page).locator(`[role="row"][data-task-id="${taskId}"]`)
const cellOf = (page: Page, taskId: string, column: string): Locator =>
  rowOf(page, taskId).locator(`[role="gridcell"][data-column="${column}"]`)
/** Task names of the table rows, top to bottom (the visible name text, without the parent path). */
const rowNames = (page: Page) =>
  grid(page)
    .locator('[role="row"][data-task-id] [data-column="name"] [data-task-name]')
    .evaluateAll((els) => els.map((e) => e.getAttribute('title') ?? ''))

test.describe('TV ⟲ (AC-617, FR-668) the ตาราง view · cindy', () => {
  test.beforeAll(async () => {
    await resetDb()
  })

  test('TV1 switch to ตาราง (URL + preference survive reload), sort by header, hide a column', async ({ page }) => {
    await loginAs(page, 'cindy')
    await page.goto('/tasks')
    await expect(viewButton(page, th.tasks.view.list)).toHaveAttribute('aria-pressed', 'true')
    const saved = waitForServerAction(page)
    await viewButton(page, th.tasks.view.table).click()
    await saved
    await expect(grid(page)).toBeVisible()
    await expect.poll(() => new URL(page.url()).searchParams.get('view')).toBe('table')
    await page.reload()
    await expect(grid(page)).toBeVisible()
    // the preference alone (no ?view=) also opens the table
    await page.goto('/tasks')
    await expect(grid(page)).toBeVisible()
    await expect(grid(page).locator('[role="row"][data-task-id]').first()).toBeVisible()

    const names = await rowNames(page)
    expect(names.length).toBeGreaterThan(2)
    const nameHeader = header(page, th.teamTasks.table.columns.name)
    const collator = new Intl.Collator('th')
    await nameHeader.getByRole('button').click()
    await expect(nameHeader).toHaveAttribute('aria-sort', 'ascending')
    expect(await rowNames(page)).toEqual([...names].sort(collator.compare))
    await nameHeader.getByRole('button').click()
    await expect(nameHeader).toHaveAttribute('aria-sort', 'descending')
    expect(await rowNames(page)).toEqual([...names].sort(collator.compare).reverse())
    await nameHeader.getByRole('button').click()
    await expect(nameHeader).toHaveAttribute('aria-sort', 'none')
    expect(await rowNames(page)).toEqual(names)

    // hide ภาระรวม → persisted in tasks.table
    await page.getByRole('button', { name: th.teamTasks.table.columnsButton }).click()
    const hidden = waitForServerAction(page)
    await page
      .getByRole('menu', { name: th.teamTasks.table.columnsMenu })
      .getByRole('menuitemcheckbox', { name: th.teamTasks.table.columns.load })
      .click()
    await hidden
    await page.keyboard.press('Escape')
    await expect(header(page, th.teamTasks.table.columns.load)).toHaveCount(0)
    await page.reload()
    await expect(grid(page)).toBeVisible()
    await expect(header(page, th.teamTasks.table.columns.load)).toHaveCount(0)
    await expect(header(page, th.teamTasks.table.columns.status)).toHaveCount(1)
  })

  test('TV2 edit the status in the table; keyboard Enter on a cell; right-click delete → undo', async ({ page }) => {
    await loginAs(page, 'cindy')
    await page.goto('/tasks?view=table')
    const uat = await taskIdOf(POS, UAT)
    const status = cellOf(page, uat, 'status')
    await expect(status).toBeVisible()
    // keyboard: focus the name cell, → → to สถานะ (project, then status), Enter opens the status menu
    await cellOf(page, uat, 'name').focus()
    await page.keyboard.press('ArrowRight')
    await page.keyboard.press('ArrowRight')
    await expect(status).toBeFocused()
    await page.keyboard.press('Enter')
    const dialog = page.getByRole('dialog', { name: th.tasks.status.label })
    await expect(dialog).toBeVisible()
    const saved = waitForServerAction(page)
    await dialog.getByRole('option', { name: new RegExp(th.tasks.status.defaults.doing) }).click()
    await saved
    await expect(status).toContainText(th.tasks.status.defaults.doing)
    await page.reload()
    await expect(cellOf(page, uat, 'status')).toContainText(th.tasks.status.defaults.doing)

    // right-click → ลบงาน: gone at once, เลิกทำ brings it back
    await cellOf(page, uat, 'project').click({ button: 'right' })
    const menu = page.getByRole('menu', { name: th.teamTasks.table.rowMenu.label })
    await expect(menu).toBeVisible()
    const deleted = waitForServerAction(page)
    await menu.getByRole('menuitem', { name: th.teamTasks.table.rowMenu.delete }).click()
    await deleted
    await expect(rowOf(page, uat)).toHaveCount(0)
    const restored = waitForServerAction(page)
    await undoButtonOf(page, th.tasks.toast.deleted(UAT)).click()
    await restored
    await expect(rowOf(page, uat)).toHaveCount(1)
  })

  test('TV3 a row click opens the task panel beside the table', async ({ page }) => {
    await loginAs(page, 'cindy')
    await page.goto('/tasks?view=table')
    const uat = await taskIdOf(POS, UAT)
    await cellOf(page, uat, 'blockers').click() // ภาระรวม was hidden by TV1 (tasks.table persists)
    await expect.poll(() => new URL(page.url()).searchParams.get('task')).toBe(uat)
    await expect(new TaskListPage(page).panelTitle(UAT)).toBeVisible()
    expect(new URL(page.url()).searchParams.get('view')).toBe('table')
  })
})

test.describe('TC ⟲ (AC-618, FR-669) the ปฏิทิน view · cindy, peter', () => {
  test.beforeAll(async () => {
    await resetDb()
  })

  test('TC1 a plan-only task shows a "จากแผน" bar with its project dot; click = panel', async ({ page }) => {
    await loginAs(page, 'cindy')
    const spans = page.waitForResponse((r) => new URL(r.url()).pathname === '/api/tasks/plan-spans')
    await page.goto('/tasks?view=calendar')
    await expect(page.getByTestId('team-calendar')).toBeVisible()
    expect((await spans).status()).toBe(200)
    await expect(page.getByTestId('plan-calendar-month')).toHaveText('กันยายน 2569')
    const uat = await taskIdOf(POS, UAT)
    const bar = page.getByTestId('plan-day-2026-09-14').locator(`[data-task-bar="${uat}"]`)
    await expect(bar).toHaveAttribute('data-from-plan', 'true')
    await expect(bar).toContainText(`${UAT} · Ivy`)
    await expect(bar).toContainText(th.planCalendar.fromPlanTag)
    await expect(bar.getByTestId('bar-project-dot')).toBeVisible()
    await expect(bar.getByRole('button').first()).toHaveAccessibleName(
      new RegExp(th.teamTasks.calendar.projectOf(POS)),
    )
    await bar.getByRole('button').first().click()
    await expect.poll(() => new URL(page.url()).searchParams.get('task')).toBe(uat)
    await expect(new TaskListPage(page).panelTitle(UAT)).toBeVisible()
  })

  test('TC2 peter sees only his projects; neither /api/tasks nor /api/tasks/plan-spans carries a POS id', async ({
    page,
  }) => {
    await loginAs(page, 'peter')
    const isTasks = (r: Response) => new URL(r.url()).pathname === '/api/tasks'
    const isSpans = (r: Response) => new URL(r.url()).pathname === '/api/tasks/plan-spans'
    const tasksResp = page.waitForResponse(isTasks)
    const spansResp = page.waitForResponse(isSpans)
    await page.goto('/tasks?view=calendar')
    const list = (await (await tasksResp).json()) as TeamTasksResponse
    const spans = (await (await spansResp).json()) as TeamPlanSpansResponse
    const posId = await projectIdByName(POS)
    const posTask = await taskIdOf(POS, UAT)
    expect(list.projects.map((p) => p.name).sort()).toEqual(['Data Warehouse', 'Store Analytics Dashboard'])
    expect(list.cards.every((c) => c.projectId !== posId)).toBe(true)
    const raw = JSON.stringify(spans)
    expect(raw).not.toContain(posId)
    expect(raw).not.toContain(posTask)
    expect(raw).not.toContain(POS)
    expect(spans.spans.length).toBeGreaterThan(0)
    await expect(page.getByTestId('team-calendar')).toBeVisible()
    await expect(page.locator(`[data-task-bar="${posTask}"]`)).toHaveCount(0)
  })
})
