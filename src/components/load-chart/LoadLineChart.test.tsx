import { fireEvent, render, screen } from '@testing-library/react'
import { ThemeProvider } from '@mui/material/styles'
import { describe, expect, it } from 'vitest'
import { th } from '@/i18n/th'
import { DAY_W, WEEK_TOTAL_W, WEEK_W } from '@/lib/grid/columns'
import type { GridMarkerView } from '@/lib/grid/markers'
import { theme } from '@/lib/theme/theme'
import { chartPeople } from './chart-model'
import { FROZEN, testLayout, W } from './layout.test.data'
import { LoadLineChart, type LoadLineChartProps } from './LoadLineChart'
import type { LoadSeries } from './types'

const SERIES: LoadSeries[] = [
  {
    userId: 'cindy',
    name: 'Cindy',
    points: [
      { week: W[0], loadCd: 250, capacityCd: 500, pct: 50, level: 'OK' },
      { week: W[1], loadCd: 650, capacityCd: 500, pct: 130, level: 'OVER' },
      { week: W[2], loadCd: 100, capacityCd: 500, pct: 20, level: 'OK' },
      { week: W[3], loadCd: null, capacityCd: null, pct: null, level: null },
    ],
  },
  {
    userId: 'ivy',
    name: 'Ivy',
    points: [
      { week: W[0], loadCd: 250, capacityCd: 500, pct: 50, level: 'RISK' },
      { week: W[1], loadCd: 130, capacityCd: 500, pct: 26, level: 'OK' },
      { week: W[2], loadCd: 0, capacityCd: 500, pct: 0, level: 'OK' },
      { week: W[3], loadCd: null, capacityCd: null, pct: null, level: null },
    ],
  },
]
/** M11.1: the chart's vertical lines are milestones in their colour */
const MARKER: GridMarkerView = { id: 'm1', date: '2026-10-09', color: 'YELLOW', label: 'UAT sign-off' }

function renderChart(over: Partial<LoadLineChartProps> = {}) {
  const p: LoadLineChartProps = {
    layout: testLayout({ markers: [MARKER] }),
    series: SERIES,
    people: chartPeople(SERIES),
    display: 'DAYS',
    focused: null,
    height: 240,
    ...over,
  }
  return render(
    <ThemeProvider theme={theme} storageManager={null}>
      <LoadLineChart {...p} />
    </ThemeProvider>,
  )
}

