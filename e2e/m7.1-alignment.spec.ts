/**
 * M7.1 fix (owner feedback 2026-11-02, "week misalignment"): the กราฟภาระ chart and its ดูเป็นตาราง table share the
 * plan grid's column geometry and horizontal scroll. Every rendered period column of the grid header has a chart
 * column (`[data-chart-col]`) with the same left / right edges, the chart's x ticks (`[data-chart-tick]`) and points
 * (`[data-chart-point]`) are centred on their week's value column (a collapsed week, or the "รวม" column of an expanded
 * week), month lines sit on the grid's month starts, and the table lists exactly the grid's periods with every cell
 * centred under its header — before and after horizontal scroll (grid scrollbar, "วันนี้", the chart's own scroller),
 * after resizing the task column, with the assignee column hidden and with an expanded week. Tolerance: 2 px.
 * APP_NOW = 2026-09-30 (golden F1, POS Upgrade: Cindy / Ivy / Mint).
 */
import type { Page, TestInfo } from '@playwright/test'
import { expect, loginAs, resetDb, test } from './fixtures'
import { GridPage } from './pages/grid'
import { LoadChartPage } from './pages/load-chart'

const POS = 'POS Upgrade'
const TOL = 2

interface Box {
  key: string
  left: number
  right: number
  cx: number
}

interface Geometry {
  grid: Box[]
  gridMonthStarts: string[]
  chartCols: Box[]
  chartMonthStarts: string[]
  ticks: Box[]
  points: (Box & { user: string })[]
  gridScroll: number
  followScroll: number | null
}

/** Rects of the grid's period header row and of the chart, read in one frame. */
function readGeometry(page: Page): Promise<Geometry> {
  return page.evaluate(() => {
    const box = (el: Element, key: string) => {
      const r = el.getBoundingClientRect()
      return { key, left: r.left, right: r.right, cx: r.left + r.width / 2 }
    }
    const row = document.querySelector('[role="grid"] [data-frozen-header="task"]')!.closest('[role="row"]')!
    const heads = [...row.querySelectorAll('[role="columnheader"][data-col-key]')]
    const chart = document.querySelector('[data-testid="load-line-chart"]')
    const follow = document.querySelector('[data-testid="chart-pane"] [data-chart-follow]')
    return {
      grid: heads.map((h) => box(h, h.getAttribute('data-col-key')!)),
      gridMonthStarts: heads
        .filter((h) => h.hasAttribute('data-month-start'))
        .map((h) => h.getAttribute('data-col-key')!),
      chartCols: chart
        ? [...chart.querySelectorAll('[data-chart-col]')].map((c) =>
            box(c, c.getAttribute('data-chart-col')!),
          )
        : [],
      chartMonthStarts: chart
        ? [...chart.querySelectorAll('[data-chart-col][data-month-start]')].map((c) =>
            c.getAttribute('data-chart-col')!,
          )
        : [],
      ticks: chart
        ? [...chart.querySelectorAll('[data-chart-tick]')].map((t) =>
            box(t, t.getAttribute('data-chart-tick')!),
          )
        : [],
      points: chart
        ? [...chart.querySelectorAll('[data-chart-point]')].map((p) => ({
            ...box(p, `W:${p.getAttribute('data-week')!}`),
            user: p.getAttribute('data-user')!,
          }))
        : [],
      gridScroll: document.querySelector('[role="grid"]')!.scrollLeft,
      followScroll: follow ? follow.scrollLeft : null,
    }
  })
}

function near(a: number, b: number, what: string): void {
  expect(Math.abs(a - b), `${what}: ${a.toFixed(1)} vs ${b.toFixed(1)}`).toBeLessThanOrEqual(TOL)
}

async function expectChartAligned(page: Page, at: string): Promise<void> {
  await expect(async () => {
    const g = await readGeometry(page)
    const byKey = new Map(g.grid.map((b) => [b.key, b]))
    expect(g.followScroll, `chart scrolled with the grid ${at}`).not.toBeNull()
    near(g.followScroll!, g.gridScroll, `scrollLeft ${at}`)
    expect(
      g.chartCols.map((c) => c.key),
      `chart columns = the grid's rendered periods ${at}`,
    ).toEqual(g.grid.map((b) => b.key))
    for (const c of g.chartCols) {
      const h = byKey.get(c.key)!
      near(c.left, h.left, `chart column ${c.key} left ${at}`)
      near(c.right, h.right, `chart column ${c.key} right ${at}`)
    }
    expect(g.chartMonthStarts, `month lines ${at}`).toEqual(g.gridMonthStarts)
    expect(g.ticks.length, `ticks ${at}`).toBeGreaterThanOrEqual(4)
    for (const t of g.ticks) near(t.cx, byKey.get(t.key)!.cx, `tick ${t.key} ${at}`)
    expect(g.points.length, `points ${at}`).toBeGreaterThanOrEqual(4 * 3)
    for (const p of g.points) {
      const h = byKey.get(p.key)
      expect(h, `point ${p.key} has a grid column ${at}`).toBeDefined()
      near(p.cx, h!.cx, `point ${p.user} ${p.key} ${at}`)
    }
  }).toPass({ timeout: 10_000 })
}

