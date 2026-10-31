// src/server/services/holidays.ts — company holidays (FR-901, M5-D2/D11, X64; plan/m05 S0.13/S2.2). Services write
// their audit row as the last statement in the caller's transaction (actor null from scripts). Callers authorize
// (actions: authz.requireManager); reads are open to every logged-in user (M5-D15).
import { randomUUID } from 'node:crypto'
import type { ISODate } from '@/domain/types'
import { th } from '@/i18n/th'
import type { CalendarHoliday } from '@/lib/contracts/calendar'
import type { DeletedHoliday, HolidayDTO, HolidayImportResult } from '@/lib/contracts/holidays'
import {
  importHolidaysSchema,
  type createHolidaySchema,
  type updateHolidaySchema,
} from '@/lib/schemas/holidays'
import type { z } from '@/lib/z'
import * as audit from '../audit'
import type { HolidayRow } from '../db/schema'
import type { DbOrTx } from '../db/types'
import { ConflictError, NotFoundError, pgErrorInfo, ValidationError } from '../errors'
import * as repo from '../repo'
import type { DateRange } from './capacity'

type Actor = { id: string } | null

const toDTO = (r: HolidayRow): HolidayDTO => ({ id: r.id, date: r.date, name: r.name })

function dateTaken(): ConflictError {
  const msg = th.holidays.errors.dateTaken
  return new ConflictError('CONFLICT', msg, { fieldErrors: { date: [msg] } })
}

/** 23505 (holidays_date_unique or the pkey) — the pre-checks normally catch it first; kept as the race backstop. */
const isUnique = (e: unknown): boolean => pgErrorInfo(e).code === '23505'

async function dateUsedByOther(tx: DbOrTx, date: ISODate, selfId: string | null): Promise<boolean> {
  const [hit] = await repo.holidays.findByDates(tx, [date])
  return hit !== undefined && hit.id !== selfId
}

/** All holidays by date. */
export async function listHolidays(tx: DbOrTx): Promise<HolidayDTO[]> {
  return (await repo.holidays.listAll(tx)).map(toDTO)
}

/** Holidays with from ≤ date < to, by date. */
export async function listHolidaysInRange(tx: DbOrTx, range: DateRange): Promise<CalendarHoliday[]> {
  return (await repo.holidays.listInRange(tx, range.from, range.to)).map((r) => ({
    date: r.date,
    name: r.name,
  }))
}

export async function createHoliday(
  tx: DbOrTx,
  actor: Actor,
  input: z.output<typeof createHolidaySchema>,
): Promise<HolidayDTO> {
  if (await dateUsedByOther(tx, input.date, null)) throw dateTaken()
  let row: HolidayRow
  try {
    row = await repo.holidays.insertHoliday(tx, { date: input.date, name: input.name })
  } catch (e) {
    if (isUnique(e)) throw dateTaken()
    throw e
  }
  await audit.log(tx, actor, {
    entity: 'holiday',
    entityId: row.id,
    action: 'create',
    summary: th.audit.holidayCreated(row.date, row.name),
    after: { date: row.date, name: row.name },
  })
  return toDTO(row)
}

export async function updateHoliday(
  tx: DbOrTx,
  actor: Actor,
  input: z.output<typeof updateHolidaySchema>,
): Promise<HolidayDTO> {
  const cur = await repo.holidays.getOrNotFound(tx, input.id)
  if (await dateUsedByOther(tx, input.date, cur.id)) throw dateTaken()
  let row: HolidayRow | null
  try {
    row = await repo.holidays.updateHolidayRow(tx, cur.id, { date: input.date, name: input.name })
  } catch (e) {
    if (isUnique(e)) throw dateTaken()
    throw e
  }
  if (!row) throw new NotFoundError()
  await audit.log(tx, actor, {
    entity: 'holiday',
    entityId: row.id,
    action: 'update',
    summary: th.audit.holidayUpdated(row.date, row.name),
    before: { date: cur.date, name: cur.name },
    after: { date: row.date, name: row.name },
  })
  return toDTO(row)
}

/** Hard delete; the returned snapshot is the undo input (X64). */
export async function deleteHoliday(tx: DbOrTx, actor: Actor, id: string): Promise<DeletedHoliday> {
  const row = await repo.holidays.deleteHolidayRow(tx, id)
  if (!row) throw new NotFoundError()
  await audit.log(tx, actor, {
    entity: 'holiday',
    entityId: row.id,
    action: 'delete',
    summary: th.audit.holidayDeleted(row.date, row.name),
    before: { date: row.date, name: row.name },
  })
  return toDTO(row)
}

/** Re-insert the same id; a holiday on that date (or that id) since → CONFLICT th.holidays.errors.restoreConflict. */
export async function restoreHoliday(tx: DbOrTx, actor: Actor, input: DeletedHoliday): Promise<HolidayDTO> {
  const conflict = () => new ConflictError('CONFLICT', th.holidays.errors.restoreConflict)
  if ((await repo.holidays.getHoliday(tx, input.id)) || (await dateUsedByOther(tx, input.date, null))) {
    throw conflict()
  }
  let row: HolidayRow
  try {
    row = await repo.holidays.insertHoliday(tx, { id: input.id, date: input.date, name: input.name })
  } catch (e) {
    if (isUnique(e)) throw conflict()
    throw e
  }
  await audit.log(tx, actor, {
    entity: 'holiday',
    entityId: row.id,
    action: 'restore',
    summary: th.audit.holidayRestored(row.date, row.name),
    after: { date: row.date, name: row.name },
  })
  return toDTO(row)
}

/**
 * M5-D11: upsert by date in the caller's transaction with one audit row (entityId = a server-generated import id).
 * The rows are re-validated here with the action's schema (≤ 500, ISO dates, unique dates, names 1–200, NFC), so the
 * script path (`pnpm import:holidays`) is as safe as the UI; any failure writes nothing.
 */
export async function importHolidays(
  tx: DbOrTx,
  actor: Actor,
  rows: readonly { date: ISODate; name: string }[],
): Promise<HolidayImportResult> {
  const parsed = importHolidaysSchema.safeParse({ rows })
  if (!parsed.success) {
    const err = ValidationError.fromZod(parsed.error)
    throw new ValidationError(err.extra.fieldErrors ?? {}, parsed.error.issues[0]?.message)
  }
  const input = parsed.data.rows
  const existing = new Map(
    (
      await repo.holidays.findByDates(
        tx,
        input.map((r) => r.date),
      )
    ).map((h) => [h.date, h.name]),
  )
  const fresh = input.filter((r) => !existing.has(r.date))
  const renamed = input.filter((r) => existing.has(r.date) && existing.get(r.date) !== r.name)
  const unchanged = input.length - fresh.length - renamed.length
  try {
    await repo.holidays.insertMany(tx, fresh)
  } catch (e) {
    if (isUnique(e)) throw dateTaken() // a concurrent insert took one of the dates
    throw e
  }
  for (const r of renamed) await repo.holidays.renameByDate(tx, r.date, r.name)
  const result: HolidayImportResult = { inserted: fresh.length, updated: renamed.length, unchanged }
  await audit.log(tx, actor, {
    entity: 'holiday',
    entityId: randomUUID(),
    action: 'create',
    summary: th.audit.holidaysImported(result.inserted, result.updated),
    after: {
      inserted: result.inserted,
      updated: result.updated,
      dates: [...fresh, ...renamed].map((r) => r.date).sort(),
    },
  })
  return result
}
