/**
 * M11.1 — owner decisions 2026-11-02 (SPEC v3.4 FR-709, FR-813, FR-1002/1008/1010, AC-703, AC-812, AC-1001/1002;
 * D26/D27; PROGRESS M11.1-D1…D5): plan markers merged into milestones (a milestone line colour chosen in the
 * milestone form), and load shown as % of capacity by default with a "% | วัน/capacity" toggle — ONE `load.display`
 * preference shared by /workload, the person page and the plan's load chart.
 * Determinism (PLAN §4.5): production build, APP_NOW = 2026-09-30 10:00 +07; every describe resets planner_e2e (F1
 * golden) in its own beforeAll (⟲). Strings from `th`; waits on server-action responses, aria state, toasts or text.
 */
import { sql } from 'drizzle-orm'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import type { PeriodKey } from '../src/domain/types'
import { th } from '../src/i18n/th'
import { workloadDisplayText } from '../src/lib/load/display'
import { compactDays } from '../src/lib/workload/format'
import type { Tx } from '../src/server/db/types'
import {
  expect,
  idOf,
  loginAs,
  projectIdByName,
  resetDb,
  test,
  waitForServerAction,
  waitForServerActionWith,
} from './fixtures'
import { fillDate } from './pages/date-field'
import { escapeRe, GridPage } from './pages/grid'
import { LoadChartPage } from './pages/load-chart'
import { MilestonesSection } from './pages/milestones'
import { PersonPage } from './pages/people'
import { PlanCalendarPage } from './pages/plan-calendar'
import { ProjectPage } from './pages/project'
import { toastWith, undoButtonOf } from './pages/toast'
import { WorkloadPage } from './pages/workload'

const POS = 'POS Upgrade'
const SIGN_OFF = 'UAT sign-off'
const W = (d: string): PeriodKey => `W:${d}`
const C = th.milestones.color

/**
 * Runs the real data migration 0016 against a temporary `plan_markers` (the table itself was dropped by 0017): the
 * same SQL file the migrator ran, so the e2e sees exactly what an upgraded server shows (M11.1-D2).
 */
async function migrateMarkers(tx: Tx): Promise<void> {
  await tx.execute(sql`
    create temp table plan_markers (
      id uuid primary key default gen_random_uuid(), project_id uuid not null, date date not null,
      color text not null, label text, created_by text not null,
      created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
      deleted_at timestamptz, deleted_batch uuid
    ) on commit drop`)
  await tx.execute(sql`
    insert into plan_markers (project_id, date, color, label, created_by)
    select p.id, d.date::date, d.color, d.label, u.id
    from projects p, "user" u,
      (values ('2026-10-16', 'GREEN', null), ('2026-10-30', 'YELLOW', '  Code freeze  ')) as d(date, color, label)
    where p.name = ${POS} and u.nickname = 'Cindy'`)
  const file = readFileSync(path.resolve('drizzle/0016_m11_1_markers_to_milestones.sql'), 'utf8')
  await tx.execute(sql.raw(file))
}

