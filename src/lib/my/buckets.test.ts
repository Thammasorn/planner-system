// plan/m09 §5.S1.4 — FR-1009 buckets of /my (M9-D17).
import { describe, expect, it } from 'vitest'
import type { MyBucketKey } from '@/lib/contracts/tasks'
import { MY_BUCKETS, bucketOf, sortBucketTasks } from './buckets'

const TODAY = '2026-09-30'

describe('MY_BUCKETS', () => {
  it('is in display order', () => {
    expect(MY_BUCKETS).toEqual(['THIS_WEEK', 'NEXT_WEEK', 'LATER', 'UNPLANNED'])
  })
})

describe('bucketOf', () => {
  it.each<[string | null, string, MyBucketKey]>([
    ['2026-09-28', TODAY, 'THIS_WEEK'],
    ['2026-10-05', TODAY, 'NEXT_WEEK'],
    ['2026-10-12', TODAY, 'LATER'],
    [null, TODAY, 'UNPLANNED'],
    ['2026-09-21', TODAY, 'UNPLANNED'],
    ['2027-01-04', '2026-12-31', 'NEXT_WEEK'],
    ['2026-12-28', '2026-12-31', 'THIS_WEEK'],
    ['2026-10-05', '2026-10-04', 'NEXT_WEEK'],
    ['2026-10-05', '2026-10-05', 'THIS_WEEK'],
  ])('firstWeek %s, today %s → %s', (firstWeek, today, key) => {
    expect(bucketOf(firstWeek, today)).toBe(key)
  })
})

interface T {
  id: string
  firstWeek: string | null
  dueDate: string | null
  createdAt: string
}

describe('sortBucketTasks', () => {
  it('firstWeek ↑ (nulls last), due date ↑ nulls last, createdAt, id — without mutating the input', () => {
    const tasks: T[] = [
      { id: 'g', firstWeek: null, dueDate: null, createdAt: '2026-01-01T00:00:00Z' },
      { id: 'f', firstWeek: '2026-10-05', dueDate: null, createdAt: '2026-01-01T00:00:00Z' },
      { id: 'e', firstWeek: '2026-10-05', dueDate: '2026-10-09', createdAt: '2026-01-03T00:00:00Z' },
      { id: 'd', firstWeek: '2026-10-05', dueDate: '2026-10-09', createdAt: '2026-01-02T00:00:00Z' },
      { id: 'c', firstWeek: '2026-10-05', dueDate: '2026-10-08', createdAt: '2026-01-09T00:00:00Z' },
      { id: 'b', firstWeek: '2026-09-28', dueDate: null, createdAt: '2026-01-01T00:00:00Z' },
      { id: 'a2', firstWeek: '2026-09-28', dueDate: null, createdAt: '2026-01-01T00:00:00Z' },
    ]
    const before = tasks.map((t) => t.id)
    expect(sortBucketTasks(tasks).map((t) => t.id)).toEqual(['a2', 'b', 'c', 'd', 'e', 'f', 'g'])
    expect(tasks.map((t) => t.id)).toEqual(before)
  })
  it('UNPLANNED tasks (all null firstWeek) sort by due date then createdAt', () => {
    const tasks: T[] = [
      { id: 'x', firstWeek: null, dueDate: null, createdAt: '2026-01-01T00:00:00Z' },
      { id: 'y', firstWeek: null, dueDate: '2026-11-01', createdAt: '2026-01-05T00:00:00Z' },
    ]
    expect(sortBucketTasks(tasks).map((t) => t.id)).toEqual(['y', 'x'])
  })
})
