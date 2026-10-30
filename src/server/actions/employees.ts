'use server'
// src/server/actions/employees.ts — manager-only employee management (§3.2 PERM-01, FR-201…FR-206).
// Shape: zod (wrapper) → authz.requireManager → hash outside the tx → service in one tx (audit inside) → refresh().
import { hashPassword } from 'better-auth/crypto'
import { refresh } from 'next/cache'
import { th } from '@/i18n/th'
import type { Ok } from '@/lib/action-result'
import { passwordPolicy } from '@/lib/schemas/account'
import {
  createEmployeeInput,
  resetPasswordInput,
  updateEmployeeInput,
  userIdInput,
} from '@/lib/schemas/employees'
import { action } from '../action'
import * as authz from '../authz'
import { serverToday } from '../clock'
import { db } from '../db/client'
import { ValidationError } from '../errors'
import * as repo from '../repo'
import * as services from '../services'

/** FR-201/202/203. Returns only `{ userId }` — the password is never echoed (AC-202). */
export const createEmployee = action(createEmployeeInput, async (input, { user }): Promise<{ userId: string }> => {
  authz.requireManager(user)
  const { password, ...data } = input
  const passwordHash = await hashPassword(password) // before the tx; plaintext never reaches the service
  const res = await db.transaction((tx) => services.employees.createEmployee(tx, user, { ...data, passwordHash }))
  refresh()
  return { userId: res.userId }
})

/** Profile + role + schedule, one tx, one audit row (M1-D8). */
export const updateEmployee = action(updateEmployeeInput, async (input, { user }): Promise<Ok> => {
  authz.requireManager(user)
  await db.transaction((tx) => services.employees.updateEmployee(tx, user, input))
  refresh()
  return {}
})

/** FR-205 / AC-104: immediate; the client offers undo via reactivateEmployee (M1-D13). */
export const deactivateEmployee = action(userIdInput, async ({ userId }, { user }): Promise<Ok> => {
  authz.requireManager(user)
  const today = serverToday()
  await db.transaction((tx) => services.employees.deactivateEmployee(tx, user, { userId, today }))
  refresh()
  return {}
})

export const reactivateEmployee = action(userIdInput, async ({ userId }, { user }): Promise<Ok> => {
  authz.requireManager(user)
  await db.transaction((tx) => services.employees.reactivateEmployee(tx, user, { userId }))
  refresh()
  return {}
})

/** FR-204: new password (policy vs the target's email), forced change, every session revoked. */
export const resetEmployeePassword = action(resetPasswordInput, async ({ userId, password }, { user }): Promise<Ok> => {
  authz.requireManager(user)
  const target = await repo.users.getUserOrNotFound(db, userId)
  const issues = passwordPolicy(password, { email: target.email })
  if (issues.length > 0) throw new ValidationError({ password: issues.map((i) => th.account.policy[i]) })
  const passwordHash = await hashPassword(password)
  await db.transaction((tx) => services.employees.resetEmployeePassword(tx, user, { userId, passwordHash }))
  refresh()
  return {}
})
