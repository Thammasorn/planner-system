// plan/m07 S3.10 — day-level load, BR-40 levels and BR-45 footer tones (X06/X67, M7-D13/D14).
import { describe, expect, it } from 'vitest'
import type { GridRow } from '@/lib/contracts/grid'
import { footerDayCell, otherDayLoads, personDayLoads, personDayStatus } from './day-footer'
import { gridResponse } from './fixtures.test.data'

// F2: Jack + Mint 500 committed in 2026-10-19, Fri 10-23 a holiday (day cap 0) → derived 125 Mon–Thu
const f2 = gridResponse({
  from: '2026-10-19',
  expand: ['2026-10-19'],
  tasks: [
    { id: 't-j', name: 'J', assignees: [{ taId: 'a-jack', userId: 'jack', cells: { '2026-10-19': 500 } }] },
    { id: 't-m', name: 'M', assignees: [{ taId: 'a-mix', userId: 'mint', cells: { '2026-10-19': 500 } }] },
  ],
  people: {
    jack: { name: 'Jack', capacity: { '2026-10-19': 400 }, dayCaps: { '2026-10-23': 0 } },
    mint: { name: 'Mint', capacity: { '2026-10-19': 400 }, dayCaps: { '2026-10-23': 0 } },
  },
})
// F4: Cindy 250 tentative in 2026-10-12, leave Mon–Wed → derived 125 Thu, Fri
const f4 = gridResponse({
  from: '2026-10-12',
  expand: ['2026-10-12'],
  tasks: [
    {
      id: 't-c',
      name: 'C',
      certainty: 'TENTATIVE',
      assignees: [{ taId: 'a-cindy', userId: 'cindy', cells: { '2026-10-12': 250 } }],
    },
  ],
  people: {
    cindy: {
      name: 'Cindy',
      capacity: { '2026-10-12': 200 },
      dayCaps: { '2026-10-12': 0, '2026-10-13': 0, '2026-10-14': 0 },
      timeOff: [{ start: '2026-10-12', end: '2026-10-14', half: null, label: 'ลา' }],
    },
  },
})

describe('personDayLoads + personDayStatus', () => {
  it('F2 Jack 10-19 derived 125 committed, cap 100 → OVER', () => {
    const loads = personDayLoads(f2.rows, f2.periods, {})
    expect(loads.get('jack')?.['D:2026-10-19']).toEqual({ total: 125, committed: 125 })
    expect(personDayStatus(loads.get('jack'), f2.people.jack, 'D:2026-10-19')).toEqual({
      level: 'OVER',
      load: { total: 125, committed: 125 },
      capCd: 100,
    })
    expect(personDayStatus(loads.get('jack'), f2.people.jack, 'D:2026-10-23').level).toBe('OK')
  })
  it('F4 Cindy 10-15 125 tentative, cap 100 → RISK', () => {
    const loads = personDayLoads(f4.rows, f4.periods, {})
    expect(personDayStatus(loads.get('cindy'), f4.people.cindy, 'D:2026-10-15')).toEqual({
      level: 'RISK',
      load: { total: 125, committed: 0 },
      capCd: 100,
    })
  })
  it('half-day leave cap 50 + DAY 100 committed → OVER (r5 M7-10)', () => {
    const r = gridResponse({
      from: '2026-09-28',
      expand: ['2026-09-28'],
      tasks: [{ id: 't', name: 'T', assignees: [{ taId: 'a', userId: 'u', cells: { '2026-09-28': { days: { '2026-09-29': 100 } } } }] }],
      people: { u: { name: 'U', dayCaps: { '2026-09-29': 50 } } },
    })
    const loads = personDayLoads(r.rows, r.periods, {})
    expect(personDayStatus(loads.get('u'), r.people.u, 'D:2026-09-29').level).toBe('OVER')
  })
  it('BR-50: a completed task counts in its completion week (2026-10-01), not later (2026-10-05)', () => {
    const r = gridResponse({
      from: '2026-09-28',
      expand: ['2026-09-28', '2026-10-05'],
      tasks: [
        {
          id: 't',
          name: 'T',
          completedWeek: '2026-09-28',
          assignees: [{ taId: 'a', userId: 'u', cells: { '2026-09-28': 500, '2026-10-05': 500 } }],
        },
      ],
      people: { u: { name: 'U' } },
    })
    const loads = personDayLoads(r.rows, r.periods, {})
    expect(loads.get('u')?.['D:2026-10-01']).toEqual({ total: 100, committed: 100 })
    expect(loads.get('u')?.['D:2026-10-05']).toBeUndefined()
  })
  it('extra: otherDayLoads(people) adds otherProjects D: keys', () => {
    const people = {
      ...f2.people,
      jack: { ...f2.people.jack!, otherProjects: { 'D:2026-10-19': { total: 50, committed: 0 }, 'W:2026-10-19': { total: 50, committed: 0 } } },
    }
    const extra = otherDayLoads(people)
    expect([...extra.keys()]).toEqual(['jack'])
    expect(extra.get('jack')).toEqual({ 'D:2026-10-19': { total: 50, committed: 0 } })
    const loads = personDayLoads(f2.rows, f2.periods, { extra })
    expect(loads.get('jack')?.['D:2026-10-19']).toEqual({ total: 175, committed: 125 })
  })
  it('extra with a masked-row map (M9 person context) adds to that day', () => {
    const r = gridResponse({
      from: '2026-09-28',
      expand: ['2026-09-28'],
      tasks: [{ id: 't', name: 'T', assignees: [{ taId: 'a', userId: 'ivy', cells: { '2026-09-28': 250 } }] }],
      people: { ivy: { name: 'Ivy' } },
    })
    const loads = personDayLoads(r.rows, r.periods, {
      extra: new Map([['ivy', { 'D:2026-09-28': { total: 50, committed: 50 } }]]),
    })
    expect(loads.get('ivy')?.['D:2026-09-28']).toEqual({ total: 100, committed: 100 })
  })
  it('rows of another kind (M9 masked) are skipped without throwing', () => {
    const rows = [...f2.rows, { kind: 'masked', userId: 'jack', cells: {} } as unknown as GridRow]
    expect(() => personDayLoads(rows, f2.periods, {})).not.toThrow()
  })
})

describe('footerDayCell', () => {
  it('Jack + Mint on 10-19 (250 / 200) → tone over, glyph OVER, both listed by name', () => {
    const loads = personDayLoads(f2.rows, f2.periods, {})
    const statuses = new Map(
      ['mint', 'jack'].map((u) => [u, personDayStatus(loads.get(u), f2.people[u], 'D:2026-10-19')] as const),
    )
    const f = footerDayCell(statuses, 'ALL', (u) => f2.people[u]!.name)
    expect(f).toEqual({ tone: 'over', palette: 'load', glyph: 'OVER', overPeople: ['jack', 'mint'], load: 250, capCd: 200 })
  })
  it('view AT_RISK for Cindy 10-15 → load 125, palette tentative', () => {
    const loads = personDayLoads(f4.rows, f4.periods, {})
    const statuses = new Map([['cindy', personDayStatus(loads.get('cindy'), f4.people.cindy, 'D:2026-10-15')]])
    expect(footerDayCell(statuses, 'AT_RISK')).toMatchObject({ load: 125, palette: 'tentative', glyph: 'RISK', tone: 'over' })
    expect(footerDayCell(statuses, 'COMMITTED')).toMatchObject({ load: 0, tone: 'empty', glyph: 'RISK' })
  })
})
