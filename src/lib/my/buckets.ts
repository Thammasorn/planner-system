// src/lib/my/buckets.ts — FR-1009 buckets of /my (M9-D17). Pure; ISO strings only (no Date).
import { addWeeks, compareISO, weekStart } from '@/domain/dates'
import type { ISODate } from '@/domain/types'
import type { MyBucketKey } from '@/lib/contracts/tasks'

export const MY_BUCKETS: readonly MyBucketKey[] = ['THIS_WEEK', 'NEXT_WEEK', 'LATER', 'UNPLANNED']

/** firstWeek = earliest Monday ≥ weekStart(today) with my counted cd > 0 (null when none). A past week (defensive)
 *  counts as UNPLANNED. */
export function bucketOf(firstWeek: ISODate | null, today: ISODate): MyBucketKey {
  if (firstWeek === null) return 'UNPLANNED'
  const thisWeek = weekStart(today)
  const week = weekStart(firstWeek)
  const c = compareISO(week, thisWeek)
  if (c < 0) return 'UNPLANNED'
  if (c === 0) return 'THIS_WEEK'
  return week === addWeeks(thisWeek, 1) ? 'NEXT_WEEK' : 'LATER'
}

/** null sorts after every date. */
function compareNullableISO(a: ISODate | null, b: ISODate | null): number {
  if (a === b) return 0
  if (a === null) return 1
  if (b === null) return -1
  return compareISO(a, b)
}

function compareText(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0
}

/** Inside a bucket: firstWeek ↑, due date ↑ (nulls last), createdAt ↑, id ↑. Returns a new array. */
export function sortBucketTasks<T extends { firstWeek: ISODate | null; dueDate: ISODate | null; createdAt: string; id: string }>(
  tasks: readonly T[],
): T[] {
  return [...tasks].sort(
    (a, b) =>
      compareNullableISO(a.firstWeek, b.firstWeek) ||
      compareNullableISO(a.dueDate, b.dueDate) ||
      compareText(a.createdAt, b.createdAt) ||
      compareText(a.id, b.id),
  )
}
