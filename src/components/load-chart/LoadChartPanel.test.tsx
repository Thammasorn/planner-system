import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ThemeProvider } from '@mui/material/styles'
import { describe, expect, it, vi } from 'vitest'
import { th } from '@/i18n/th'
import { theme } from '@/lib/theme/theme'
import { testLayout, W } from './layout.test.data'
import { LoadChartPanel } from './LoadChartPanel'
import type { LoadChartProps, LoadSeries } from './types'

const SERIES: LoadSeries[] = [
  {
    userId: 'cindy',
    name: 'Cindy',
    points: [
      { week: W[0], loadCd: 250, capacityCd: 500, pct: 50, level: 'OK' },
      { week: W[1], loadCd: 0, capacityCd: 500, pct: 0, level: 'OK' },
      { week: W[2], loadCd: 650, capacityCd: 500, pct: 130, level: 'OVER' },
      { week: W[3], loadCd: null, capacityCd: null, pct: null, level: null },
    ],
  },
  {
    userId: 'ivy',
    name: 'Ivy',
    points: [
      { week: W[0], loadCd: 250, capacityCd: 500, pct: 50, level: 'OK' },
      { week: W[1], loadCd: 130, capacityCd: 500, pct: 26, level: 'RISK' },
      { week: W[2], loadCd: 0, capacityCd: 0, pct: null, level: 'OK' },
      { week: W[3], loadCd: null, capacityCd: null, pct: null, level: null },
    ],
  },
]

function props(over: Partial<LoadChartProps> = {}): LoadChartProps {
  return {
    weeks: [...W],
    layout: testLayout(),
    series: SERIES,
    display: 'DAYS',
    view: 'ALL',
    includeOthers: false,
    onIncludeOthers: vi.fn(),
    today: '2026-09-30',
    loading: false,
    ...over,
  }
}

const renderPanel = (p: LoadChartProps) =>
  render(
    <ThemeProvider theme={theme} storageManager={null}>
      <LoadChartPanel {...p} />
    </ThemeProvider>,
  )

const opacityOf = (user: string) =>
  screen.getByTestId('load-line-chart').querySelector(`[data-series="u:${user}"]`)!.getAttribute('opacity')