// ── C1 ───────────────────────────────────────────────────────────────────────────────────────────────────────
test.describe('C1 ⟲ (AC-703, AC-812 v3.4, FR-709) choose a milestone colour; migrated markers are milestones · cindy, ivy', () => {
  test.describe.configure({ mode: 'serial' })
  test.beforeAll(async () => {
    await resetDb(undefined, { extras: migrateMarkers })
  })

  test('cindy: no "เส้นกำกับ" button; create red "UAT sign-off" on 23/10 → red ◆ + solid line; → green (dotted) → เลิกทำ', async ({
    page,
  }) => {
    await loginAs(page, 'cindy')
    const grid = new GridPage(page)
    await grid.goto(POS)
    await expect(grid.markersMenuButton()).toHaveCount(0)
    await expect(grid.toolbar().getByText(th.milestones.fromMarkerName)).toHaveCount(0)

    const pop = await grid.openCreateAt(W('2026-10-19'))
    await grid.milestoneNameInput(pop).fill(SIGN_OFF)
    await fillDate(pop, th.milestones.fields.date, '2026-10-23')
    await expect(grid.milestoneColor(pop, 'PURPLE')).toBeChecked()
    await grid.milestoneColor(pop, 'RED').check()
    const created = waitForServerActionWith(page, 'RED')
    await pop.getByRole('button', { name: th.milestones.form.create }).click()
    await created
    await expect(pop).toHaveCount(0)

    await expect(grid.diamond(SIGN_OFF)).toHaveAttribute('data-color', 'RED')
    const id = await grid.diamond(SIGN_OFF).getAttribute('data-ms-id')
    for (const piece of ['header', 'body', 'footer'] as const)
      await expect(grid.markerLines(piece, id!)).toHaveAttribute('data-color', 'RED')
    const body = grid.markerLines('body', id!)
    expect(await body.evaluate((el) => getComputedStyle(el).borderLeftStyle)).toBe('solid')
    const col = await grid.columnHeader('2026-10-19').boundingBox()
    const l = (await body.boundingBox())!
    expect(Math.abs(l.x + l.width / 2 - (col!.x + col!.width)), 'right edge of 19/10').toBeLessThanOrEqual(2)

    // recolour through the ◆ popover: dotted green, toast with เลิกทำ → back to red
    const details = await grid.openDiamond(SIGN_OFF)
    await expect(grid.milestoneColor(details, 'RED')).toBeChecked()
    await grid.milestoneColor(details, 'GREEN').check()
    const saved = waitForServerActionWith(page, 'GREEN')
    await details.getByRole('button', { name: th.milestones.form.save }).click()
    await saved
    await expect(grid.diamond(SIGN_OFF)).toHaveAttribute('data-color', 'GREEN')
    await expect(grid.markerLines('body', id!)).toHaveAttribute('data-color', 'GREEN')
    expect(await grid.markerLines('body', id!).evaluate((el) => getComputedStyle(el).borderLeftStyle)).toBe(
      'dotted',
    )
    const toast = th.milestones.toast.recoloured(SIGN_OFF, C.name.GREEN)
    await expect(toastWith(page, toast)).toBeVisible()
    const undone = waitForServerAction(page)
    await undoButtonOf(page, toast).click()
    await undone
    await expect(grid.diamond(SIGN_OFF)).toHaveAttribute('data-color', 'RED')

    // the project calendar shows the ◆ in its colour
    const cal = new PlanCalendarPage(page)
    await cal.switchTo('CALENDAR')
    await cal.gotoMonth('2026-10')
    await expect(cal.milestonesOn('2026-10-23')).toContainText(SIGN_OFF)
    await expect(cal.milestonesOn('2026-10-23')).toHaveAttribute('data-color', 'RED')
    await cal.switchTo('GRID')
  })

  test('migrated markers (0016): "เส้นกำกับ" green and "Code freeze" yellow are milestones on the grid and the overview', async ({
    page,
  }) => {
    await loginAs(page, 'cindy')
    const grid = new GridPage(page)
    await grid.goto(POS)
    await grid.scrollToWeek('2026-10-12')
    await expect(grid.diamond(th.milestones.fromMarkerName)).toHaveAttribute('data-color', 'GREEN')
    await expect(grid.diamond('Code freeze')).toHaveAttribute('data-color', 'YELLOW')
    const freeze = await grid.diamond('Code freeze').getAttribute('data-ms-id')
    expect(
      await grid.markerLines('body', freeze!).evaluate((el) => getComputedStyle(el).borderLeftStyle),
    ).toBe('dashed')

    await new ProjectPage(page).goto(await projectIdByName(POS), 'overview')
    const section = new MilestonesSection(page)
    await expect(section.nameOf(th.milestones.fromMarkerName)).toBeVisible()
    await expect(section.row('Code freeze').locator('[data-color]')).toHaveAttribute('data-color', 'YELLOW')
  })

  test('ivy (member): sees the colour by name in the read-only ◆ popover, no colour radios (PERM-15)', async ({
    page,
  }) => {
    await loginAs(page, 'ivy')
    const grid = new GridPage(page)
    await grid.goto(POS)
    await grid.scrollToWeek('2026-10-19')
    const pop = await grid.openDiamond(SIGN_OFF)
    await expect(pop.getByTestId('ms-color')).toHaveText(C.line(C.name.RED, C.pattern.RED))
    await expect(pop.getByRole('radio')).toHaveCount(0)
    await grid.closePopover()
  })
})

