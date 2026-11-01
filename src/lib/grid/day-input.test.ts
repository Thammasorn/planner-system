// plan/m07 S3.6 — typing on day cells (FR-804, BR-26/27, M7-D12, X65).
import { describe, expect, it } from 'vitest'
import type { TargetCell } from './apply'
import { dayCapacityKey, parseDayInput, writeFor } from './day-input'

describe('parseDayInput', () => {
  const days = (raw: string, dayCapCd = 100) => parseDayInput(raw, { unit: 'DAYS', dayCapCd })
  it('days', () => {
    expect(days('1')).toEqual({ kind: 'value', cd: 100 })
    expect(days('0.5')).toEqual({ kind: 'value', cd: 50 })
    expect(days(',5')).toEqual({ kind: 'value', cd: 50 })
    expect(days('๐.๕')).toEqual({ kind: 'value', cd: 50 })
    expect(days('0')).toEqual({ kind: 'clear' })
    expect(days('')).toEqual({ kind: 'clear' })
  })
  it('> 1.00 → invalid MAX', () => {
    expect(days('1.25')).toEqual({ kind: 'invalid', reason: 'MAX' })
    expect(days('3')).toEqual({ kind: 'invalid', reason: 'MAX' })
  })
  it('FRACTION uses the day capacity; cap 0 → days', () => {
    expect(parseDayInput('0.5', { unit: 'FRACTION', dayCapCd: 50 })).toEqual({ kind: 'value', cd: 25 })
    expect(parseDayInput('0.5', { unit: 'FRACTION', dayCapCd: 0 })).toEqual({ kind: 'value', cd: 50 })
  })
})

describe('dayCapacityKey', () => {
  it('f = exact day capacity, h = half rounded to 25 (X65), cap 0 → null', () => {
    expect(dayCapacityKey('f', 50)).toBe(50)
    expect(dayCapacityKey('f', 100)).toBe(100)
    expect(dayCapacityKey('h', 100)).toBe(50)
    expect(dayCapacityKey('h', 75)).toBe(50)
    expect(dayCapacityKey('h', 50)).toBe(25)
    expect(dayCapacityKey('f', 0)).toBeNull()
    expect(dayCapacityKey('h', 0)).toBeNull()
  })
})

describe('writeFor', () => {
  const base: TargetCell = {
    rowKey: 'a:ta',
    taskAssignmentId: 'ta',
    week: '2026-09-28',
    editability: 'ok',
    capCd: 100,
  }
  it('D target → DAY on its date', () => {
    expect(writeFor({ ...base, granularity: 'DAY', date: '2026-09-30' }, 100)).toEqual({
      taskAssignmentId: 'ta',
      granularity: 'DAY',
      period: '2026-09-30',
      cd: 100,
    })
  })
  it('week / รวม target → WEEK on its Monday', () => {
    expect(writeFor(base, 300)).toEqual({ taskAssignmentId: 'ta', granularity: 'WEEK', period: '2026-09-28', cd: 300 })
    expect(writeFor({ ...base, granularity: 'WEEK' }, null).cd).toBeNull()
  })
  it('0 → null (delete)', () => {
    expect(writeFor({ ...base, granularity: 'DAY', date: '2026-09-30' }, 0).cd).toBeNull()
  })
  it('a task-row target throws (callers check editability first)', () => {
    expect(() => writeFor({ ...base, taskAssignmentId: null }, 1)).toThrow()
  })
})
