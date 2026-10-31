import { describe, expect, it } from 'vitest'
import { th } from '@/i18n/th'
import { createTimeOffSchema, restoreTimeOffSchema, timeOffIdSchema, updateTimeOffSchema } from './time-off'

const leaveTypeId = '0b6c1b5e-6a51-4c4b-9e1a-2f0a8d7c3b21'
const id = '7d1b0c3a-2f4e-4b6a-9c8d-1e2f3a4b5c6d'
const base = { leaveTypeId, startDate: '2026-10-05', endDate: '2026-10-06' }

/** First issue of a failing parse as `path: message`. */
function issue(r: { success: boolean; error?: { issues: { path: PropertyKey[]; message: string }[] } }) {
  expect(r.success).toBe(false)
  const i = r.error!.issues[0]!
  return { path: i.path.join('.'), message: i.message }
}

describe('time-off schemas (FR-903, M5-D6)', () => {
  it('accepts a full-day range: half defaults to null, note stays undefined', () => {
    const v = createTimeOffSchema.parse(base)
    expect(v).toEqual({ ...base, half: null })
    expect(v.note).toBeUndefined()
    expect(v.userId).toBeUndefined()
  })

  it('half day only on a single date', () => {
    expect(issue(createTimeOffSchema.safeParse({ ...base, half: 'AM' }))).toEqual({
      path: 'half',
      message: th.timeOff.errors.halfMultiDay,
    })
    expect(createTimeOffSchema.parse({ ...base, endDate: '2026-10-05', half: 'PM' }).half).toBe('PM')
  })

  it('end before start → endBeforeStart', () => {
    expect(issue(createTimeOffSchema.safeParse({ ...base, endDate: '2026-10-04' }))).toEqual({
      path: 'endDate',
      message: th.timeOff.errors.endBeforeStart,
    })
  })

  it('at most 366 days (inclusive)', () => {
    expect(
      issue(createTimeOffSchema.safeParse({ ...base, startDate: '2026-01-01', endDate: '2027-01-02' })),
    ).toEqual({ path: 'endDate', message: th.timeOff.errors.rangeTooLong })
    expect(
      createTimeOffSchema.safeParse({ ...base, startDate: '2026-01-01', endDate: '2027-01-01' }).success,
    ).toBe(true)
  })

  it('invalid dates → invalidDate (no range issue on top)', () => {
    const r = createTimeOffSchema.safeParse({ ...base, startDate: '2026-02-30' })
    expect(issue(r)).toEqual({ path: 'startDate', message: th.timeOff.errors.invalidDate })
    expect(r.error!.issues).toHaveLength(1)
  })

  it("note: '' → null; 501 chars → noteTooLong", () => {
    expect(createTimeOffSchema.parse({ ...base, note: '' }).note).toBeNull()
    expect(createTimeOffSchema.parse({ ...base, note: '  ไปหาหมอ ' }).note).toBe('ไปหาหมอ')
    expect(issue(createTimeOffSchema.safeParse({ ...base, note: 'ก'.repeat(501) }))).toEqual({
      path: 'note',
      message: th.timeOff.errors.noteTooLong,
    })
  })

  it("leaveTypeId 'x' → typeRequired", () => {
    expect(issue(createTimeOffSchema.safeParse({ ...base, leaveTypeId: 'x' }))).toEqual({
      path: 'leaveTypeId',
      message: th.timeOff.errors.typeRequired,
    })
  })

  it('create takes an optional userId (manager on behalf of someone)', () => {
    expect(createTimeOffSchema.parse({ ...base, userId: 'u-1' }).userId).toBe('u-1')
    expect(createTimeOffSchema.safeParse({ ...base, userId: '' }).success).toBe(false)
  })

  it('update requires id; id/batch schemas are uuids', () => {
    expect(updateTimeOffSchema.safeParse(base).success).toBe(false)
    expect(updateTimeOffSchema.parse({ ...base, id })).toEqual({ ...base, id, half: null })
    expect(issue(updateTimeOffSchema.safeParse({ ...base, id, half: 'AM' })).path).toBe('half')
    expect(timeOffIdSchema.safeParse({ id: 'nope' }).success).toBe(false)
    expect(restoreTimeOffSchema.parse({ batch: id })).toEqual({ batch: id })
  })
})
