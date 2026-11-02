// src/server/services/time-off.ts — leave entries (FR-903…909, BR-42, M5-D4/D5/D6/D16; plan/m05 S0.13/S2.4).
// Authorization happens in the action (authz.requireTimeOffEdit) before these run. Writes take the per-user advisory
// lock, pre-check overlaps (ConflictError OVERLAP naming the entry) and write one audit row in the caller's
// transaction; the EXCLUDE constraint (23P01 → OVERLAP via mapDbError) is the backstop. Never touch tasks /
// assignments / allocations (BR-42). Audit before/after never carry the note.
import { randomUUID } from 'node:crypto'
import { affectedWeeks, standardWeekCd, toTimeOffSpan, weekCapacityImpact } from '@/domain/capacity'
import { addDays } from '@/domain/dates'
import type { Cd, HalfDay, ISODate } from '@/domain/types'
import { th } from '@/i18n/th'
import type {
  TimeOffDeleteResult,
  TimeOffImpact,
  TimeOffRestoreResult,
  TimeOffSaveResult,
} from '@/lib/contracts/time-off'
import type { CapacityImpactWeek } from '@/lib/contracts/capacity'
import { displayName } from '@/lib/display-name'
import { formatLeaveRange } from '@/lib/format'
import * as audit from '../audit'
import type { TimeOffRow } from '../db/schema'
import type { DbOrTx } from '../db/types'
import { ConflictError, NotFoundError, pgErrorInfo, ValidationError } from '../errors'
import * as repo from '../repo'
import type { SessionUser } from '../session'
import { loadCapacityInputs, type TimeOffSpanWithId } from './capacity'
import { overloadImpact } from './workload'

/** M9 (M9-D18): the session user (FR-906 lines are masked for them); null = a system write (seed). */
type Actor = SessionUser | null

export interface TimeOffInput {
  userId: string
  leaveTypeId: string
  startDate: ISODate
  endDate: ISODate
  half: HalfDay | null
  note: string | null
}

type Range = { startDate: ISODate; endDate: ISODate; half: HalfDay | null }

const snapshot = (r: Range & { userId: string; leaveTypeId: string }) => ({
  userId: r.userId,
  leaveTypeId: r.leaveTypeId,
  startDate: r.startDate,
  endDate: r.endDate,
  half: r.half,
})

function typeError(message: string): ValidationError {
  return new ValidationError({ leaveTypeId: [message] }, message)
}

/** The type must exist and be active — except an update that keeps the entry's current (archived) type (M5-D6). */
async function assertUsableType(tx: DbOrTx, leaveTypeId: string, keepId: string | null): Promise<void> {
  const type = await repo.leaveTypes.getLeaveType(tx, leaveTypeId)
  if (!type) throw typeError(th.timeOff.errors.typeRequired)
  if (type.archivedAt && type.id !== keepId) throw typeError(th.timeOff.errors.typeArchived)
}

/** M5-D4: the first live overlapping entry → OVERLAP naming its type and range; AM vs PM of one date gets the
 *  "แก้รายการเดิมเป็นเต็มวัน" hint (X64). */
async function assertNoOverlap(
  tx: DbOrTx,
  userId: string,
  next: Range,
  excludeIds: readonly string[],
): Promise<void> {
  const c = await repo.timeOff.findOverlap(tx, userId, next.startDate, next.endDate, excludeIds)
  if (!c) return
  const range = formatLeaveRange(c.startDate, c.endDate, c.half)
  const halfPair =
    c.half !== null &&
    next.half !== null &&
    c.startDate === c.endDate &&
    next.startDate === next.endDate &&
    c.half !== next.half
  throw new ConflictError(
    'OVERLAP',
    halfPair
      ? th.timeOff.errors.overlapHalfDay(range, c.typeName)
      : th.timeOff.errors.overlap(range, c.typeName),
  )
}

async function personName(tx: DbOrTx, userId: string): Promise<string> {
  const u = await repo.users.getUser(tx, userId)
  if (!u) throw new NotFoundError()
  return displayName(u)
}

/**
 * FR-906 (M5-D5): capacity of `userId` per affected week with the live leave before the write vs `after(before)`.
 * Must run before the write so the loader still sees the old state. `standardCd` (schedule only, BR-41/X64) feeds
 * the M9 overload lines (M9-D18).
 */
async function computeImpact(
  tx: DbOrTx,
  userId: string,
  ranges: readonly Range[],
  after: (before: readonly TimeOffSpanWithId[]) => TimeOffSpanWithId[],
): Promise<{ weeks: CapacityImpactWeek[]; standardCd: Cd }> {
  const weeks = affectedWeeks(ranges)
  const from = weeks[0]!
  const to = addDays(weeks.at(-1)!, 7)
  const inputs = await loadCapacityInputs(tx, [userId], { from, to })
  const u = inputs.users.get(userId)
  if (!u) throw new NotFoundError()
  const profile = { schedule: u.schedule, holidays: inputs.holidays, deactivatedOn: u.deactivatedOn }
  return {
    weeks: weekCapacityImpact(profile, u.timeOff, after(u.timeOff), weeks),
    standardCd: standardWeekCd(u.schedule),
  }
}

/** M9-D18 (after the write, same transaction): worsened OVER/RISK weeks + Σ DAY rows on the new leave dates.
 *  Read-only — plans are never touched (BR-42). */
