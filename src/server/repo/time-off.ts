// src/server/repo/time-off.ts — leave entry queries (FR-903…909, plan/m05 S0.12/S2.4). Every read filters
// deleted_at unless it restores a batch. Ranges are [from, to) on ISODate strings; an entry overlaps [from, to) when
// start_date < to and end_date >= from (index time_off_user_id_start_date_end_date_idx, partial on live rows).
import { and, asc, eq, gte, inArray, isNotNull, isNull, lt, notInArray, sql } from 'drizzle-orm'
import type { HalfDay, ISODate } from '@/domain/types'
import type { DbOrTx } from '../db/types'
import { leaveTypes, timeOff, type TimeOffRow } from '../db/schema'
import { NotFoundError } from '../errors'

export type { TimeOffRow } from '../db/schema'

/** A live row unless `deletedAt`/`deletedBatch` are given (fixtures). The EXCLUDE constraint rejects overlaps (23P01). */
export async function insertTimeOff(
  tx: DbOrTx,
  v: {
    userId: string
    leaveTypeId: string
    startDate: ISODate
    endDate: ISODate
    half: HalfDay | null
    note: string | null
    createdBy: string
    deletedAt?: Date | null
    deletedBatch?: string | null
  },
): Promise<TimeOffRow> {
  const rows = await tx.insert(timeOff).values(v).returning()
  const [row] = rows
  if (!row) throw new Error('insert failed')
  return row
}

/** The live entry `id`, or NotFoundError (also for soft-deleted ones). */
export async function getLiveOrNotFound(tx: DbOrTx, id: string): Promise<TimeOffRow> {
  const [row] = await tx
    .select()
    .from(timeOff)
    .where(and(eq(timeOff.id, id), isNull(timeOff.deletedAt)))
  if (!row) throw new NotFoundError()
  return row
}

/** Soft-deleted rows of one batch (restore input), by id. */
export function listByBatch(tx: DbOrTx, batch: string): Promise<TimeOffRow[]> {
  return tx
    .select()
    .from(timeOff)
    .where(and(eq(timeOff.deletedBatch, batch), isNotNull(timeOff.deletedAt)))
    .orderBy(asc(timeOff.id))
}

