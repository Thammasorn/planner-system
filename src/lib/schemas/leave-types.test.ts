import { describe, expect, it } from 'vitest'
import { th } from '@/i18n/th'
import {
  createLeaveTypeSchema,
  moveLeaveTypeSchema,
  restoreLeaveTypeSchema,
  setLeaveTypeArchivedSchema,
  updateLeaveTypeSchema,
} from './leave-types'

const id = '0b6c1b5e-6a51-4c4b-9e1a-2f0a8d7c3b21'

describe('leave type schemas (FR-902, M5-D10)', () => {
  it('colour is upper-cased; name trimmed, 1–60 chars', () => {
    expect(createLeaveTypeSchema.parse({ name: ' ลาบวช ', color: '#0369a1' })).toEqual({
      name: 'ลาบวช',
      color: '#0369A1',
    })
    expect(
      createLeaveTypeSchema.safeParse({ name: 'ก'.repeat(61), color: '#0369A1' }).error?.issues[0]?.message,
    ).toBe(th.leaveTypes.errors.nameTooLong)
    expect(createLeaveTypeSchema.safeParse({ name: '  ', color: '#0369A1' }).error?.issues[0]?.message).toBe(
      th.leaveTypes.errors.nameRequired,
    )
    expect(createLeaveTypeSchema.safeParse({ name: 'x', color: 'red' }).success).toBe(false)
  })

  it('update fields are optional; move / archive shapes', () => {
    expect(updateLeaveTypeSchema.parse({ id })).toEqual({ id })
    expect(updateLeaveTypeSchema.parse({ id, color: '#b91c1c' }).color).toBe('#B91C1C')
    expect(moveLeaveTypeSchema.safeParse({ id, direction: 'left' }).success).toBe(false)
    expect(setLeaveTypeArchivedSchema.parse({ id, archived: true })).toEqual({ id, archived: true })
  })

  it('restore takes the deleted snapshot back', () => {
    const snap = { id, name: 'ลาบวช', color: '#7E22CE', position: 'a0', archivedAt: null }
    expect(restoreLeaveTypeSchema.parse(snap)).toEqual(snap)
    expect(
      restoreLeaveTypeSchema.parse({ ...snap, archivedAt: '2026-10-01T09:00:00+07:00' }).archivedAt,
    ).toBe('2026-10-01T09:00:00+07:00')
    expect(restoreLeaveTypeSchema.safeParse({ ...snap, position: 'a0; drop' }).success).toBe(false)
  })
})
