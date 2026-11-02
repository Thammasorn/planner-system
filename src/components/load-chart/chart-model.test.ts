import { describe, expect, it } from 'vitest'
import { th } from '@/i18n/th'
import type { GridMarkerView } from '@/lib/contracts/plan-markers'
import {
  alertPoints,
  alertText,
  capacityValue,
  chartPeople,
  days1,
  markerReferences,
  pointText,
  pointValue,
  SHAPES,
  weekLabels,
} from './chart-model'
import type { LoadSeries, LoadSeriesPoint } from './types'

const pt = (over: Partial<LoadSeriesPoint> = {}): LoadSeriesPoint => ({
  week: '2026-09-28',
  loadCd: 250,
  capacityCd: 500,
  pct: 50,
  level: 'OK',
  ...over,
})
const NULL_PT: LoadSeriesPoint = { week: '2026-10-05', loadCd: null, capacityCd: null, pct: null, level: null }

describe('chartPeople (M7.1-D4)', () => {
  it('person i gets --chart-{(i mod 8)+1} and SHAPES[i mod 7]', () => {
    const series: LoadSeries[] = Array.from({ length: 9 }, (_, i) => ({ userId: `u${i}`, name: `N${i}`, points: [] }))
    const people = chartPeople(series)
    expect(people[0]).toMatchObject({ color: 'var(--chart-1)', shape: 'circle', seriesId: 'u:u0', name: 'N0' })
    expect(people[1]!.shape).toBe('square')
    expect(people[7]).toMatchObject({ color: 'var(--chart-8)', shape: SHAPES[0] })
    expect(people[8]).toMatchObject({ color: 'var(--chart-1)', shape: SHAPES[1] })
  })
})

describe('point values (BR-104 display edge)', () => {
  it('DAYS = cd / 100, FRACTION = pct / 100, cap 0 → no point, not loaded → null', () => {
    expect(pointValue(pt(), 'DAYS')).toBe(2.5)
    expect(pointValue(pt(), 'FRACTION')).toBe(0.5)
    expect(pointValue(pt({ capacityCd: 0, pct: null }), 'FRACTION')).toBeNull()
    expect(pointValue(pt({ capacityCd: 0, pct: null }), 'DAYS')).toBe(2.5)
    expect(pointValue(NULL_PT, 'DAYS')).toBeNull()
    expect(capacityValue(pt())).toBe(5)
    expect(capacityValue(NULL_PT)).toBeNull()
  })

  it('texts: "2.5 / 5.0 วัน", ratio with 2 decimals, 0 shows as 0, no capacity, not loaded', () => {
    expect(pointText(pt(), 'DAYS')).toBe(th.loadChart.daysValue('2.5', '5.0'))
    expect(pointText(pt({ loadCd: 0, pct: 0 }), 'DAYS')).toBe(th.loadChart.daysValue('0', '5.0'))
    expect(pointText(pt(), 'FRACTION')).toBe(`0.50 (${th.loadChart.daysValue('2.5', '5.0')})`)
    expect(pointText(pt({ capacityCd: 0, pct: null }), 'FRACTION')).toBe(th.loadChart.noCapacity)
    expect(pointText(NULL_PT, 'DAYS')).toBe(th.loadChart.notLoaded)
    expect(days1(130)).toBe('1.3')
  })

  it('alerts: OVER carries the excess, RISK its text, OK none', () => {
    expect(alertText(pt({ loadCd: 650, level: 'OVER' }))).toBe(th.loadChart.over('1.5'))
    expect(alertText(pt({ level: 'RISK' }))).toBe(th.loadChart.risk)
    expect(alertText(pt())).toBeNull()
    expect(alertText(NULL_PT)).toBeNull()
    const series: LoadSeries[] = [
      { userId: 'cindy', name: 'Cindy', points: [pt(), pt({ level: 'OVER' })] },
      { userId: 'ivy', name: 'Ivy', points: [pt({ level: 'RISK' }), NULL_PT] },
    ]
    expect([...alertPoints(series)]).toEqual([
      ['u:cindy:1', 'OVER'],
      ['u:ivy:0', 'RISK'],
    ])
  })
})

describe('axis + markers (FR-813, FR-820)', () => {
  it('week labels are the grid week headers', () => {
    expect(weekLabels(['2026-09-28', '2026-10-05'])).toEqual(['28/9', '5/10'])
  })

  it('markers on an axis week become reference lines with their tone pattern; others are dropped', () => {
    const m = (id: string, date: string, tone: GridMarkerView['tone'], label: string | null): GridMarkerView => ({
      id,
      source: tone === 'MILESTONE' ? 'MILESTONE' : 'PLAN',
      date,
      tone,
      label,
      editable: true,
    })
    const refs = markerReferences(
      [
        m('a', '2026-10-02', 'RED', 'UAT sign-off'),
        m('b', '2026-10-06', 'YELLOW', null),
        m('c', '2026-10-30', 'GREEN', 'late'),
        m('d', '2026-09-28', 'MILESTONE', 'go-live'),
      ],
      ['2026-09-28', '2026-10-05'],
    )
    expect(refs).toEqual([
      { id: 'a', x: '28/9', label: 'UAT sign-off', stroke: 'var(--marker-red)', dash: undefined },
      { id: 'b', x: '5/10', label: '', stroke: 'var(--marker-yellow)', dash: '6 4' },
      { id: 'd', x: '28/9', label: 'go-live', stroke: 'var(--milestone)', dash: '8 3 2 3' },
    ])
  })
})
