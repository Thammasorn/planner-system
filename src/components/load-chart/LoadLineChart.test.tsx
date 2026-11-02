import { render, screen } from '@testing-library/react'
import { ThemeProvider } from '@mui/material/styles'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { th } from '@/i18n/th'
import type { GridMarkerView } from '@/lib/contracts/plan-markers'
import { theme } from '@/lib/theme/theme'
import { chartPeople } from './chart-model'
import { LoadLineChart, type LoadLineChartProps } from './LoadLineChart'
import type { LoadSeries } from './types'

// The real MUI X LineChart in jsdom (r9 §3c): offset getters + a no-op ResizeObserver; explicit width/height.
const restore: (() => void)[] = []
beforeAll(() => {
  for (const [prop, v] of [
    ['offsetWidth', 700],
    ['clientWidth', 700],
    ['offsetHeight', 240],
    ['clientHeight', 240],
  ] as const) {
    const before = Object.getOwnPropertyDescriptor(HTMLElement.prototype, prop)
    Object.defineProperty(HTMLElement.prototype, prop, { configurable: true, get: () => v })
    restore.push(() => {
      if (before) Object.defineProperty(HTMLElement.prototype, prop, before)
    })
  }
  const RO = globalThis.ResizeObserver
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver
  restore.push(() => {
    globalThis.ResizeObserver = RO
  })
})
afterAll(() => restore.forEach((f) => f()))

const W = ['2026-09-28', '2026-10-05', '2026-10-12', '2026-10-19']
const SERIES: LoadSeries[] = [
  {
    userId: 'cindy',
    name: 'Cindy',
    points: [
      { week: W[0]!, loadCd: 250, capacityCd: 500, pct: 50, level: 'OK' },
      { week: W[1]!, loadCd: 650, capacityCd: 500, pct: 130, level: 'OVER' },
      { week: W[2]!, loadCd: 100, capacityCd: 500, pct: 20, level: 'OK' },
      { week: W[3]!, loadCd: null, capacityCd: null, pct: null, level: null },
    ],
  },
  {
    userId: 'ivy',
    name: 'Ivy',
    points: [
      { week: W[0]!, loadCd: 250, capacityCd: 500, pct: 50, level: 'RISK' },
      { week: W[1]!, loadCd: 130, capacityCd: 500, pct: 26, level: 'OK' },
      { week: W[2]!, loadCd: 0, capacityCd: 500, pct: 0, level: 'OK' },
      { week: W[3]!, loadCd: null, capacityCd: null, pct: null, level: null },
    ],
  },
]
const MARKER: GridMarkerView = {
  id: 'm1',
  source: 'PLAN',
  date: '2026-10-09',
  tone: 'YELLOW',
  label: 'UAT sign-off',
  editable: true,
}

function renderChart(over: Partial<LoadLineChartProps> = {}) {
  const p: LoadLineChartProps = {
    weeks: W,
    series: SERIES,
    people: chartPeople(SERIES),
    unit: 'DAYS',
    markers: [MARKER],
    focused: null,
    height: 240,
    width: 700,
    skipAnimation: true,
    ...over,
  }
  return render(
    <ThemeProvider theme={theme} storageManager={null}>
      <LoadLineChart {...p} />
    </ThemeProvider>,
  )
}

describe('LoadLineChart (real @mui/x-charts in jsdom, FR-813)', () => {
  it('draws one line per person with its shape, week labels on x, and the marker reference line', () => {
    const { container } = renderChart()
    expect(container.querySelector('svg')).not.toBeNull()
    expect(container.querySelectorAll('.MuiLineChart-line[data-series="u:cindy"]').length).toBe(1)
    expect(container.querySelectorAll('.MuiLineChart-line[data-series="u:ivy"]').length).toBe(1)
    // 3 loaded weeks each → 3 marks per person; the null week is a gap (no mark)
    expect(container.querySelectorAll('.MuiLineChart-mark[data-series="u:cindy"]').length).toBe(3)
    for (const label of ['28/9', '5/10', '12/10', '19/10']) expect(screen.getAllByText(label).length).toBeGreaterThan(0)
    expect(screen.getByText('UAT sign-off')).toBeInTheDocument()
    expect(container.querySelector('.MuiChartsReferenceLine-root')).not.toBeNull()
    expect(screen.getByText(th.loadChart.unitDays)).toBeInTheDocument()
  })

  it('OVER / RISK points get a ringed mark (data-alert), the others a plain mark', () => {
    const { container } = renderChart()
    const alerts = [...container.querySelectorAll('[data-alert]')]
    expect(alerts.map((g) => g.getAttribute('data-alert')).sort()).toEqual(['OVER', 'RISK'])
    const over = container.querySelector('[data-alert="OVER"]')!
    expect(over.querySelector('circle')).not.toBeNull()
    expect(over.querySelector('.MuiLineChart-mark')).toHaveAttribute('data-index', '1')
  })

  it('DAYS + focused person → a dashed capacity series; FRACTION → the 1.0 reference line, no capacity series', () => {
    const { container, unmount } = renderChart({ focused: 'ivy' })
    expect(container.querySelector('.MuiLineChart-line[data-series="cap"]')).not.toBeNull()
    unmount()
    const r = renderChart({ unit: 'FRACTION', focused: 'ivy' })
    expect(r.container.querySelector('.MuiLineChart-line[data-series="cap"]')).toBeNull()
    expect(screen.getByText(th.loadChart.fullCapacity)).toBeInTheDocument()
    expect(screen.getByText(th.loadChart.unitFraction)).toBeInTheDocument()
  })
})