async function impactOf(
  tx: DbOrTx,
  actor: Actor,
  userId: string,
  userName: string,
  cap: { weeks: CapacityImpactWeek[]; standardCd: Cd },
  range: Range,
): Promise<TimeOffImpact> {
  const before = new Map(cap.weeks.map((w) => [w.weekStart, { capacityCd: w.beforeCd, standardCd: cap.standardCd }]))
  const after = new Map(cap.weeks.map((w) => [w.weekStart, { capacityCd: w.afterCd, standardCd: cap.standardCd }]))
  const overloads = await overloadImpact(
    tx,
    actor,
    userId,
    cap.weeks.map((w) => w.weekStart),
    before,
    after,
  )
  const onTimeOffDays = await repo.allocations.sumDayRowsByDate(tx, userId, range.startDate, range.endDate)
  return { userId, userName, weeks: cap.weeks, overloads, onTimeOffDays }
}

export async function createTimeOff(
  tx: DbOrTx,
  actor: Actor,
  input: TimeOffInput,
): Promise<TimeOffSaveResult> {
  await repo.timeOff.lockUser(tx, input.userId)
  await assertUsableType(tx, input.leaveTypeId, null)
  await assertNoOverlap(tx, input.userId, input, [])
  const name = await personName(tx, input.userId)
  const cap = await computeImpact(tx, input.userId, [input], (before) => [
    ...before,
    { id: '', ...toTimeOffSpan(input) },
  ])
  const row = await repo.timeOff.insertTimeOff(tx, {
    userId: input.userId,
    leaveTypeId: input.leaveTypeId,
    startDate: input.startDate,
    endDate: input.endDate,
    half: input.half,
    note: input.note,
    createdBy: actor?.id ?? input.userId,
  })
  await audit.log(tx, actor, {
    entity: 'time_off',
    entityId: row.id,
    action: 'create',
    summary: th.audit.timeOffCreated(name, formatLeaveRange(row.startDate, row.endDate, row.half)),
    after: snapshot(row),
  })
  return { id: row.id, impact: await impactOf(tx, actor, row.userId, name, cap, row) }
}

/** `existing` = the live row the action loaded (owner fixed); impact covers the union of old and new ranges. */
export async function updateTimeOff(
  tx: DbOrTx,
  actor: Actor,
  existing: TimeOffRow,
  input: Omit<TimeOffInput, 'userId'>,
): Promise<TimeOffSaveResult> {
  await repo.timeOff.lockUser(tx, existing.userId)
  await assertUsableType(tx, input.leaveTypeId, existing.leaveTypeId)
  await assertNoOverlap(tx, existing.userId, input, [existing.id])
  const name = await personName(tx, existing.userId)
  const cap = await computeImpact(tx, existing.userId, [existing, input], (before) => [
    ...before.filter((s) => s.id !== existing.id),
    { id: existing.id, ...toTimeOffSpan(input) },
  ])
  const row = await repo.timeOff.updateRow(tx, existing.id, {
    leaveTypeId: input.leaveTypeId,
    startDate: input.startDate,
    endDate: input.endDate,
    half: input.half,
    note: input.note,
  })
  await audit.log(tx, actor, {
    entity: 'time_off',
    entityId: row.id,
    action: 'update',
    summary: th.audit.timeOffUpdated(name, formatLeaveRange(row.startDate, row.endDate, row.half)),
    before: snapshot(existing),
    after: snapshot(row),
  })
  return { id: row.id, impact: await impactOf(tx, actor, row.userId, name, cap, row) }
}

/** Soft delete under a fresh batch (FR-909, X04). */
export async function deleteTimeOff(
  tx: DbOrTx,
  actor: Actor,
  existing: TimeOffRow,
): Promise<TimeOffDeleteResult> {
  const batch = randomUUID()
  const name = await personName(tx, existing.userId)
  await repo.timeOff.softDelete(tx, existing.id, batch)
  await audit.log(tx, actor, {
    entity: 'time_off',
    entityId: existing.id,
    action: 'delete',
    summary: th.audit.timeOffDeleted(
      name,
      formatLeaveRange(existing.startDate, existing.endDate, existing.half),
    ),
    before: snapshot(existing),
  })
  return {
    batch,
    userId: existing.userId,
    startDate: existing.startDate,
    endDate: existing.endDate,
    half: existing.half,
  }
}

/** M5-D16: 30-day window (DB clock), overlap re-check under the user lock, clear deleted_at / deleted_batch. `rows`
 *  = one batch (listByBatch, non-empty), all of one owner in practice (one entry per delete). */
export async function restoreTimeOff(
  tx: DbOrTx,
  actor: Actor,
  rows: readonly TimeOffRow[],
): Promise<TimeOffRestoreResult> {
  const first = rows[0]
  if (!first?.deletedBatch) throw new NotFoundError()
  if (
    (await repo.timeOff.countExpired(
      tx,
      rows.map((r) => r.id),
    )) > 0
  ) {
    throw new ConflictError('CONFLICT', th.timeOff.errors.restoreExpired)
  }
  const overlap = () => new ConflictError('OVERLAP', th.timeOff.errors.restoreOverlap)
  const batchIds = rows.map((r) => r.id)
  for (const r of rows) {
    await repo.timeOff.lockUser(tx, r.userId)
    if (await repo.timeOff.findOverlap(tx, r.userId, r.startDate, r.endDate, batchIds)) throw overlap()
  }
  let restored: number
  try {
    restored = await repo.timeOff.restoreBatch(tx, first.deletedBatch)
  } catch (e) {
    if (pgErrorInfo(e).code === '23P01') throw overlap()
    throw e
  }
  for (const r of rows) {
    await audit.log(tx, actor, {
      entity: 'time_off',
      entityId: r.id,
      action: 'restore',
      summary: th.audit.timeOffRestored(
        await personName(tx, r.userId),
        formatLeaveRange(r.startDate, r.endDate, r.half),
      ),
      after: snapshot(r),
    })
  }
  return { restored, userId: first.userId }
}