// ── C2 ───────────────────────────────────────────────────────────────────────────────────────────────────────
test.describe('C2 ⟲ (AC-1001/1002, FR-1002/1008/1010, FR-813) load as % by default; one toggle for every screen · jack', () => {
  test.describe.configure({ mode: 'serial' })
  test.beforeAll(async () => {
    await resetDb()
  })

  test('/workload: Jack 19/10 (F1 5 of 5) reads 100% → "วัน/capacity" → 5/5; reload keeps it; the person page follows; back to %', async ({
    page,
  }) => {
    await loginAs(page, 'manager')
    const wl = new WorkloadPage(page)
    await wl.goto()
    const jack = () => wl.cell('Jack', '2026-10-19')
    await expect(wl.cellText(jack())).toHaveText(workloadDisplayText(500, 500, 'PERCENT'))
    await expect(wl.cellText(jack())).toHaveText('100%')

    const toggle = wl.toolbar().getByRole('group', { name: th.loadDisplay.label })
    const saved = waitForServerActionWith(page, 'load.display')
    await toggle.getByRole('button', { name: th.loadDisplay.DAYS_long }).click()
    await saved
    await expect(wl.cellText(jack())).toHaveText(`${compactDays(500)}/${compactDays(500)}`)

    await page.reload()
    await wl.waitReady()
    await expect(wl.cellText(jack())).toHaveText('5/5')
    await expect(toggle.getByRole('button', { name: th.loadDisplay.DAYS_long })).toHaveAttribute(
      'aria-pressed',
      'true',
    )

    // the person page reads the same preference: its footer shows days, and its toggle switches back to %
    const person = new PersonPage(page)
    expect((await person.goto(await idOf('user', 'Jack'), 'plan', '?week=2026-10-19')).status).toBe(200)
    const grid = person.grid('Jack')
    await grid.waitPersonReady()
    const footer = grid.footerLoad(W('2026-10-19')).locator('[data-footer-text]')
    await expect(footer).toHaveText(new RegExp(`^${escapeRe(compactDays(500))}/`))
    await grid.setLoadDisplay('PERCENT')
    await expect(footer).toHaveText(/^\d+%$/)

    await wl.goto()
    await expect(wl.cellText(jack())).toHaveText('100%')
  })

  test('plan chart in % (default): 100% line, Cindy 28/9 = 50%; table "50% (2.5 / 5.0 วัน)"; days via the pane toggle', async ({
    page,
  }) => {
    await loginAs(page, 'cindy')
    const cindy = await idOf('user', 'Cindy')
    const grid = new GridPage(page)
    await grid.goto(POS)
    await grid.setChart(true)
    const chart = new LoadChartPage(page)
    await expect(chart.lineChart()).toBeVisible()
    await expect(chart.lineChart().locator('[data-ref-line="100"]')).toBeAttached()
    await expect(chart.panel().getByText(th.loadChart.fullCapacityPercent)).toBeVisible()
    await chart.showTable(true)
    await expect(chart.cell(cindy, '2026-09-28')).toContainText(`50% (${th.loadChart.daysValue('2.5', '5.0')})`)

    const toggle = chart.panel().getByRole('group', { name: th.loadDisplay.label })
    const saved = waitForServerActionWith(page, 'load.display')
    await toggle.getByRole('button', { name: th.loadDisplay.DAYS_long }).click()
    await saved
    await expect(chart.cell(cindy, '2026-09-28')).toHaveText(
      new RegExp(`^${escapeRe(th.loadChart.daysValue('2.5', '5.0'))}`),
    )
    await chart.showTable(false)
    await expect(chart.lineChart().locator('[data-ref-line]')).toHaveCount(0)
  })
})
