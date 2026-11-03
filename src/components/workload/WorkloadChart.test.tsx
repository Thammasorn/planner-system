import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { th } from '@/i18n/th'
import type { WorkloadResponse } from '@/lib/contracts/workload'
import { nominalGeometry, PERSON_COL_W } from '@/lib/workload/chart'
import { WEEK_W } from '@/lib/grid/columns'
import { F23, U } from './test-data.test.helper'
import { renderUi } from './render.test.helper'
import { WorkloadLoadChart } from './WorkloadLoadChart'
import { WorkloadTable } from './WorkloadTable'

const noop = () => {}

function renderTable(data: WorkloadResponse = F23) {
  return renderUi(<WorkloadTable data={data} view="ALL" selected={null} onOpen={noop} />)
}

function renderChart(
  o: {
    data?: WorkloadResponse
    view?: 'ALL' | 'COMMITTED' | 'AT_RISK'
    prefs?: Record<string, unknown>
  } = {},
) {
  const onSet = vi.fn()
  const r = renderUi(
    <WorkloadLoadChart
      data={o.data ?? F23}
      view={o.view ?? 'ALL'}
      geometry={null}
      follow={() => undefined}
      sync={noop}
    />,
    { prefs: o.prefs, onSetPreference: onSet },
  )
  return { ...r, onSet }
}

const pointsOf = (user: string) =>
  [...screen.getByTestId('load-line-chart').querySelectorAll(`[data-chart-point][data-user="${user}"]`)].map(
    (p) => p.getAttribute('data-week'),
  )

describe('WorkloadTable month-year header (FR-1001 v3.5, FR-818 rule)', () => {
  it('a month row above the week row: one colgroup header per month of the Mondays, with the long name', () => {
    renderTable()
    const table = screen.getByRole('table', { name: th.workload.tableLabel })
    const rows = table.querySelectorAll('thead tr')
    expect(rows).toHaveLength(2)
    const months = [...rows[0]!.querySelectorAll('th[data-month]')]
    // 28/9 → กันยายน (its Monday), 5/10–19/10 → ตุลาคม
    expect(months.map((m) => [m.getAttribute('data-month'), m.getAttribute('colspan')])).toEqual([
      ['2026-09', '1'],
      ['2026-10', '3'],
    ])
    expect(months.map((m) => m.getAttribute('aria-label'))).toEqual(['กันยายน 2569', 'ตุลาคม 2569'])
    // 1 week (64 px) is narrow → the short label; 3 weeks → the long one
    expect(within(table).getByTestId('month-label-2026-09')).toHaveTextContent('ก.ย. 69')
    expect(within(table).getByTestId('month-label-2026-10')).toHaveTextContent('ตุลาคม 2569')
    // the "คน" corner spans both header rows; the week headers stay in the second row
    expect(rows[0]!.querySelector('th[data-corner]')).toHaveAttribute('rowspan', '2')
    expect([...rows[1]!.querySelectorAll('th[data-week]')].map((h) => h.getAttribute('data-week'))).toEqual(
      F23.weeks,
    )
  })

  it('month boundary on the first week of October: month header, week header and every body cell', () => {
    renderTable()
    const table = screen.getByRole('table', { name: th.workload.tableLabel })
    const marked = (sel: string) =>
      [...table.querySelectorAll(sel)].filter((e) => e.hasAttribute('data-month-start'))
    expect(marked('th[data-month]').map((m) => m.getAttribute('data-month'))).toEqual(['2026-10'])
    expect(marked('th[data-week]').map((h) => h.getAttribute('data-week'))).toEqual(['2026-10-05'])
    const people = F23.groups.flatMap((g) => g.people).length
    const bodyMarks = marked('tbody td')
    expect(bodyMarks).toHaveLength(people)
    for (const td of bodyMarks)
      expect(td.querySelector('[data-week]')).toHaveAttribute('data-week', '2026-10-05')
  })
})

