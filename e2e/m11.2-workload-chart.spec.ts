/**
 * M11.2 (owner request 2026-11-03; SPEC v3.5 FR-1001 month header, FR-1011 per-person load chart, AC-1003/AC-1004):
 * the /workload "ตาราง" tab gets the plan grid's 2-level column header (month-year row above the week row, a week in
 * the month of its Monday, month boundary lines through header and body) and the plan page's กราฟภาระ chart under the
 * table — one line per person shown in the table, on the table's own week columns (tolerance 2 px, before and after
 * horizontal scroll both ways, at 1280 and 1920), following the view / filters / `load.display`, collapsible
 * (`grid.chart`), masked exactly like /workload (computed from the /api/workload payload — no new endpoint).
 *
 * Determinism (PLAN §4.5): APP_NOW = 2026-09-30 (this week 28/9); F2+F3 (§8.5 mock state). Expected values come from
 * the captured /api/workload payload through the same pure helpers (workloadSeries + pointText), never literals.
 */
import type { Page, Response } from '@playwright/test'
import { alertText, pointText } from '../src/components/load-chart/chart-model'
import type { LoadView } from '../src/domain/types'
import { th } from '../src/i18n/th'
import type { WorkloadResponse } from '../src/lib/contracts/workload'
import type { LoadDisplay } from '../src/lib/load/display'
import { monthHeaderCells, workloadMonthStarts, workloadSeries } from '../src/lib/workload/chart'
import { expect, loginAs, resetDb, test, waitForServerActionWith } from './fixtures'
import { LoadChartPage } from './pages/load-chart'
import { WorkloadPage } from './pages/workload'

const TOL = 2
/** 26 weeks from 28/9 (≤ 53, M9-D4): wide enough to scroll horizontally at 1280 and 1920. */
const WIDE = '?from=2026-09-28&to=2027-03-29'
const HIDDEN_FROM_IVY = ['Mobile App Revamp', 'Data Warehouse', 'Store Analytics Dashboard']

const isTable = (r: Response) =>
  new URL(r.url()).pathname === '/api/workload' && r.request().method() === 'GET'

async function openWide(page: Page, who: 'manager' | 'ivy', size: { width: number; height: number }) {
  await page.setViewportSize(size)
  await loginAs(page, who)
  const wl = new WorkloadPage(page)
  const resp = page.waitForResponse(isTable)
  await wl.open(WIDE)
  const data = (await (await resp).json()) as WorkloadResponse
  const chart = new LoadChartPage(page)
  await expect(chart.panel()).toBeVisible()
  return { wl, chart, data }
}

interface Geo {
  heads: { week: string; cx: number; left: number }[]
  ticks: { week: string; cx: number }[]
  points: { week: string; user: string; cx: number }[]
  monthLines: { key: string; left: number }[]
  headMonthStarts: { week: string; left: number }[]
  tableScroll: number
  chartScroll: number
}

function readGeo(page: Page): Promise<Geo> {
  return page.evaluate(() => {
    const cx = (e: Element) => {
      const r = e.getBoundingClientRect()
      return r.left + r.width / 2
    }
    const table = document.querySelector('[data-testid="workload-table"]')!
    const chart = document.querySelector('[data-testid="load-line-chart"]')!
    const heads = [...table.querySelectorAll('thead th[data-week]')]
    return {
      heads: heads.map((h) => ({
        week: h.getAttribute('data-week')!,
        cx: cx(h),
        left: h.getBoundingClientRect().left,
      })),
      ticks: [...chart.querySelectorAll('[data-chart-tick]')].map((t) => ({
        week: t.getAttribute('data-week')!,
        cx: cx(t),
      })),
      points: [...chart.querySelectorAll('[data-chart-point]')].map((p) => {
        // the mark itself (the over-100 % label above it is centred too, but read the shape)
        const mark = p.querySelector(':scope > g') ?? p
        return { week: p.getAttribute('data-week')!, user: p.getAttribute('data-user')!, cx: cx(mark) }
      }),
      monthLines: [...chart.querySelectorAll('[data-chart-col][data-month-start]')].map((c) => ({
        key: c.getAttribute('data-chart-col')!,
        left: c.getBoundingClientRect().left,
      })),
      headMonthStarts: heads
        .filter((h) => h.hasAttribute('data-month-start'))
        .map((h) => ({ week: h.getAttribute('data-week')!, left: h.getBoundingClientRect().left })),
      tableScroll: table.parentElement!.scrollLeft,
      chartScroll: document.querySelector('[data-testid="workload-chart"] [data-chart-follow]')!.scrollLeft,
    }
  })
}

