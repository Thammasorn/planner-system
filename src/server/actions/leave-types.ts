'use server'
// src/server/actions/leave-types.ts — manager-only leave type management (§3.2 PERM-02, FR-902, M5-D10/D15).
// Shape: zod (wrapper) → authz.requireManager → service in one tx (audit inside the service, M5-D2) → refresh()
// (the settings table is RSC).
import { refresh } from 'next/cache'
import type { Ok } from '@/lib/action-result'
import type { DeleteLeaveTypeResult, LeaveTypeDTO } from '@/lib/contracts/leave-types'
import {
  createLeaveTypeSchema,
  leaveTypeIdSchema,
  moveLeaveTypeSchema,
  restoreLeaveTypeSchema,
  setLeaveTypeArchivedSchema,
  updateLeaveTypeSchema,
} from '@/lib/schemas/leave-types'
import { action } from '../action'
import * as authz from '../authz'
import { db } from '../db/client'
import * as services from '../services'

export const createLeaveType = action(
  createLeaveTypeSchema,
  async (input, { user }): Promise<{ leaveType: LeaveTypeDTO }> => {
    authz.requireManager(user)
    const leaveType = await db.transaction((tx) => services.leaveTypes.createLeaveType(tx, user, input))
    refresh()
    return { leaveType }
  },
)

export const updateLeaveType = action(updateLeaveTypeSchema, async (input, { user }): Promise<Ok> => {
  authz.requireManager(user)
  await db.transaction((tx) => services.leaveTypes.updateLeaveType(tx, user, input))
  refresh()
  return {}
})

/** Sends intent (id, direction), never order keys (X58). */
export const moveLeaveType = action(moveLeaveTypeSchema, async (input, { user }): Promise<Ok> => {
  authz.requireManager(user)
  await db.transaction((tx) => services.leaveTypes.moveLeaveType(tx, user, input))
  refresh()
  return {}
})

export const setLeaveTypeArchived = action(
  setLeaveTypeArchivedSchema,
  async (input, { user }): Promise<Ok> => {
    authz.requireManager(user)
    await db.transaction((tx) => services.leaveTypes.setLeaveTypeArchived(tx, user, input))
    refresh()
    return {}
  },
)

/** M5-D10: in use → archived instead (`outcome: 'archived'`); otherwise hard delete with an undo snapshot. */
export const deleteLeaveType = action(
  leaveTypeIdSchema,
  async (input, { user }): Promise<DeleteLeaveTypeResult> => {
    authz.requireManager(user)
    const result = await db.transaction((tx) => services.leaveTypes.deleteLeaveType(tx, user, input.id))
    refresh()
    return result
  },
)

export const restoreLeaveType = action(restoreLeaveTypeSchema, async (input, { user }): Promise<Ok> => {
  authz.requireManager(user)
  await db.transaction((tx) => services.leaveTypes.restoreLeaveType(tx, user, input))
  refresh()
  return {}
})