const px = (el: Element, prop: 'left' | 'width') => parseFloat((el as HTMLElement).style[prop])
/** x of a point in content coordinates: the plot's left + the point's translate x */
function pointX(container: HTMLElement, user: string, week: string): number {
  const plot = container.querySelector('svg[class*="plot"]') as SVGSVGElement
  const g = container.querySelector(`[data-chart-point][data-user="${user}"][data-week="${week}"]`)!
  const tx = Number(/translate\(([-\d.]+)/.exec(g.getAttribute('transform')!)![1])
  return parseFloat(plot.style.left) + tx
}

describe('LoadLineChart on the grid’s columns (FR-813, M7.1-D30)', () => {
  it('one chart column per grid column at the grid’s x (frozen width + offset) and width', () => {
    const { container } = renderChart()
    const cols = [...container.querySelectorAll('[data-chart-col]')]
    expect(cols.map((c) => c.getAttribute('data-chart-col'))).toEqual(W.map((w) => `W:${w}`))
    const cs = container.querySelector('[class*="cols"]') as HTMLElement
    cols.forEach((c, i) => {
      expect(parseFloat(cs.style.left) + px(c, 'left')).toBe(FROZEN + i * WEEK_W)
      expect(px(c, 'width')).toBe(WEEK_W)
    })
    expect(container.querySelector('[data-testid="load-line-chart"]')).toHaveStyle({
      width: `${FROZEN + 4 * WEEK_W + 72}px`,
    })
  })

  it('points and x ticks are centred on their week column; a not-loaded week is a gap', () => {
    const { container } = renderChart()
    W.slice(0, 3).forEach((w, i) => {
      expect(pointX(container, 'cindy', w)).toBe(FROZEN + i * WEEK_W + WEEK_W / 2)
      const tick = container.querySelector(`[data-chart-tick="W:${w}"]`)!
      expect(px(tick, 'left') + px(tick, 'width') / 2).toBe(FROZEN + i * WEEK_W + WEEK_W / 2)
      expect(tick).toHaveTextContent(['28/9', '5/10', '12/10'][i]!)
    })
    expect(container.querySelector(`[data-chart-point][data-week="${W[3]}"]`)).toBeNull()
  })

  it('an expanded week: day columns are chart columns, the point sits on its “รวม” column', () => {
    const { container } = renderChart({ layout: testLayout({ expanded: [W[1]] }) })
    const keys = [...container.querySelectorAll('[data-chart-col]')].map((c) =>
      c.getAttribute('data-chart-col'),
    )
    expect(keys).toEqual([
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
    expect(pointX(container, 'cindy', W[1])).toBe(FROZEN + WEEK_W + 5 * DAY_W + WEEK_TOTAL_W / 2)
    expect(pointX(container, 'cindy', W[2])).toBe(FROZEN + WEEK_W + 5 * DAY_W + WEEK_TOTAL_W + WEEK_W / 2)
    expect(container.querySelectorAll('[data-chart-tick]')).toHaveLength(4)
  })

  it('follows a resized / hidden frozen area', () => {
    const { container } = renderChart({ layout: testLayout({ frozen: 240 }) })
    expect(pointX(container, 'cindy', W[0])).toBe(240 + WEEK_W / 2)
  })

  it('month lines on the grid’s month starts; milestone lines (colour + pattern) at the grid’s edge', () => {
    const { container } = renderChart()
    expect(
      [...container.querySelectorAll('[data-chart-col][data-month-start]')].map((c) =>
        c.getAttribute('data-chart-col'),
      ),
    ).toEqual(['W:2026-10-05'])
    const line = container.querySelector('[data-chart-marker="m1"]')!
    expect(line).toHaveAttribute('data-color', 'YELLOW')
    expect(px(line, 'left')).toBe(FROZEN + 2 * WEEK_W - 1) // right edge of 5/10, like the grid's MarkerLines
  })

  it('OVER / RISK points get a ring (data-alert); others a plain mark; shapes per person', () => {
    const { container } = renderChart()
    expect(container.querySelector(`[data-user="cindy"][data-week="${W[1]}"]`)).toHaveAttribute(
      'data-alert',
      'OVER',
    )
    expect(container.querySelector(`[data-user="ivy"][data-week="${W[0]}"]`)).toHaveAttribute(
      'data-alert',
      'RISK',
    )
    expect(container.querySelector(`[data-user="cindy"][data-week="${W[0]}"]`)).not.toHaveAttribute(
      'data-alert',
    )
    expect(container.querySelector(`[data-user="ivy"][data-week="${W[0]}"] path`)).toBeInTheDocument() // square
  })

  it('DAYS + focused person → their dashed capacity line, others faded; PERCENT → the 100% line + label, no cap line', () => {
    const { container, unmount } = renderChart({ focused: 'ivy' })
    expect(container.querySelector('[data-series="cap"]')).toBeInTheDocument()
    expect(container.querySelector('[data-series="u:cindy"]')).toHaveAttribute('opacity', '0.3')
    expect(container.querySelector('[data-series="u:ivy"]')).toHaveAttribute('opacity', '1')
    expect(container.querySelector('[data-ref-line]')).toBeNull()
    unmount()
    const f = renderChart({ display: 'PERCENT', focused: 'ivy' })
    expect(f.container.querySelector('[data-series="cap"]')).toBeNull()
    expect(f.container.querySelector('[data-ref-line="100"]')).toBeInTheDocument()
    expect(screen.getByText(th.loadChart.fullCapacityPercent)).toBeInTheDocument()
  })

  it('PERCENT (M11.1-D5): y = pct; a point above 100% carries its value label and the band above 100% is hatched', () => {
    const { container } = renderChart({ display: 'PERCENT' })
    const over = container.querySelector(`[data-user="cindy"][data-week="${W[1]}"]`)!
    expect(over).toHaveAttribute('data-over-full', 'true')
    expect(over.querySelector('text')).toHaveTextContent('130%')
    const ok = container.querySelector(`[data-user="cindy"][data-week="${W[0]}"]`)!
    expect(ok).not.toHaveAttribute('data-over-full')
    expect(ok.querySelector('text')).toBeNull()
    expect(container.querySelector('[data-over-band]')).toBeInTheDocument()
    // the 100% line sits above the 50% point and below the 130% one
    const yOf = (el: Element) =>
      Number(/translate\([-\d.]+ ([-\d.]+)/.exec(el.getAttribute('transform')!)![1])
    const ref = Number(container.querySelector('[data-ref-line="100"]')!.getAttribute('y1'))
    expect(yOf(ok)).toBeGreaterThan(ref)
    expect(yOf(over)).toBeLessThan(ref)
  })

  it('PERCENT: capacity 0 → a gap (no point) and the "ไม่มี capacity" note under the chart', () => {
    const series: LoadSeries[] = [
      {
        userId: 'mint',
        name: 'Mint',
        points: [
          { week: W[0], loadCd: 100, capacityCd: 500, pct: 20, level: 'OK' },
          { week: W[1], loadCd: 100, capacityCd: 0, pct: null, level: 'OVER' },
          { week: W[2], loadCd: 100, capacityCd: 500, pct: 20, level: 'OK' },
        ],
      },
    ]
    const { container } = renderChart({ display: 'PERCENT', series, people: chartPeople(series) })
    expect(container.querySelector(`[data-user="mint"][data-week="${W[1]}"]`)).toBeNull()
    expect(
      container.querySelector('[data-series="u:mint"] path')!.getAttribute('d')!.match(/M/g),
    ).toHaveLength(2)
    expect(screen.getByTestId('load-chart-no-capacity')).toHaveTextContent(
      th.loadChart.noCapacityNote(th.loadChart.noCapacityOf('Mint', '5/10')),
    )
  })

  it('hovering a column shows the week’s values for everyone (tooltip)', () => {
    const { container } = renderChart()
    const cols = container.querySelector('[class*="cols"]') as HTMLElement
    cols.getBoundingClientRect = () => ({
      left: 0,
      top: 0,
      right: 0,
      bottom: 0,
      width: 0,
      height: 0,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    })
    fireEvent.pointerMove(cols, { clientX: WEEK_W + 10 })
    const tip = screen.getByTestId('load-chart-tooltip')
    expect(tip).toHaveTextContent(th.loadChart.week('5/10'))
    expect(tip).toHaveTextContent(`${th.loadChart.daysValue('6.5', '5.0')} · ${th.loadChart.over('1.5')}`)
    expect(tip).toHaveTextContent(th.loadChart.daysValue('1.3', '5.0'))
  })

  it('PERCENT tooltip: "130% (6.5 / 5.0 วัน)"', () => {
    const { container } = renderChart({ display: 'PERCENT' })
    const cols = container.querySelector('[class*="cols"]') as HTMLElement
    cols.getBoundingClientRect = () => ({
      left: 0,
      top: 0,
      right: 0,
      bottom: 0,
      width: 0,
      height: 0,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    })
    fireEvent.pointerMove(cols, { clientX: WEEK_W + 10 })
    expect(screen.getByTestId('load-chart-tooltip')).toHaveTextContent(
      `130% (${th.loadChart.daysValue('6.5', '5.0')})`,
    )
  })
})