describe('LoadChartPanel (FR-813, M7.1-D3–D5, D30)', () => {
  it('renders the chart on the grid layout with the people (colour + shape) in the legend', () => {
    renderPanel(props())
    expect(screen.getByRole('region', { name: th.loadChart.title })).toBeInTheDocument()
    expect(screen.getByRole('img', { name: th.loadChart.title })).toBe(screen.getByTestId('load-line-chart'))
    const legend = screen.getByRole('list', { name: th.loadChart.legend })
    expect(
      within(legend)
        .getAllByRole('button')
        .map((b) => b.textContent),
    ).toEqual(['Cindy', 'Ivy'])
    expect(
      [...legend.querySelectorAll('svg')].map((x) => [
        x.getAttribute('data-shape'),
        x.firstElementChild?.getAttribute('fill'),
      ]),
    ).toEqual([
      ['circle', 'var(--chart-1)'],
      ['square', 'var(--chart-2)'],
    ])
  })

  it('the pane’s scroller is handed to the grid (layout.follow) and has the grid’s clientWidth', () => {
    const follow = vi.fn(() => undefined)
    renderPanel(props({ layout: { ...testLayout(), follow } }))
    const scroller = screen.getByRole('region', { name: th.loadChart.scroller })
    expect(follow).toHaveBeenCalledWith(scroller)
    expect(scroller).toHaveStyle({ width: '900px' })
  })

  it('"ดูเป็นตาราง": the grid’s periods as headers, full values as accessible text, 🔴 / ⚠ with text', async () => {
    const user = userEvent.setup()
    renderPanel(props())
    await user.click(screen.getByRole('button', { name: th.loadChart.table }))
    expect(screen.queryByTestId('load-line-chart')).toBeNull()
    const table = screen.getByRole('table')
    const rows = within(table).getAllByRole('row')
    expect(
      within(rows[0]!)
        .getAllByRole('columnheader')
        .map((c) => c.textContent),
    ).toEqual([th.loadChart.personHeader, '28/9', '5/10', '12/10', '19/10'])
    const text = (c: HTMLElement) => c.querySelector('[class*="srOnly"]')!.textContent
    const cindy = within(rows[1]!).getAllByRole('cell')
    expect(cindy.map(text)).toEqual([
      th.loadChart.daysValue('2.5', '5.0'),
      th.loadChart.daysValue('0', '5.0'),
      `${th.loadChart.daysValue('6.5', '5.0')} · ${th.loadChart.over('1.5')}`,
      th.loadChart.notLoaded,
    ])
    expect(cindy[2]).toHaveTextContent('6.5/5.0🔴')
    const ivy = within(rows[2]!).getAllByRole('cell')
    expect(text(ivy[1]!)).toBe(`${th.loadChart.daysValue('1.3', '5.0')} · ${th.loadChart.risk}`)
    expect(within(rows[2]!).getByRole('rowheader')).toHaveTextContent('Ivy')
    // back to the chart
    await user.click(screen.getByRole('button', { name: th.loadChart.chart }))
    expect(screen.getByTestId('load-line-chart')).toBeInTheDocument()
  })

  it('table cells sit at the grid’s column x; an expanded week’s value is in its “รวม” column', async () => {
    const user = userEvent.setup()
    renderPanel(props({ layout: testLayout({ expanded: [W[1]] }) }))
    await user.click(screen.getByRole('button', { name: th.loadChart.table }))
    const heads = within(screen.getByRole('table')).getAllByRole('columnheader').slice(1)
    expect(heads.map((h) => h.getAttribute('data-col-key'))).toEqual([
      'W:2026-09-28',
      'D:2026-10-05',
      'D:2026-10-06',
      'D:2026-10-07',
      'D:2026-10-08',
      'D:2026-10-09',
      'W:2026-10-05',
      'W:2026-10-12',
      'W:2026-10-19',
    ])
    const cell = screen
      .getByRole('table')
      .querySelector('[data-user="cindy"] [data-week="2026-10-05"]') as HTMLElement
    const head = heads[6]!
    expect(cell.style.left).toBe(head.style.left)
    expect(cell.style.width).toBe(head.style.width)
  })

  it('PERCENT table (M11.1): "50% (2.5 / 5.0 วัน)" as the cell text, "50%" visible; cap 0 → ไม่มี capacity', async () => {
    const user = userEvent.setup()
    renderPanel(props({ display: 'PERCENT' }))
    await user.click(screen.getByRole('button', { name: th.loadChart.table }))
    const rows = within(screen.getByRole('table')).getAllByRole('row')
    const ivy = within(rows[2]!).getAllByRole('cell')
    expect(ivy[0]).toHaveTextContent(`50% (${th.loadChart.daysValue('2.5', '5.0')})`)
    expect(ivy[0]!.querySelector('[aria-hidden="true"]')).toHaveTextContent('50%')
    expect(ivy[2]).toHaveTextContent(th.loadChart.noCapacity)
  })

  it('M11.1 FR-1010: the panel head has the "% | วัน/capacity" toggle (the load.display preference)', () => {
    renderPanel(props())
    expect(screen.getByRole('group', { name: th.loadDisplay.label })).toBeInTheDocument()
  })

  it('the "รวมงานโปรเจคอื่น" switch calls onIncludeOthers (shared with the footer, X29)', async () => {
    const user = userEvent.setup()
    const onIncludeOthers = vi.fn()
    const { rerender } = renderPanel(props({ onIncludeOthers }))
    const sw = screen.getByRole('switch', { name: th.loadChart.includeOthers })
    expect(sw).not.toBeChecked()
    await user.click(sw)
    expect(onIncludeOthers).toHaveBeenCalledWith(true)
    rerender(
      <ThemeProvider theme={theme} storageManager={null}>
        <LoadChartPanel {...props({ onIncludeOthers, includeOthers: true })} />
      </ThemeProvider>,
    )
    expect(screen.getByRole('switch', { name: th.loadChart.includeOthers })).toBeChecked()
  })

  it('legend: click pins a person (aria-pressed, others fade); click again unpins', async () => {
    const user = userEvent.setup()
    renderPanel(props())
    const legend = screen.getByRole('list', { name: th.loadChart.legend })
    const ivy = within(legend).getByRole('button', { name: 'Ivy' })
    await user.click(ivy)
    expect(ivy).toHaveAttribute('aria-pressed', 'true')
    expect(opacityOf('cindy')).toBe('0.3')
    await user.unhover(ivy)
    await user.click(ivy)
    expect(ivy).toHaveAttribute('aria-pressed', 'false')
    ivy.blur()
    await user.unhover(ivy)
    expect(opacityOf('cindy')).toBe('1')
  })

  it('keyboard focus on a legend item previews that person', async () => {
    const user = userEvent.setup()
    renderPanel(props())
    // Tab through the head (M11.1 "% | วัน/capacity" toggle, switch, table toggle) to the first legend item
    const cindy = screen.getByRole('button', { name: 'Cindy' })
    for (let i = 0; i < 8 && document.activeElement !== cindy; i++) await user.tab()
    expect(cindy).toHaveFocus()
    expect(opacityOf('ivy')).toBe('0.3')
  })

  it('empty states: no people → ยังไม่มีใครมีภาระในช่วงนี้; loading → skeleton', () => {
    const { unmount } = renderPanel(props({ series: [] }))
    expect(screen.getByText(th.loadChart.empty)).toBeInTheDocument()
    expect(screen.queryByTestId('load-line-chart')).toBeNull()
    unmount()
    renderPanel(props({ series: [], loading: true }))
    expect(screen.getByLabelText(th.loadChart.loading)).toBeInTheDocument()
    expect(screen.queryByText(th.loadChart.empty)).toBeNull()
  })
})
