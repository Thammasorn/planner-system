import { describe, expect, it } from 'vitest'
import { planViewParam, resolvePlanView, urlWithView } from './view'

describe('plan view resolution (FR-810, M7.1-D20)', () => {
  it('?view= wins over the stored value; unknown params are ignored; default GRID', () => {
    expect(resolvePlanView('calendar', 'GRID')).toBe('CALENDAR')
    expect(resolvePlanView('grid', 'CALENDAR')).toBe('GRID')
    expect(resolvePlanView('CALENDAR', undefined)).toBe('CALENDAR')
    expect(resolvePlanView(['calendar', 'grid'], 'GRID')).toBe('CALENDAR')
    expect(resolvePlanView('board', 'CALENDAR')).toBe('CALENDAR')
    expect(resolvePlanView(undefined, 'CALENDAR')).toBe('CALENDAR')
    expect(resolvePlanView(undefined, undefined)).toBe('GRID')
  })

  it('the URL keeps other params and uses the lowercase value', () => {
    expect(planViewParam('CALENDAR')).toBe('calendar')
    expect(urlWithView('http://x/projects/p/plan?task=t1', 'CALENDAR')).toBe('/projects/p/plan?task=t1&view=calendar')
    expect(urlWithView('http://x/projects/p/plan?view=calendar#a', 'GRID')).toBe('/projects/p/plan?view=grid#a')
  })
})
