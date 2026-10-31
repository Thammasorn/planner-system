// M5 S2.5 — capacity loader (BR-10…13, BR-41, PLAN §3.10, M5-D17): the DB inputs reproduce exactly what the pure
// domain functions compute from the same raw inputs; only live leave overlapping the range is loaded.
import { describe, expect, it } from 'vitest'
import { capacityByDay, capacityByWeek, toTimeOffSpan } from '@/domain/capacity'
import type { Schedule, TimeOffSpan } from '@/domain/types'
import { makeHoliday, makeLeaveType, makeTimeOff, makeUser } from '../../../tests/helpers/factories'
import { db } from '../db/client'
import * as repo from '../repo'
import { loadCapacity, loadCapacityInputs } from './capacity'

const RANGE = { from: '2026-09-28', to: '2026-10-26' }
const MON_FRI: Schedule = { 1: 100, 2: 100, 3: 100, 4: 100, 5: 100 }

describe('services/capacity loadCapacity', () => {
  it('parity with domain: schedules, holidays, deactivation, leave starting before `from`, half day, soft-deleted ignored', async () => {
    const full = await makeUser()
    const part = await makeUser({
      schedule: [
        { weekday: 1, fraction: '1.00' },
        { weekday: 3, fraction: '0.50' },
        { weekday: 5, fraction: '1.00' },
      ],
    })
    const gone = await makeUser({ deactivated: { on: '2026-10-07' } })
    await makeHoliday({ date: '2026-10-13' })
    await makeHoliday({ date: '2026-10-23' })
    await makeHoliday({ date: '2026-10-26' }) // outside [from, to)
    const lt = await makeLeaveType()
    await makeTimeOff({ user: full, leaveType: lt, startDate: '2026-09-25', endDate: '2026-09-29' })
    await makeTimeOff({ user: part, leaveType: lt, startDate: '2026-10-14', half: 'AM' })
    await makeTimeOff({
      user: full,
      leaveType: lt,
      startDate: '2026-10-20',
      deleted: { batch: '00000000-0000-4000-8000-000000000002', daysAgo: 1 },
    })

    const cap = await loadCapacity(db, [full.id, part.id, gone.id], RANGE)
    const holidays = new Set(['2026-10-13', '2026-10-23'])
    const expectFor = (schedule: Schedule, timeOff: TimeOffSpan[], deactivatedOn: string | null) => {
      const p = { schedule, holidays, timeOff, deactivatedOn }
      return { days: capacityByDay(p, RANGE.from, RANGE.to), weeks: capacityByWeek(p, RANGE.from, RANGE.to) }
    }
    expect(cap.get(full.id)).toEqual(
      expectFor(
        MON_FRI,
        [toTimeOffSpan({ startDate: '2026-09-25', endDate: '2026-09-29', half: null })],
        null,
      ),
    )
    expect(cap.get(part.id)).toEqual(
      expectFor(
        { 1: 100, 3: 50, 5: 100 },
        [toTimeOffSpan({ startDate: '2026-10-14', endDate: '2026-10-14', half: 'AM' })],
        null,
      ),
    )
    expect(cap.get(gone.id)).toEqual(expectFor(MON_FRI, [], '2026-10-07'))
    // Spot checks against hand-computed numbers.
    expect(cap.get(full.id)?.weeks['2026-09-28']).toEqual({ capacityCd: 300, standardCd: 500 })
    expect(cap.get(full.id)?.weeks['2026-10-19']).toEqual({ capacityCd: 400, standardCd: 500 })
    expect(cap.get(part.id)?.days['2026-10-14']).toEqual({ capacityCd: 0, standardCd: 50 })
    expect(cap.get(gone.id)?.weeks['2026-10-05']).toEqual({ capacityCd: 200, standardCd: 500 })
    expect(Object.keys(cap.get(full.id)!.days)).toHaveLength(28)
    expect(Object.keys(cap.get(full.id)!.weeks)).toEqual([
      '2026-09-28',
      '2026-10-05',
      '2026-10-12',
      '2026-10-19',
    ])
  })

  it('range filter: leave entirely outside the range is not loaded; inputs keep entry ids', async () => {
    const u = await makeUser()
    const lt = await makeLeaveType()
    await makeTimeOff({ user: u, leaveType: lt, startDate: '2026-09-21', endDate: '2026-09-27' })
    const inside = await makeTimeOff({
      user: u,
      leaveType: lt,
      startDate: '2026-10-24',
      endDate: '2026-10-25',
    })
    await makeTimeOff({ user: u, leaveType: lt, startDate: '2026-10-26' }) // starts on `to` (exclusive)
    const inputs = await loadCapacityInputs(db, [u.id], RANGE)
    expect(inputs.users.get(u.id)?.timeOff).toEqual([
      { id: inside.id, startDate: '2026-10-24', endDate: '2026-10-25', fractionCd: 100 },
    ])
  })

  it('a user without schedule rows → 0 capacity and 0 standard; unknown ids are absent', async () => {
    const none = await makeUser({ schedule: [] })
    const cap = await loadCapacity(db, [none.id, 'no-such-user'], RANGE)
    expect([...cap.keys()]).toEqual([none.id])
    for (const v of Object.values(cap.get(none.id)!.weeks))
      expect(v).toEqual({ capacityCd: 0, standardCd: 0 })
    expect(await loadCapacity(db, [], RANGE)).toEqual(new Map())
  })

  it('rejects ranges that are not Monday-aligned or empty (internal RangeError)', async () => {
    await expect(loadCapacity(db, [], { from: '2026-09-29', to: '2026-10-26' })).rejects.toThrow(RangeError)
    await expect(loadCapacity(db, [], { from: '2026-09-28', to: '2026-09-28' })).rejects.toThrow(RangeError)
  })

  it('repo.users.listSchedules / listDeactivatedOn convert numeric(3,2) to cd at the repo boundary (BR-02, X02)', async () => {
    const part = await makeUser({
      schedule: [
        { weekday: 2, fraction: '0.25' },
        { weekday: 4, fraction: '1.00' },
      ],
    })
    const none = await makeUser({ schedule: [] })
    const gone = await makeUser({ deactivated: { on: '2026-10-07' } })
    const schedules = await repo.users.listSchedules(db, [part.id, none.id, 'no-such-user'])
    expect(schedules.get(part.id)).toEqual({ 2: 25, 4: 100 })
    expect(schedules.has(none.id)).toBe(false)
    expect(schedules.has('no-such-user')).toBe(false)
    const deactivated = await repo.users.listDeactivatedOn(db, [part.id, gone.id, 'no-such-user'])
    expect(deactivated).toEqual(
      new Map([
        [part.id, null],
        [gone.id, '2026-10-07'],
      ]),
    )
    expect(await repo.users.listSchedules(db, [])).toEqual(new Map())
    expect(await repo.users.listDeactivatedOn(db, [])).toEqual(new Map())
  })
})