async function expectTableAligned(
  page: Page,
  chart: LoadChartPage,
  at: string,
  shotAs?: { testInfo: TestInfo; name: string },
): Promise<void> {
  await chart.showTable(true)
  if (shotAs) await shot(page, shotAs.testInfo, shotAs.name)
  await expect(async () => {
    const t = await page.evaluate(() => {
      const box = (el: Element, key: string) => {
        const r = el.getBoundingClientRect()
        return { key, left: r.left, right: r.right, cx: r.left + r.width / 2 }
      }
      const row = document
        .querySelector('[role="grid"] [data-frozen-header="task"]')!
        .closest('[role="row"]')!
      const heads = [...row.querySelectorAll('[role="columnheader"][data-col-key]')].map((h) =>
        box(h, h.getAttribute('data-col-key')!),
      )
      const table = document.querySelector('[data-testid="load-table"]')!
      return {
        grid: heads,
        heads: [...table.querySelectorAll('[role="columnheader"][data-col-key]')].map((h) =>
          box(h, h.getAttribute('data-col-key')!),
        ),
        cells: [...table.querySelectorAll('[role="cell"][data-week]')].map((c) =>
          box(c, `W:${c.getAttribute('data-week')!}`),
        ),
      }
    })
    const byKey = new Map(t.grid.map((b) => [b.key, b]))
    expect(
      t.heads.map((h) => h.key),
      `table periods = the grid's rendered periods ${at}`,
    ).toEqual(t.grid.map((b) => b.key))
    for (const h of t.heads) near(h.cx, byKey.get(h.key)!.cx, `table header ${h.key} ${at}`)
    expect(t.cells.length, `table cells ${at}`).toBeGreaterThanOrEqual(4 * 3)
    for (const c of t.cells) near(c.cx, byKey.get(c.key)!.cx, `table cell ${c.key} ${at}`)
  }).toPass({ timeout: 10_000 })
  await chart.showTable(false)
}

async function shot(page: Page, testInfo: TestInfo, name: string): Promise<void> {
  const path = testInfo.outputPath(`${name}.png`)
  await page.screenshot({ path })
  await testInfo.attach(name, { path, contentType: 'image/png' })
}

for (const vp of [
  { width: 1280, height: 900 },
  { width: 1920, height: 1080 },
] as const) {
  test.describe(`chart / table share the grid's columns @${vp.width} · cindy`, () => {
    test.beforeAll(async () => {
      await resetDb()
    })

    test('open, scroll (grid, วันนี้, chart), resize, hidden assignees, expanded week', async ({
      page,
    }, testInfo) => {
      test.setTimeout(4 * 60_000)
      await page.setViewportSize(vp)
      await loginAs(page, 'cindy')
      const grid = new GridPage(page)
      await grid.goto(POS)
      const chart = new LoadChartPage(page)
      await grid.setChart(true)
      await expect(chart.lineChart()).toBeVisible()
      const at = (s: string) => `${s} @${vp.width}`

      await shot(page, testInfo, `${vp.width}-1-open`)
      await expectChartAligned(page, at('open'))
      await expectTableAligned(page, chart, at('open'), { testInfo, name: `${vp.width}-1-open-table` })

      // horizontal scroll of the grid (scrollbar / wheel)
      await grid.scrollToWeek('2026-12-28')
      await shot(page, testInfo, `${vp.width}-2-scrolled`)
      await expectChartAligned(page, at('scrolled'))
      await expectTableAligned(page, chart, at('scrolled'))

      // "วันนี้" auto-scrolls the grid back
      await grid.today()
      await expect.poll(() => grid.todayHeaderWhole()).toBe(true)
      await expectChartAligned(page, at('today'))

      // scrolling the chart's own row scrolls the grid
      const before = await grid.root().evaluate((el) => el.scrollLeft)
      await page
        .getByTestId('chart-pane')
        .locator('[data-chart-follow]')
        .evaluate((el) => {
          el.scrollLeft += 320
        })
      await expect.poll(() => grid.root().evaluate((el) => el.scrollLeft)).toBeGreaterThan(before + 300)
      await expectChartAligned(page, at('chart scrolled'))

      // a wider task column
      await grid.resizeTaskColumn(120)
      await shot(page, testInfo, `${vp.width}-3-resized`)
      await expectChartAligned(page, at('resized'))
      await expectTableAligned(page, chart, at('resized'))

      // no assignee column
      await grid.showAssignees(false)
      await shot(page, testInfo, `${vp.width}-4-no-assignees`)
      await expectChartAligned(page, at('assignees hidden'))
      await expectTableAligned(page, chart, at('assignees hidden'))
      await grid.showAssignees(true)

      // an expanded week: the point sits on its "รวม" column, day columns are chart columns too
      await grid.expandWeek('2026-10-05')
      await shot(page, testInfo, `${vp.width}-5-expanded`)
      await expectChartAligned(page, at('expanded week'))
      await expectTableAligned(page, chart, at('expanded week'), {
        testInfo,
        name: `${vp.width}-5-expanded-table`,
      })
    })
  })
}
