'use server'
// src/server/actions/holidays.ts — manager-only holiday management (§3.2 PERM-02, FR-901, M5-D2/D11/D15).
// Shape: zod (wrapper) → authz.requireManager → service in one tx (audit inside the service, M5-D2) → refresh()
// (the settings table is RSC).
import { refresh } from 'next/cache'
import type { DeletedHoliday, HolidayDTO, HolidayImportResult } from '@/lib/contracts/holidays'
import {
  createHolidaySchema,
  holidayIdSchema,
  importHolidaysSchema,
  restoreHolidaySchema,
  updateHolidaySchema,
} from '@/lib/schemas/holidays'
import { action } from '../action'
import * as authz from '../authz'
import { db } from '../db/client'
import * as services from '../services'

export const createHoliday = action(
  createHolidaySchema,
  async (input, { user }): Promise<{ holiday: HolidayDTO }> => {
    authz.requireManager(user)
    const holiday = await db.transaction((tx) => services.holidays.createHoliday(tx, user, input))
    refresh()
    return { holiday }
  },
)

export const updateHoliday = action(
  updateHolidaySchema,
  async (input, { user }): Promise<{ holiday: HolidayDTO }> => {
    authz.requireManager(user)
    const holiday = await db.transaction((tx) => services.holidays.updateHoliday(tx, user, input))
    refresh()
    return { holiday }
  },
)

/** Hard delete; the client keeps `deleted` for the undo (restoreHoliday, same id). */
export const deleteHoliday = action(
  holidayIdSchema,
  async (input, { user }): Promise<{ deleted: DeletedHoliday }> => {
    authz.requireManager(user)
    const deleted = await db.transaction((tx) => services.holidays.deleteHoliday(tx, user, input.id))
    refresh()
    return { deleted }
  },
)

export const restoreHoliday = action(
  restoreHolidaySchema,
  async (input, { user }): Promise<{ holiday: HolidayDTO }> => {
    authz.requireManager(user)
    const holiday = await db.transaction((tx) => services.holidays.restoreHoliday(tx, user, input))
    refresh()
    return { holiday }
  },
)

/** M5-D11: rows re-validated by zod (and again by the service); upsert in one transaction, one audit row. */
export const importHolidays = action(
  importHolidaysSchema,
  async (input, { user }): Promise<HolidayImportResult> => {
    authz.requireManager(user)
    const result = await db.transaction((tx) => services.holidays.importHolidays(tx, user, input.rows))
    refresh()
    return result
  },
)
