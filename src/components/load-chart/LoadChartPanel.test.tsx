import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ThemeProvider } from '@mui/material/styles'
import type { ComponentType } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { th } from '@/i18n/th'
import { theme } from '@/lib/theme/theme'
import { LoadChartPanel } from './LoadChartPanel'
import type { LoadLineChartProps } from './LoadLineChart'
import type { LoadChartProps, LoadSeries } from './types'

// next/dynamic is mocked: the loader is recorded but never run, and the "chart" records the props it was given.
const d = vi.hoisted(() => ({ loaders: 0, renders: [] as LoadLineChartProps[] }))
vi.mock('next/dynamic', () => ({
  default: (_loader: () => Promise<ComponentType>) => {
    d.loaders++
    return function DynamicChart(props: LoadLineChartProps) {
      d.renders.push(props)
      return <div data-testid="dynamic-chart" />
    }
  },
}))

const W = ['2026-09-28', '2026-10-05', '2026-10-12', '2026-10-19'] as const
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
    series: SERIES,
    unit: 'DAYS',
    view: 'ALL',
    includeOthers: false,
    onIncludeOthers: vi.fn(),
    markers: [],
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

describe('LoadChartPanel (FR-813, M7.1-D2–D5)', () => {
  it('renders the chart through next/dynamic with the people, unit and markers', () => {
    d.renders.length = 0
    renderPanel(props())
    expect(screen.getByRole('region', { name: th.loadChart.title })).toBeInTheDocument()
    expect(screen.getByTestId('dynamic-chart')).toBeInTheDocument()
    const last = d.renders.at(-1)!
    expect(last.people.map((x) => [x.name, x.color, x.shape])).toEqual([
      ['Cindy', 'var(--chart-1)', 'circle'],
      ['Ivy', 'var(--chart-2)', 'square'],
    ])
    expect(last.unit).toBe('DAYS')
    expect(last.focused).toBeNull()
  })

  it('"ดูเป็นตาราง" shows the same values as the series (load / cap, 🔴 / ⚠ with text) and no chart', async () => {
    const user = userEvent.setup()
    d.renders.length = 0
    renderPanel(props())
    await user.click(screen.getByRole('button', { name: th.loadChart.table }))
    expect(screen.queryByTestId('dynamic-chart')).toBeNull()
    const table = screen.getByRole('table')
    const rows = within(table).getAllByRole('row')
    expect(within(rows[0]!).getAllByRole('columnheader').map((c) => c.textContent)).toEqual([
      th.loadChart.personHeader,
      '28/9',
      '5/10',
      '12/10',
      '19/10',
    ])
    const cindy = within(rows[1]!).getAllByRole('cell').map((c) => c.textContent)
    expect(cindy).toEqual([
      th.loadChart.daysValue('2.5', '5.0'),
      th.loadChart.daysValue('0', '5.0'),
      `${th.loadChart.daysValue('6.5', '5.0')}🔴${th.loadChart.over('1.5')}`,
      th.loadChart.notLoaded,
    ])
    const ivy = within(rows[2]!).getAllByRole('cell').map((c) => c.textContent)
    expect(ivy[1]).toBe(`${th.loadChart.daysValue('1.3', '5.0')}⚠${th.loadChart.risk}`)
    expect(within(rows[2]!).getByRole('rowheader')).toHaveTextContent('Ivy')
    // back to the chart
    await user.click(screen.getByRole('button', { name: th.loadChart.chart }))
    expect(screen.getByTestId('dynamic-chart')).toBeInTheDocument()
  })

  it('FRACTION table: ratio with 2 decimals; cap 0 → ไม่มี capacity', async () => {
    const user = userEvent.setup()
    renderPanel(props({ unit: 'FRACTION' }))
    await user.click(screen.getByRole('button', { name: th.loadChart.table }))
    const rows = within(screen.getByRole('table')).getAllByRole('row')
    const ivy = within(rows[2]!).getAllByRole('cell').map((c) => c.textContent)
    expect(ivy[0]).toBe(`0.50 (${th.loadChart.daysValue('2.5', '5.0')})`)
    expect(ivy[2]).toBe(th.loadChart.noCapacity)
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

  it('legend: click pins a person (aria-pressed) and passes it as focused; click again unpins', async () => {
    const user = userEvent.setup()
    d.renders.length = 0
    renderPanel(props())
    const legend = screen.getByRole('list', { name: th.loadChart.legend })
    const ivy = within(legend).getByRole('button', { name: 'Ivy' })
    await user.click(ivy)
    expect(ivy).toHaveAttribute('aria-pressed', 'true')
    expect(d.renders.at(-1)!.focused).toBe('ivy')
    await user.unhover(ivy)
    await user.click(ivy)
    expect(ivy).toHaveAttribute('aria-pressed', 'false')
    ivy.blur()
    await user.unhover(ivy)
    expect(d.renders.at(-1)!.focused).toBeNull()
  })

  it('keyboard focus on a legend item previews that person', async () => {
    const user = userEvent.setup()
    d.renders.length = 0
    renderPanel(props())
    await user.tab() // switch
    await user.tab() // table toggle
    await user.tab() // first legend item
    expect(screen.getByRole('button', { name: 'Cindy' })).toHaveFocus()
    expect(d.renders.at(-1)!.focused).toBe('cindy')
  })

  it('empty states: no people → ยังไม่มีใครมีภาระในช่วงนี้; loading → skeleton', () => {
    const { unmount } = renderPanel(props({ series: [] }))
    expect(screen.getByText(th.loadChart.empty)).toBeInTheDocument()
    expect(screen.queryByTestId('dynamic-chart')).toBeNull()
    unmount()
    renderPanel(props({ series: [], loading: true }))
    expect(screen.getByLabelText(th.loadChart.loading)).toBeInTheDocument()
    expect(screen.queryByText(th.loadChart.empty)).toBeNull()
  })

  it('calls next/dynamic once at module load, never per render', () => {
    expect(d.loaders).toBe(1)
  })
})