function expectAligned(g: Geo, what: string): void {
  const head = new Map(g.heads.map((h) => [h.week, h.cx]))
  expect(
    g.ticks.map((t) => t.week),
    `${what}: one tick per week header`,
  ).toEqual(g.heads.map((h) => h.week))
  for (const t of g.ticks)
    expect(Math.abs(t.cx - head.get(t.week)!), `${what}: tick ${t.week}`).toBeLessThanOrEqual(TOL)
  expect(g.points.length, `${what}: points`).toBeGreaterThan(0)
  for (const p of g.points)
    expect(Math.abs(p.cx - head.get(p.week)!), `${what}: point ${p.user} ${p.week}`).toBeLessThanOrEqual(TOL)
  expect(
    g.monthLines.map((m) => m.key.slice(2)),
    `${what}: month lines`,
  ).toEqual(g.headMonthStarts.map((h) => h.week))
  g.monthLines.forEach((m, i) =>
    expect(Math.abs(m.left - g.headMonthStarts[i]!.left), `${what}: month line ${m.key}`).toBeLessThanOrEqual(
      TOL,
    ),
  )
  expect(Math.abs(g.tableScroll - g.chartScroll), `${what}: scroll lock`).toBeLessThanOrEqual(1)
}

async function scrollTable(page: Page, left: number): Promise<void> {
  await page.evaluate((x) => {
    document.querySelector('[data-testid="workload-table"]')!.parentElement!.scrollLeft = x
  }, left)
  await expect
    .poll(() =>
      page.evaluate(
        () => document.querySelector('[data-testid="workload-chart"] [data-chart-follow]')!.scrollLeft,
      ),
    )
    .toBeGreaterThan(0)
}

/** Full text of every chart-table cell = pointText (+ alert) of workloadSeries(payload, view) in `display`. */
async function expectChartTable(
  page: Page,
  chart: LoadChartPage,
  data: WorkloadResponse,
  view: LoadView,
  display: LoadDisplay,
): Promise<void> {
  const series = workloadSeries(data.groups, data.weeks, view)
  const want = series.flatMap((s) =>
    s.points.map((p) => {
      const alert = alertText(p)
      return `${s.userId}|${p.week}|${pointText(p, display)}${alert ? ` · ${alert}` : ''}`
    }),
  )
  await expect
    .poll(() =>
      chart
        .table()
        .locator('[role="row"][data-user] [role="cell"]')
        .evaluateAll((cells) =>
          cells.map(
            (c) =>
              `${c.closest('[data-user]')!.getAttribute('data-user')}|${c.getAttribute('data-week')}|${
                c.querySelector('span')!.textContent
              }`,
          ),
        ),
    )
    .toEqual(want)
}