describe('WorkloadLoadChart (FR-1011, M11.2)', () => {
  it('open by default (grid.chart unset): one line per person of the table in table order, legend name + shape', () => {
    renderChart()
    const toggle = screen.getByTestId('workload-chart-toggle')
    expect(toggle).toHaveAttribute('aria-expanded', 'true')
    expect(toggle).toHaveTextContent(th.loadChart.toggle)
    const legend = screen.getByRole('list', { name: th.loadChart.legend })
    expect(
      within(legend)
        .getAllByRole('button')
        .map((b) => b.textContent),
    ).toEqual(['Cindy', 'Mint', 'Jack', 'Ivy', 'Peter'])
    // never colour alone: every legend item carries its mark shape
    expect([...legend.querySelectorAll('svg')].map((s) => s.getAttribute('data-shape'))).toEqual([
      'circle',
      'square',
      'triangle',
      'diamond',
      'cross',
    ])
    expect(pointsOf(U.jack)).toEqual(F23.weeks)
    // no "รวมงานโปรเจคอื่น" on /workload: the cells already count every project (masked)
    expect(screen.queryByRole('switch', { name: th.loadChart.includeOthers })).toBeNull()
  })

  it('x = the table columns: ticks and points centred on the person column + WEEK_W slots (nominal geometry)', () => {
    renderChart()
    const chart = screen.getByTestId('load-line-chart')
    const ticks = [...chart.querySelectorAll<HTMLElement>('[data-chart-tick]')]
    expect(ticks.map((t) => [t.dataset.week, t.style.left, t.style.width])).toEqual(
      F23.weeks.map((w, i) => [w, `${PERSON_COL_W + i * WEEK_W}px`, `${WEEK_W}px`]),
    )
    const jack = [...chart.querySelectorAll(`[data-chart-point][data-user="${U.jack}"]`)]
    // points are drawn in the SVG placed at the first column's left: x = centre − first left
    expect(jack.map((p) => p.getAttribute('transform')?.match(/translate\(([\d.]+) /)?.[1])).toEqual(
      F23.weeks.map((_, i) => String(i * WEEK_W + WEEK_W / 2)),
    )
    // month line on the chart column of the first week of October (same key as the table's boundary)
    expect(
      [...chart.querySelectorAll('[data-chart-col][data-month-start]')].map((c) =>
        c.getAttribute('data-chart-col'),
      ),
    ).toEqual(['W:2026-10-05'])
    // the frozen y-axis area is the "คน" column's width
    const scroller = screen.getByRole('region', { name: th.workload.chart.scroller })
    expect(scroller.style.getPropertyValue('--grid-frozen-w')).toBe(`${nominalGeometry(4).personW}px`)
  })

  it('PERCENT (default): 100 % line and over-100 % labels; the accessible table reads "125% (5.0 / 4.0 วัน)"', async () => {
    const user = userEvent.setup()
    renderChart()
    const chart = screen.getByTestId('load-line-chart')
    expect(chart.querySelector('[data-ref-line="100"]')).not.toBeNull()
    const jack19 = chart.querySelector(`[data-chart-point][data-user="${U.jack}"][data-week="2026-10-19"]`)!
    expect(jack19).toHaveAttribute('data-over-full', 'true')
    expect(jack19).toHaveAttribute('data-alert', 'OVER')
    await user.click(screen.getByTestId('load-chart-table-toggle'))
    const table = screen.getByTestId('load-table')
    const cell = table.querySelector(`[data-user="${U.jack}"] [role="cell"][data-week="2026-10-19"]`)!
    expect(cell.textContent).toContain('125% (5.0 / 4.0 วัน)')
  })

  it('DAYS (load.display): no 100 % line, values in days', async () => {
    const user = userEvent.setup()
    renderChart({ prefs: { 'load.display': 'DAYS' } })
    expect(screen.getByTestId('load-line-chart').querySelector('[data-ref-line="100"]')).toBeNull()
    await user.click(screen.getByTestId('load-chart-table-toggle'))
    const cell = screen
      .getByTestId('load-table')
      .querySelector(`[data-user="${U.ivy}"] [role="cell"][data-week="2026-09-28"]`)!
    expect(cell.textContent).toContain('2.5 / 5.0 วัน')
  })

  it('the % | วัน toggle in the chart header writes load.display (the same preference as the toolbar)', async () => {
    const user = userEvent.setup()
    const { onSet } = renderChart()
    const group = within(screen.getByTestId('load-chart-panel')).getByRole('group', {
      name: th.loadDisplay.label,
    })
    await user.click(within(group).getByRole('button', { name: th.loadDisplay.DAYS_long }))
    expect(onSet).toHaveBeenCalledWith('load.display', 'DAYS')
    expect(screen.getByTestId('load-line-chart').querySelector('[data-ref-line="100"]')).toBeNull()
  })

  it('follows the table: the view changes the values, a filtered payload changes the lines', async () => {
    const user = userEvent.setup()
    const { unmount } = renderChart({ view: 'AT_RISK' })
    // every F23 cell is committed → AT_RISK = 0 everywhere (the level stays BR-40 of the pair, X67)
    expect(pointsOf(U.jack)).toEqual(F23.weeks)
    await user.click(screen.getByTestId('load-chart-table-toggle'))
    const cell = screen
      .getByTestId('load-table')
      .querySelector(`[data-user="${U.jack}"] [role="cell"][data-week="2026-10-19"]`)!
    expect(cell.textContent).toContain('0% (0 / 4.0 วัน)')
    unmount()
    const designers: WorkloadResponse = { ...F23, groups: F23.groups.filter((g) => g.name === 'Designer') }
    renderChart({ data: designers })
    const legend = screen.getByRole('list', { name: th.loadChart.legend })
    expect(
      within(legend)
        .getAllByRole('button')
        .map((b) => b.textContent),
    ).toEqual(['Jack'])
    expect(screen.getByTestId('load-line-chart').querySelectorAll('[data-chart-point]')).toHaveLength(4)
  })

  it('collapses: the toggle writes grid.chart (the plan chart preference); stored false → closed', async () => {
    const user = userEvent.setup()
    const { onSet, unmount } = renderChart()
    await user.click(screen.getByTestId('workload-chart-toggle'))
    expect(onSet).toHaveBeenCalledWith('grid.chart', false)
    expect(screen.queryByTestId('load-chart-panel')).toBeNull()
    expect(screen.getByTestId('workload-chart-toggle')).toHaveAttribute('aria-expanded', 'false')
    unmount()
    renderChart({ prefs: { 'grid.chart': false } })
    expect(screen.queryByTestId('load-chart-panel')).toBeNull()
  })

  it('masking: nothing about projects in the chart — no project name or id in its DOM', async () => {
    const user = userEvent.setup()
    renderChart()
    const panel = screen.getByTestId('load-chart-panel')
    const hover = screen.getByTestId('load-line-chart').querySelector('[data-chart-col]')!
    await user.hover(hover)
    await user.click(screen.getByTestId('load-chart-table-toggle'))
    const html = panel.outerHTML
    for (const [id, p] of Object.entries(F23.projects)) {
      expect(html.includes(p.name)).toBe(false)
      expect(html.includes(id)).toBe(false)
    }
  })
})
