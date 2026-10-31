'use server'
// src/server/actions/time-off.ts — record / edit / delete / restore leave (§3.2 PERM-20/21, FR-903…909, M5-D3/D16).
// Shape: zod (wrapper) → (entry lookup) → authz.requireTimeOffEdit(owner) → service in one tx (audit inside the
// service, M5-D2). No refresh(): the calendar is TanStack; the client invalidates (invalidateCalendar).
import type { TimeOffDeleteResult, TimeOffRestoreResult, TimeOffSaveResult } from '@/lib/contracts/time-off'
import {
  createTimeOffSchema,
  restoreTimeOffSchema,
  timeOffIdSchema,
  updateTimeOffSchema,
} from '@/lib/schemas/time-off'
import { action } from '../action'
import * as authz from '../authz'
import { db } from '../db/client'
import { NotFoundError } from '../errors'
import * as repo from '../repo'
import * as services from '../services'

/** `userId` omitted = own leave; another person's → manager only (404 when not visible, M5-D3). */
export const createTimeOff = action(createTimeOffSchema, (input, { user }): Promise<TimeOffSaveResult> =>
  db.transaction(async (tx) => {
    const userId = input.userId ?? user.id
    await authz.requireTimeOffEdit(tx, user, userId)
    return services.timeOff.createTimeOff(tx, user, {
      userId,
      leaveTypeId: input.leaveTypeId,
      startDate: input.startDate,
      endDate: input.endDate,
      half: input.half,
      note: input.note ?? null,
    })
  }),
)

/** The owner never changes; past entries are editable by the owner and the manager (X64, audited). */
export const updateTimeOff = action(updateTimeOffSchema, (input, { user }): Promise<TimeOffSaveResult> =>
  db.transaction(async (tx) => {
    const existing = await repo.timeOff.getLiveOrNotFound(tx, input.id) // owning-row lookup
    await authz.requireTimeOffEdit(tx, user, existing.userId)
    return services.timeOff.updateTimeOff(tx, user, existing, {
      leaveTypeId: input.leaveTypeId,
      startDate: input.startDate,
      endDate: input.endDate,
      half: input.half,
      note: input.note ?? null,
    })
  }),
)

/** Soft delete → `batch` for the 8 s undo toast (no confirm, FR-909). */
export const deleteTimeOff = action(timeOffIdSchema, (input, { user }): Promise<TimeOffDeleteResult> =>
  db.transaction(async (tx) => {
    const existing = await repo.timeOff.getLiveOrNotFound(tx, input.id)
    await authz.requireTimeOffEdit(tx, user, existing.userId)
    return services.timeOff.deleteTimeOff(tx, user, existing)
  }),
)

/** Undo of deleteTimeOff (M5-D16): unknown / already restored batch → 404; owner authz like the other writes. */
export const restoreTimeOff = action(restoreTimeOffSchema, (input, { user }): Promise<TimeOffRestoreResult> =>
  db.transaction(async (tx) => {
    const rows = await repo.timeOff.listByBatch(tx, input.batch)
    const owner = rows[0]
    if (!owner) throw new NotFoundError()
    for (const userId of new Set(rows.map((r) => r.userId))) await authz.requireTimeOffEdit(tx, user, userId)
    return services.timeOff.restoreTimeOff(tx, user, rows)
  }),
)
