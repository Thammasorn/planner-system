// src/server/repo/holidays.ts — holiday queries (FR-901, plan/m05 S0.12/S2.2). Dates are ISODate strings
// (date mode 'string'); ranges are [from, to).
import { and, asc, eq, gte, inArray, lt } from 'drizzle-orm'
import type { ISODate } from '@/domain/types'
import type { DbOrTx } from '../db/types'
import { holidays, type HolidayRow } from '../db/schema'
import { NotFoundError } from '../errors'

export type { HolidayRow } from '../db/schema'

/** `id` only for undo re-inserts (restoreHoliday keeps the same id, X64). */
export async function insertHoliday(
  tx: DbOrTx,
  v: { id?: string; date: ISODate; name: string },
): Promise<HolidayRow> {
  const rows = await tx.insert(holidays).values(v).returning()
  const [row] = rows
  if (!row) throw new Error('insert failed')
  return row
}

/** Every holiday, by date. */
export function listAll(tx: DbOrTx): Promise<HolidayRow[]> {
  return tx.select().from(holidays).orderBy(asc(holidays.date))
}

/** from ≤ date < toExclusive, by date. */
export function listInRange(tx: DbOrTx, from: ISODate, toExclusive: ISODate): Promise<HolidayRow[]> {
  return tx
    .select()
    .from(holidays)
    .where(and(gte(holidays.date, from), lt(holidays.date, toExclusive)))
    .orderBy(asc(holidays.date))
}

export async function getHoliday(tx: DbOrTx, id: string): Promise<HolidayRow | null> {
  const [row] = await tx.select().from(holidays).where(eq(holidays.id, id))
  return row ?? null
}

export async function getOrNotFound(tx: DbOrTx, id: string): Promise<HolidayRow> {
  const row = await getHoliday(tx, id)
  if (!row) throw new NotFoundError()
  return row
}

/** Rows whose date is one of `dates` (any order). */
export function findByDates(tx: DbOrTx, dates: readonly ISODate[]): Promise<HolidayRow[]> {
  if (dates.length === 0) return Promise.resolve([])
  return tx
    .select()
    .from(holidays)
    .where(inArray(holidays.date, [...dates]))
}

export async function updateHolidayRow(
  tx: DbOrTx,
  id: string,
  v: { date: ISODate; name: string },
): Promise<HolidayRow | null> {
  const [row] = await tx.update(holidays).set(v).where(eq(holidays.id, id)).returning()
  return row ?? null
}

/** CSV import: rename the holiday on `date`. */
export async function renameByDate(tx: DbOrTx, date: ISODate, name: string): Promise<void> {
  await tx.update(holidays).set({ name }).where(eq(holidays.date, date))
}

/** Bulk insert of new dates (CSV import). */
export async function insertMany(
  tx: DbOrTx,
  rows: readonly { date: ISODate; name: string }[],
): Promise<void> {
  if (rows.length === 0) return
  await tx.insert(holidays).values([...rows])
}

/** Hard delete; the deleted row or null when it did not exist. */
export async function deleteHolidayRow(tx: DbOrTx, id: string): Promise<HolidayRow | null> {
  const [row] = await tx.delete(holidays).where(eq(holidays.id, id)).returning()
  return row ?? null
}
