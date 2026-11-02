import { describe, expect, it } from 'vitest'
import { th } from '@/i18n/th'
import { BOTTOM_NAV, PRIMARY_NAV } from './nav'

describe('nav entries (SPEC §8.1, X33/X84, M4-D27; plan/m09 S0.9)', () => {
  it('primary order is home, my, tasks, workload, calendar', () => {
    expect(PRIMARY_NAV.map((i) => i.id)).toEqual(['home', 'my', 'tasks', 'workload', 'calendar'])
  })

  it('bottom order is people, clients, settings (people immediately before clients)', () => {
    const ids = BOTTOM_NAV.map((i) => i.id)
    expect(ids).toEqual(['people', 'clients', 'settings'])
    expect(ids.indexOf('people')).toBe(ids.indexOf('clients') - 1)
  })

  it('Workload ทีม links to /workload with the workloadOver badge; ทีมงาน links to /people', () => {
    const all = [...PRIMARY_NAV, ...BOTTOM_NAV]
    expect(all.filter((i) => i.badge === 'workloadOver').map((i) => i.id)).toEqual(['workload'])
    expect(all.find((i) => i.id === 'workload')).toMatchObject({
      href: '/workload',
      label: th.nav.workload,
      icon: 'workload',
    })
    expect(all.find((i) => i.id === 'people')).toMatchObject({
      href: '/people',
      label: th.nav.people,
      icon: 'people',
    })
    expect(all.find((i) => i.id === 'people')?.managerOnly).toBeUndefined()
  })
})