test.describe('WC1 ⟲ F2+F3 (FR-1001 v3.5, FR-1011, AC-1003/AC-1004) month header + chart aligned to the table', () => {
  test.beforeAll(async () => {
    await resetDb('F2', { alsoFixtures: ['F3'] })
  })

  for (const size of [
    { width: 1280, height: 900 },
    { width: 1920, height: 1080 },
  ])
    test(`month row with boundaries; chart ticks / points within 2 px of the week headers at ${size.width} before and after scroll`, async ({
      page,
    }) => {
      const { wl, data } = await openWide(page, 'manager', size)
      const table = wl.table()

      // ── month-year row above the week row (a week belongs to the month of its Monday) ──
      const months = monthHeaderCells(data.weeks, null)
      const monthHeads = table.locator('thead tr[data-month-row] th[data-month]')
      await expect(monthHeads).toHaveCount(months.length)
      expect(
        await monthHeads.evaluateAll((els) =>
          els.map((e) => [
            e.getAttribute('data-month'),
            e.getAttribute('colspan'),
            e.getAttribute('aria-label'),
          ]),
        ),
      ).toEqual(months.map((m) => [m.key, String(m.span), m.label.full]))
      await expect(table.getByTestId('month-label-2026-11')).toHaveText('พฤศจิกายน 2569')
      // boundary lines: the first week of each month (except the first column) in the month row, week row and body
      const starts = [...workloadMonthStarts(data.weeks)].map((k) => k.slice(2))
      expect(starts[0]).toBe('2026-10-05')
      expect(
        await table
          .locator('thead th[data-week][data-month-start]')
          .evaluateAll((els) => els.map((e) => e.getAttribute('data-week'))),
      ).toEqual(starts)
      const firstRow = table.locator('tbody tr[data-user-id]').first()
      expect(
        await firstRow
          .locator('td[data-month-start] [data-wl-cell]')
          .evaluateAll((els) => els.map((e) => e.getAttribute('data-week'))),
      ).toEqual(starts)
      const line = await table
        .locator('thead th[data-week][data-month-start]')
        .first()
        .evaluate((e) => {
          const s = getComputedStyle(e, '::after')
          return { width: s.width, content: s.content }
        })
      expect(line).toEqual({ width: '2px', content: '""' })

      // ── chart on the table's columns, horizontal scroll locked both ways ──
      expect(await table.evaluate((t) => t.parentElement!.scrollWidth > t.parentElement!.clientWidth)).toBe(
        true,
      )
      expectAligned(await readGeo(page), 'initial')
      await scrollTable(page, 400)
      expectAligned(await readGeo(page), 'after table scroll')
      // the chart's own scroller drives the table back
      await page.evaluate(() => {
        document.querySelector('[data-testid="workload-chart"] [data-chart-follow]')!.scrollLeft = 120
      })
      await expect
        .poll(() =>
          page.evaluate(
            () => document.querySelector('[data-testid="workload-table"]')!.parentElement!.scrollLeft,
          ),
        )
        .toBe(120)
      expectAligned(await readGeo(page), 'after chart scroll')
    })

  test('one line per person of the table; view, ตำแหน่ง, เฉพาะคนที่ล้น change the lines; % ↔ วัน; collapse persists', async ({
    page,
  }) => {
    const { wl, chart, data } = await openWide(page, 'manager', { width: 1440, height: 900 })
    const names = await wl.personNames()
    expect(await chart.legendNames()).toEqual(names)
    await chart.showTable(true)
    await expectChartTable(page, chart, data, 'ALL', 'PERCENT')
    await expect(chart.lineChart()).toHaveCount(0)

    // view → values (client side, the same payload)
    await wl.setView('COMMITTED')
    await expectChartTable(page, chart, data, 'COMMITTED', 'PERCENT')
    await wl.setView('ALL')

    // ตำแหน่ง → the payload changes → the lines change with the table
    let resp = page.waitForResponse(isTable)
    await wl.filterPosition('Designer')
    let filtered = (await (await resp).json()) as WorkloadResponse
    await expect
      .poll(() => wl.personNames())
      .toEqual(filtered.groups.flatMap((g) => g.people.map((p) => p.name)))
    expect(await chart.legendNames()).toEqual(await wl.personNames())
    await expectChartTable(page, chart, filtered, 'ALL', 'PERCENT')
    await wl.clearFilters()

    // เฉพาะคนที่ล้น
    resp = page.waitForResponse(isTable)
    await wl.onlyOver(true)
    filtered = (await (await resp).json()) as WorkloadResponse
    const over = filtered.groups.flatMap((g) => g.people.map((p) => p.name))
    expect(over.length).toBeLessThan(names.length)
    await expect.poll(() => chart.legendNames()).toEqual(over)
    await wl.onlyOver(false)
    await expect.poll(() => chart.legendNames()).toEqual(names)

    // % ↔ วัน from the chart header: the chart and the table cells follow the one preference
    await chart.showTable(false)
    await expect(chart.lineChart().locator('[data-ref-line="100"]')).toHaveCount(1)
    const toggle = chart.panel().getByRole('group', { name: th.loadDisplay.label })
    await toggle.getByRole('button', { name: th.loadDisplay.DAYS_long }).click()
    await expect(chart.lineChart().locator('[data-ref-line="100"]')).toHaveCount(0)
    await expect(chart.panel()).toContainText(th.loadChart.unitDays)
    await expect(wl.table().locator('[data-wl-cell]').first()).toHaveAttribute('data-display', 'DAYS')
    await chart.showTable(true)
    await expectChartTable(page, chart, data, 'ALL', 'DAYS')
    await toggle.getByRole('button', { name: th.loadDisplay.PERCENT_long }).click()
    await expectChartTable(page, chart, data, 'ALL', 'PERCENT')

    // tooltip: "63% (3.8 / 6.0 วัน)" form for the hovered week
    await chart.showTable(false)
    const head = wl.weekHeaders().nth(3)
    const week = (await head.getAttribute('data-week'))!
    const col = chart.lineChart().locator(`[data-chart-col="W:${week}"]`)
    await col.hover()
    const tip = page.getByTestId('load-chart-tooltip')
    await expect(tip).toBeVisible()
    const first = workloadSeries(data.groups, data.weeks, 'ALL')[0]!
    await expect(tip).toContainText(
      pointText(
        first.points.find((p) => p.week === week)!,
        'PERCENT',
      ),
    )

    // collapse → remembered (grid.chart) across reload
    const bar = page.getByTestId('workload-chart-toggle')
    await expect(bar).toHaveAttribute('aria-expanded', 'true')
    const saved = waitForServerActionWith(page, 'grid.chart')
    await bar.click()
    await saved
    await expect(bar).toHaveAttribute('aria-expanded', 'false')
    await expect(chart.panel()).toHaveCount(0)
    await page.reload()
    await wl.waitReady()
    await expect(page.getByTestId('workload-chart-toggle')).toHaveAttribute('aria-expanded', 'false')
    await expect(chart.panel()).toHaveCount(0)
    // reopen and wait for the (debounced) save: later tests of this describe expect the chart open
    const reopened = waitForServerActionWith(page, 'grid.chart')
    await page.getByTestId('workload-chart-toggle').click()
    await expect(chart.panel()).toBeVisible()
    await reopened
  })

  test('axis title and the 100 % label never overlap (390–1920 px, % and วัน)', async ({ page }) => {
    const { chart } = await openWide(page, 'manager', { width: 1920, height: 1080 })
    const boxes = () =>
      chart.lineChart().evaluate((c) => {
        const r = (e: Element | null) => {
          if (!e) return null
          const b = e.getBoundingClientRect()
          return { l: b.left, r: b.right, t: b.top, b: b.bottom }
        }
        const ticks = [...c.querySelectorAll('[class*="yTick"]')].map(r)
        return {
          title: r(c.querySelector('[data-axis-title]')),
          label: r(c.querySelector('[data-ref-label]')),
          ticks,
        }
      })
    type B = { l: number; r: number; t: number; b: number }
    const hit = (a: B, b: B) => a.l < b.r && b.l < a.r && a.t < b.b && b.t < a.b
    for (const width of [1920, 1280, 390]) {
      await page.setViewportSize({ width, height: 900 })
      for (const display of ['PERCENT', 'DAYS'] as const) {
        await chart
          .panel()
          .getByRole('group', { name: th.loadDisplay.label })
          .getByRole('button', {
            name: display === 'PERCENT' ? th.loadDisplay.PERCENT_long : th.loadDisplay.DAYS_long,
          })
          .click()
        await expect(chart.lineChart().locator('[data-ref-label]')).toHaveCount(display === 'PERCENT' ? 1 : 0)
        const b = await boxes()
        for (const t of b.ticks) expect(hit(b.title!, t!), `${width} ${display}: title × tick`).toBe(false)
        if (b.label) {
          expect(hit(b.title!, b.label), `${width} ${display}: title × 100 % label`).toBe(false)
          for (const t of b.ticks) expect(hit(b.label, t!), `${width} ${display}: label × tick`).toBe(false)
        }
      }
    }
  })

  test('masking: Ivy sees lines for the people of her table only and no hidden project name anywhere', async ({
    page,
  }) => {
    const bodies: Promise<string>[] = []
    page.on('response', (r) => {
      if (r.request().method() === 'GET' && new URL(r.url()).pathname.startsWith('/api/'))
        bodies.push(r.text().catch(() => ''))
    })
    const { wl, chart } = await openWide(page, 'ivy', { width: 1440, height: 900 })
    expect(await chart.legendNames()).toEqual(await wl.personNames())
    // hover every week once (tooltips), then the accessible table
    const cols = chart.lineChart().locator('[data-chart-col]')
    for (let i = 0; i < 4; i++) {
      await cols.nth(i).hover()
      await expect(page.getByTestId('load-chart-tooltip')).toBeVisible()
      const text = (await page.getByTestId('load-chart-tooltip').textContent()) ?? ''
      for (const n of HIDDEN_FROM_IVY) expect(text.includes(n), `tooltip leaked "${n}"`).toBe(false)
    }
    await chart.showTable(true)
    const html = await chart.panel().evaluate((e) => e.outerHTML)
    for (const n of HIDDEN_FROM_IVY) expect(html.includes(n), `chart leaked "${n}"`).toBe(false)
    const all = await Promise.all(bodies)
    expect(all.length).toBeGreaterThan(0)
    for (const b of all)
      for (const n of HIDDEN_FROM_IVY) expect(b.includes(n), `payload leaked "${n}"`).toBe(false)
  })
})
