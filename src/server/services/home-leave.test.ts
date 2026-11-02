// M10 S1.4 — the pure split of leave entries into the home's three lines (FR-1101d, M10-D16, X68).
import { describe, expect, it } from 'vitest'
import type { ISODate } from '@/domain/types'
import type { HomeLeaveEntry } from '@/lib/contracts/home'
import { splitLeaveLines } from './home-leave'

const TODAY: ISODate = '2026-09-30'
const WS: ISODate = '2026-09-28'

const entry = (name: string, startDate: ISODate, endDate: ISODate = startDate): HomeLeaveEntry => ({
  userId: `u-${name}`,
  name,
  entry: { kind: 'masked', userId: `u-${name}`, startDate, endDate, half: null, label: 'x' },
})
const names = (xs: readonly HomeLeaveEntry[]) => xs.map((x) => x.name)

describe('splitLeaveLines (M10-D16)', () => {
  it('assigns each entry to today / this week / next week', () => {
    const r = splitLeaveLines(
      [
        entry('today', '2026-09-30'),
        entry('early', '2026-09-28', '2026-09-29'),
        entry('fri', '2026-10-02'),
        entry('next', '2026-10-05', '2026-10-06'),
        entry('span', '2026-09-25', '2026-10-06'),
        entry('later', '2026-10-12'),
      ],
      TODAY,
      WS,
    )
    expect(names(r.today)).toEqual(['span', 'today'])
    expect(names(r.thisWeek)).toEqual(['early', 'fri'])
    expect(names(r.nextWeek)).toEqual(['span', 'next'])
  })

  it('09-30 → today only; 10-12 → nowhere', () => {
    expect(splitLeaveLines([entry('a', '2026-09-30')], TODAY, WS)).toEqual({
      today: [entry('a', '2026-09-30')],
      thisWeek: [],
      nextWeek: [],
    })
    expect(splitLeaveLines([entry('a', '2026-10-12')], TODAY, WS)).toEqual({ today: [], thisWeek: [], nextWeek: [] })
  })

  it('empty → three empty lines', () => {
    expect(splitLeaveLines([], TODAY, WS)).toEqual({ today: [], thisWeek: [], nextWeek: [] })
  })

  it('each line sorted by start date, then name (Thai collation)', () => {
    const r = splitLeaveLines(
      [entry('ข', '2026-10-06'), entry('ก', '2026-10-06'), entry('ค', '2026-10-05')],
      TODAY,
      WS,
    )
    expect(names(r.nextWeek)).toEqual(['ค', 'ก', 'ข'])
  })
})
