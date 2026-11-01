// M7 S2.3 — services/day-context.ts (M7-D19, M7-D25, C18): the DayCtx both the grid and save use.
import { describe, expect, it } from 'vitest'
import { applyFixture, seedGolden } from '../../../scripts/lib/fixtures'
import { goldenUser } from '../../../tests/authz/_support/golden'
import { db } from '../db/client'
import { loadDayCtx, loadDayData } from './day-context'

describe('loadDayCtx / loadDayData', () => {
  it('F3 Peter week 10-05 → dayCaps [0,0,100,100,100,0,0], schedule 100×5, timeOff Mon/Tue', async () => {
    await seedGolden(db)
    await applyFixture(db, 'F3')
    const peter = (await goldenUser('Peter')).id
    const ctx = (await loadDayCtx(db, [peter], ['2026-10-05'])).get(peter)!.get('2026-10-05')!
    expect(ctx).toEqual({
      week: '2026-10-05',
      dayCaps: [0, 0, 100, 100, 100, 0, 0],
      schedule: [100, 100, 100, 100, 100, 0, 0],
      timeOff: [true, true, false, false, false, false, false],
    })
    const data = (await loadDayData(db, [peter], ['2026-10-05'])).get(peter)!
    expect(data.capacity).toEqual({ 'D:2026-10-07': 100, 'D:2026-10-08': 100, 'D:2026-10-09': 100 })
    expect(Object.keys(data.standard)).toHaveLength(5)
    expect(data.timeOff.map((t) => [t.start, t.end])).toEqual([['2026-10-05', '2026-10-06']])
  })

  it('unknown users → zero contexts; no weeks → empty map', async () => {
    await seedGolden(db)
    const id = '00000000-0000-4000-8000-000000000000'
    expect((await loadDayCtx(db, [id], ['2026-10-05'])).get(id)!.get('2026-10-05')).toEqual({
      week: '2026-10-05',
      dayCaps: [0, 0, 0, 0, 0, 0, 0],
      schedule: [0, 0, 0, 0, 0, 0, 0],
      timeOff: [false, false, false, false, false, false, false],
    })
    expect(await loadDayCtx(db, [id], [])).toEqual(new Map())
  })
})