/** M5-D4: serialises leave writes of one person until the transaction ends (race-free overlap pre-check). */
export async function lockUser(tx: DbOrTx, userId: string): Promise<void> {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${'time_off:' + userId}))`)
}

export interface OverlapHit {
  id: string
  startDate: ISODate
  endDate: ISODate
  half: HalfDay | null
  typeName: string
}

/** The first live entry of `userId` whose [start, end] intersects [start, end] (excluding `excludeIds`), or null. */
export async function findOverlap(
  tx: DbOrTx,
  userId: string,
  start: ISODate,
  end: ISODate,
  excludeIds: readonly string[],
): Promise<OverlapHit | null> {
  const [row] = await tx
    .select({
      id: timeOff.id,
      startDate: timeOff.startDate,
      endDate: timeOff.endDate,
      half: timeOff.half,
      typeName: leaveTypes.name,
    })
    .from(timeOff)
    .innerJoin(leaveTypes, eq(leaveTypes.id, timeOff.leaveTypeId))
    .where(
      and(
        eq(timeOff.userId, userId),
        isNull(timeOff.deletedAt),
        excludeIds.length > 0 ? notInArray(timeOff.id, [...excludeIds]) : undefined,
        sql`daterange(${timeOff.startDate}, ${timeOff.endDate}, '[]') && daterange(${start}::date, ${end}::date, '[]')`,
      ),
    )
    .orderBy(asc(timeOff.startDate), asc(timeOff.id))
    .limit(1)
  return row ?? null
}

export interface TimeOffSpanRow {
  id: string
  userId: string
  startDate: ISODate
  endDate: ISODate
  half: HalfDay | null
}

/** Live entries of `userIds` overlapping [from, toExclusive), by user, start, id. */
export function listSpans(
  tx: DbOrTx,
  userIds: readonly string[],
  from: ISODate,
  toExclusive: ISODate,
): Promise<TimeOffSpanRow[]> {
  if (userIds.length === 0) return Promise.resolve([])
  return tx
    .select({
      id: timeOff.id,
      userId: timeOff.userId,
      startDate: timeOff.startDate,
      endDate: timeOff.endDate,
      half: timeOff.half,
    })
    .from(timeOff)
    .where(
      and(
        inArray(timeOff.userId, [...userIds]),
        isNull(timeOff.deletedAt),
        lt(timeOff.startDate, toExclusive),
        gte(timeOff.endDate, from),
      ),
    )
    .orderBy(asc(timeOff.userId), asc(timeOff.startDate), asc(timeOff.id))
}

export async function updateRow(
  tx: DbOrTx,
  id: string,
  v: Pick<TimeOffRow, 'leaveTypeId' | 'startDate' | 'endDate' | 'half' | 'note'>,
): Promise<TimeOffRow> {
  const [row] = await tx.update(timeOff).set(v).where(eq(timeOff.id, id)).returning()
  if (!row) throw new NotFoundError()
  return row
}

/** FR-909: soft delete under `batch` (deleted_at = now()). */
export async function softDelete(tx: DbOrTx, id: string, batch: string): Promise<void> {
  await tx
    .update(timeOff)
    .set({ deletedAt: sql`now()`, deletedBatch: batch })
    .where(and(eq(timeOff.id, id), isNull(timeOff.deletedAt)))
}

/** Rows of `ids` deleted at least 30 days ago (restore window on DB timestamps, M3-D12 / M5-D16). */
export async function countExpired(tx: DbOrTx, ids: readonly string[]): Promise<number> {
  if (ids.length === 0) return 0
  const [row] = await tx
    .select({ n: sql<number>`count(*)::int` })
    .from(timeOff)
    .where(and(inArray(timeOff.id, [...ids]), sql`${timeOff.deletedAt} <= now() - interval '30 days'`))
  return row?.n ?? 0
}

/** Clears deleted_at / deleted_batch of every row in `batch`; returns the number restored. */
export async function restoreBatch(tx: DbOrTx, batch: string): Promise<number> {
  const rows = await tx
    .update(timeOff)
    .set({ deletedAt: null, deletedBatch: null })
    .where(and(eq(timeOff.deletedBatch, batch), isNotNull(timeOff.deletedAt)))
    .returning({ id: timeOff.id })
  return rows.length
}

export interface CalendarTimeOffRow {
  id: string
  userId: string
  startDate: ISODate
  endDate: ISODate
  half: HalfDay | null
  note: string | null
  leaveTypeId: string
  leaveTypeName: string
  leaveTypeColor: string
  leaveTypeArchived: boolean
}

/** Live entries overlapping [from, toExclusive) with their type, for `userIds` (null = every user), by start, user,
 *  id. The caller (services/calendar) passes only visibleUserIds(viewer) and masks before serialising. */
export async function listForCalendar(
  tx: DbOrTx,
  userIds: readonly string[] | null,
  from: ISODate,
  toExclusive: ISODate,
): Promise<CalendarTimeOffRow[]> {
  if (userIds !== null && userIds.length === 0) return []
  return tx
    .select({
      id: timeOff.id,
      userId: timeOff.userId,
      startDate: timeOff.startDate,
      endDate: timeOff.endDate,
      half: timeOff.half,
      note: timeOff.note,
      leaveTypeId: leaveTypes.id,
      leaveTypeName: leaveTypes.name,
      leaveTypeColor: leaveTypes.color,
      leaveTypeArchived: sql<boolean>`(${leaveTypes.archivedAt} is not null)`,
    })
    .from(timeOff)
    .innerJoin(leaveTypes, eq(leaveTypes.id, timeOff.leaveTypeId))
    .where(
      and(
        userIds === null ? undefined : inArray(timeOff.userId, [...userIds]),
        isNull(timeOff.deletedAt),
        lt(timeOff.startDate, toExclusive),
        gte(timeOff.endDate, from),
      ),
    )
    .orderBy(asc(timeOff.startDate), asc(timeOff.userId), asc(timeOff.id))
}
