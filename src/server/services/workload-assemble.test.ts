// M9 S2.2 — pure workload cell assembly (assembleCells): every (user, week) present, Σ parts, BR-40 level, X67 excess,
// BR-41 cause, M9-D8 masked parts. No DB.
import { describe, expect, it } from 'vitest'
import type { ISODate, LoadPair } from '@/domain/types'
import type { UserCapacity } from '@/lib/contracts/capacity'
import { assembleCells } from './workload'

const W1: ISODate = '2026-10-05'
const W2: ISODate = '2026-10-12'

const cap = (weeks: Record<ISODate, [number, number]>): UserCapacity => ({
  days: {},
  weeks: Object.fromEntries(Object.entries(weeks).map(([w, [c, s]]) => [w, { capacityCd: c, standardCd: s }])),
})
const loads = (byProject: Record<string, Record<ISODate, LoadPair>>) => new Map(Object.entries(byProject))

describe('assembleCells', () => {
  it('Σ parts, level/excess/cause, masked parts, empty weeks and unknown capacity included', () => {
    const out = assembleCells({
      weeks: [W1, W2],
      userIds: ['u', 'v'],
      loads: new Map([
        [
          'u',
          loads({
            P: { [W1]: { total: 300, committed: 300 } },
            Q: { [W1]: { total: 200, committed: 100 } },
          }),
        ],
      ]),
      capacity: new Map([['u', cap({ [W1]: [300, 500], [W2]: [500, 500] })]]),
      visibleProjects: new Set(['P']),
      projectNames: new Map([['P', 'Project P']]),
    })
    expect(out.get('u')![W1]).toEqual({
      total: 500,
      committed: 400,
      capacity: 300,
      standard: 500,
      level: 'OVER',
      excess: 100,
      cause: 'CAPACITY',
      byProject: [
        { projectId: 'P', total: 300, committed: 300 },
        { projectId: null, total: 200, committed: 100 },
      ],
    })
    expect(out.get('u')![W2]).toEqual({
      total: 0,
      committed: 0,
      capacity: 500,
      standard: 500,
      level: 'OK',
      excess: 0,
      cause: null,
      byProject: [],
    })
    // a user without capacity rows: cap 0 / std 0
    expect(out.get('v')![W1]).toMatchObject({ total: 0, capacity: 0, standard: 0, level: 'OK' })
  })

  it('RISK on tentative load above capacity: excess = total − cap, cause WORKLOAD', () => {
    const out = assembleCells({
      weeks: [W1],
      userIds: ['u'],
      loads: new Map([['u', loads({ P: { [W1]: { total: 600, committed: 400 } } })]]),
      capacity: new Map([['u', cap({ [W1]: [500, 500] })]]),
      visibleProjects: 'ALL',
    })
    expect(out.get('u')![W1]).toMatchObject({ level: 'RISK', excess: 100, cause: 'WORKLOAD' })
  })
})
