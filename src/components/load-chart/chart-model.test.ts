import { describe, expect, it } from 'vitest'
import { th } from '@/i18n/th'
import {
  alertPoints,
  alertText,
  capacityValue,
  chartPeople,
  days1,
  compactText,
  isOverFull,
  noCapacityNote,
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

describe('point values (BR-104 display edge, M11.1 load.display)', () => {
  it('DAYS = cd / 100; PERCENT = the integer pct; cap 0 → no PERCENT point (gap); not loaded → null', () => {
    expect(pointValue(pt(), 'DAYS')).toBe(2.5)
    expect(pointValue(pt(), 'PERCENT')).toBe(50)
    expect(pointValue(pt({ loadCd: 375, capacityCd: 600, pct: 63 }), 'PERCENT')).toBe(63)
    expect(pointValue(pt({ capacityCd: 0, pct: null }), 'PERCENT')).toBeNull()
    expect(pointValue(pt({ capacityCd: 0, pct: null }), 'DAYS')).toBe(2.5)
    expect(pointValue(NULL_PT, 'DAYS')).toBeNull()
    expect(pointValue(NULL_PT, 'PERCENT')).toBeNull()
    expect(capacityValue(pt())).toBe(5)
    expect(capacityValue(NULL_PT)).toBeNull()
  })

  it('texts: PERCENT "63% (3.8 / 6.0 วัน)"; DAYS "2.5 / 5.0 วัน"; 0 shows as 0; no capacity; not loaded', () => {
    expect(pointText(pt({ loadCd: 375, capacityCd: 600, pct: 63 }), 'PERCENT')).toBe(
      `63% (${th.loadChart.daysValue('3.8', '6.0')})`,
    )
    expect(pointText(pt(), 'DAYS')).toBe(th.loadChart.daysValue('2.5', '5.0'))
    expect(pointText(pt({ loadCd: 0, pct: 0 }), 'DAYS')).toBe(th.loadChart.daysValue('0', '5.0'))
    expect(pointText(pt({ loadCd: 0, pct: 0 }), 'PERCENT')).toBe(`0% (${th.loadChart.daysValue('0', '5.0')})`)
    expect(pointText(pt({ capacityCd: 0, pct: null }), 'PERCENT')).toBe(th.loadChart.noCapacity)
    expect(pointText(NULL_PT, 'DAYS')).toBe(th.loadChart.notLoaded)
    expect(days1(130)).toBe('1.3')
  })

  it('above 100 % (M11.1-D5): only PERCENT points over 100 are flagged', () => {
    expect(isOverFull(pt({ pct: 125 }), 'PERCENT')).toBe(true)
    expect(isOverFull(pt({ pct: 100 }), 'PERCENT')).toBe(false)
    expect(isOverFull(pt({ pct: 125 }), 'DAYS')).toBe(false)
    expect(isOverFull(pt({ capacityCd: 0, pct: null }), 'PERCENT')).toBe(false)
  })

  it('no-capacity note: PERCENT lists each person with the loaded weeks whose capacity is 0', () => {
    const series: LoadSeries[] = [
      { userId: 'cindy', name: 'Cindy', points: [pt(), pt({ week: '2026-10-12', capacityCd: 0, pct: null })] },
      { userId: 'ivy', name: 'Ivy', points: [pt(), NULL_PT] },
    ]
    expect(noCapacityNote(series, 'PERCENT')).toBe(th.loadChart.noCapacityNote(th.loadChart.noCapacityOf('Cindy', '12/10')))
    expect(noCapacityNote(series, 'DAYS')).toBeNull()
    expect(noCapacityNote([series[1]!], 'PERCENT')).toBeNull()
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

  it('compact table text (M7.1-D30, M11.1): DAYS load/cap, PERCENT "50%", not loaded / no capacity → –', () => {
    expect(compactText(pt(), 'DAYS')).toBe('2.5/5.0')
    expect(compactText(pt({ loadCd: 0 }), 'DAYS')).toBe('0/5.0')
    expect(compactText(pt(), 'PERCENT')).toBe('50%')
    expect(compactText(pt({ pct: null, capacityCd: 0 }), 'PERCENT')).toBe('–')
    expect(compactText(NULL_PT, 'DAYS')).toBe('–')
  })
})
