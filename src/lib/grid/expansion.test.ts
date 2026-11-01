// plan/m07 S3.2 — expansion state and per-chunk params (FR-802/803, M7-D11, M7-D24).
import { describe, expect, it } from 'vitest'
import { gridChunkUrl } from './fetch'
import {
  chunkParams,
  collapseWeek,
  dayDatesByWeek,
  expandWeek,
  isExpanded,
  toggleWeek,
  type ExpansionState,
} from './expansion'

const week: ExpansionState = { zoom: 'WEEK', expanded: new Set() }

describe('toggleWeek / isExpanded', () => {
  it('toggle twice → original', () => {
    const once = toggleWeek(week, '2026-09-28')
    expect(isExpanded(once, '2026-09-28')).toBe(true)
    const twice = toggleWeek(once, '2026-09-28')
    expect([...twice.expanded]).toEqual([])
    expect(twice.zoom).toBe('WEEK')
  })
  it('DAY zoom: toggle is a no-op (same object) and every week counts as expanded', () => {
    const day: ExpansionState = { zoom: 'DAY', expanded: new Set() }
    expect(toggleWeek(day, '2026-09-28')).toBe(day)
    expect(expandWeek(day, '2026-09-28')).toBe(day)
    expect(collapseWeek(day, '2026-09-28')).toBe(day)
    expect(isExpanded(day, '2026-12-07')).toBe(true)
  })
  it('expand / collapse are idempotent', () => {
    const e = expandWeek(week, '2026-09-28')
    expect(expandWeek(e, '2026-09-28')).toBe(e)
    expect(collapseWeek(week, '2026-09-28')).toBe(week)
    expect(isExpanded(collapseWeek(e, '2026-09-28'), '2026-09-28')).toBe(false)
  })
})

describe('chunkParams (M7-D24)', () => {
  const s: ExpansionState = { zoom: 'WEEK', expanded: new Set(['2026-12-07', '2026-09-28']) }
  it('keeps only the expanded weeks inside the 8-week chunk, sorted', () => {
    expect(chunkParams(s, '2026-09-28', false)).toEqual({
      from: '2026-09-28',
      expand: ['2026-09-28'],
      zoom: 'WEEK',
      includeOthers: false,
    })
    expect(chunkParams(s, '2026-11-23', true)).toEqual({
      from: '2026-11-23',
      expand: ['2026-12-07'],
      zoom: 'WEEK',
      includeOthers: true,
    })
    expect(chunkParams(s, '2027-01-18', false).expand).toEqual([])
  })
  it('DAY zoom → zoom DAY, expand [] (URL ends with &zoom=day)', () => {
    const c = chunkParams({ zoom: 'DAY', expanded: new Set(['2026-09-28']) }, '2026-09-28', false)
    expect(c).toEqual({ from: '2026-09-28', expand: [], zoom: 'DAY', includeOthers: false })
    expect(gridChunkUrl({ kind: 'project', id: 'p1' }, c)).toMatch(/&zoom=day$/)
  })
})

describe('dayDatesByWeek', () => {
  it('groups D: periods by week in date order, ignoring W: periods', () => {
    const m = dayDatesByWeek([
      { key: 'D:2026-09-29', kind: 'DAY', weekStart: '2026-09-28', date: '2026-09-29' },
      { key: 'W:2026-09-28', kind: 'WEEK', weekStart: '2026-09-28', date: '2026-09-28', expanded: true },
      { key: 'D:2026-09-28', kind: 'DAY', weekStart: '2026-09-28', date: '2026-09-28' },
      { key: 'W:2026-10-05', kind: 'WEEK', weekStart: '2026-10-05', date: '2026-10-05' },
    ])
    expect([...m.entries()]).toEqual([['2026-09-28', ['2026-09-28', '2026-09-29']]])
  })
})
