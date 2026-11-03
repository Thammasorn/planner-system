/**
 * v3.6 — project calendar bars from the plan (SPEC FR-811/812, BR-103a, AC-814). Golden F1 (APP_NOW 2026-09-30): no
 * golden task has start/due dates, so every bar comes from its grid weeks (WEEK rows, Mon–Fri schedules → Monday …
 * Friday). POS: "ปรับปรุงระบบ POS หน้าร้าน" 31/8 … 2/10, "ทำ UAT + คู่มือหน้าร้าน" 14/9 … 9/10; Store Analytics Dashboard:
 * "ทำ dashboard ผู้บริหาร" 2/11 … 18/12. Plan bars carry `data-from-plan`, the visible "จากแผน" tag and a tooltip with
 * the source + range; "ไม่มีวันที่" lists only tasks with neither dates nor plan.
 */
import type { Locator } from '@playwright/test'
import { th } from '../src/i18n/th'
import { formatThaiDateRange } from '../src/lib/format'
import { expect, loginAs, projectIdByName, resetDb, test } from './fixtures'
import { escapeRe } from './pages/grid'
import { PlanCalendarPage, planMonthTitle } from './pages/plan-calendar'
import { TaskListPage } from './pages/tasks'
import { taskIdOf } from './support/seed-tasks'

const POS = 'POS Upgrade'
const STORE = 'Store Analytics Dashboard'
const R1 = 'ปรับปรุงระบบ POS หน้าร้าน'
const UAT = 'ทำ UAT + คู่มือหน้าร้าน'
const DASH = 'ทำ dashboard ผู้บริหาร'

/** Week-row cells a bar segment spans (its inline `--span`). */
const spanOf = (bar: Locator) => bar.evaluate((el) => (el as HTMLElement).style.getPropertyValue('--span'))

async function openCalendar(cal: PlanCalendarPage, project: string): Promise<void> {
  await cal.shell.goto(`/projects/${await projectIdByName(project)}/plan?view=calendar`)
  await expect(cal.view()).toHaveAttribute('data-view', 'CALENDAR')
  await cal.waitReady()
}

test.describe('CP1 ⟲ (AC-814, BR-103a) bars from the plan · cindy, peter', () => {
  test.beforeAll(async () => {
    await resetDb()
  })

  test('cindy: POS tasks without dates show hatched "จากแผน" bars on their grid weeks; click = panel; ไม่มีวันที่ (0)', async ({
    page,
  }) => {
    await loginAs(page, 'cindy')
    const cal = new PlanCalendarPage(page)
    const tasks = new TaskListPage(page)
    await openCalendar(cal, POS)
    await expect(cal.monthTitle()).toHaveText(planMonthTitle('2026-09'))
    await expect(cal.noDates()).toContainText(th.planCalendar.noDates(0))

    const uat = await taskIdOf(POS, UAT)
    // 14/9 … 9/10: the September grid (31/8 … 11/10) shows it in the rows of 14/9, 21/9, 28/9 and 5/10
    const uatStart = cal.day('2026-09-14').locator(`[data-task-bar="${uat}"]`)
    await expect(uatStart).toHaveAttribute('data-from-plan', 'true')
    await expect(uatStart).not.toHaveAttribute('data-cut-left')
    await expect(uatStart).toContainText(`${UAT} · Ivy`)
    await expect(uatStart).toContainText(th.planCalendar.fromPlanTag)
    const range = formatThaiDateRange('2026-09-14', '2026-10-09')
    await expect(cal.barButton(uatStart)).toHaveAttribute(
      'title',
      th.planCalendar.planTitle(`${UAT} · Ivy`, th.planCalendar.fromPlan, range),
    )
    await expect(cal.barButton(uatStart)).toHaveAccessibleName(
      new RegExp(`${escapeRe(range)}, ${escapeRe(th.planCalendar.fromPlan)}`),
    )
    await expect(cal.bars(uat)).toHaveCount(4)

    const r1 = await taskIdOf(POS, R1)
    await expect(cal.day('2026-08-31').locator(`[data-task-bar="${r1}"]`)).toHaveAttribute(
      'data-from-plan',
      'true',
    )

    const uatEnd = cal.day('2026-10-05').locator(`[data-task-bar="${uat}"]`)
    await expect(uatEnd).toHaveAttribute('data-cut-left', 'true')
    await expect(uatEnd).not.toHaveAttribute('data-cut-right')
    expect(await spanOf(uatEnd)).toBe('5') // Mon 5 … Fri 9
    expect(await spanOf(cal.day('2026-09-28').locator(`[data-task-bar="${r1}"]`))).toBe('5') // … Fri 2/10

    await cal.barButton(uatEnd).click()
    await expect(tasks.panelTitle(UAT)).toBeVisible()
    await expect.poll(() => new URL(page.url()).searchParams.get('task')).toBe(uat)
  })

  test('peter: Store "ทำ dashboard ผู้บริหาร" spans 2/11 … 18/12 (tentative project ◐ + จากแผน)', async ({
    page,
  }) => {
    await loginAs(page, 'peter')
    const cal = new PlanCalendarPage(page)
    await openCalendar(cal, STORE)
    const dash = await taskIdOf(STORE, DASH)
    await cal.gotoMonth('2026-11')
    const first = cal.day('2026-11-02').locator(`[data-task-bar="${dash}"]`)
    await expect(first).toHaveAttribute('data-from-plan', 'true')
    await expect(first).toHaveAttribute('data-tentative', 'true')
    await expect(first).toContainText(`${DASH} · Peter`)
    await expect(cal.bars(dash)).toHaveCount(5) // week rows 2/11 … 30/11
    await cal.gotoMonth('2026-12')
    const last = cal.day('2026-12-14').locator(`[data-task-bar="${dash}"]`)
    expect(await spanOf(last)).toBe('5') // Mon 14 … Fri 18
    await expect(last).not.toHaveAttribute('data-cut-right')
    await expect(cal.noDates()).toContainText(th.planCalendar.noDates(0))
  })
})
