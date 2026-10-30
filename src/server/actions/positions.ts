'use server'
// src/server/actions/positions.ts — manager-only position management (§3.2 PERM-02, FR-208, M1-D14).
// Shape: zod (wrapper) → authz.requireManager → service in one tx (audit inside) → refresh().
import { refresh } from 'next/cache'
import type { Ok } from '@/lib/action-result'
import type { DeletedPosition } from '@/lib/contracts/users'
import {
  createPositionInput,
  deletePositionInput,
  movePositionInput,
  renamePositionInput,
  restorePositionInput,
} from '@/lib/schemas/positions'
import { action } from '../action'
import * as authz from '../authz'
import { db } from '../db/client'
import * as services from '../services'

export const createPosition = action(createPositionInput, async (input, { user }): Promise<{ id: string }> => {
  authz.requireManager(user)
  const res = await db.transaction((tx) => services.positions.createPosition(tx, user, input))
  refresh()
  return res
})

export const renamePosition = action(renamePositionInput, async (input, { user }): Promise<Ok> => {
  authz.requireManager(user)
  await db.transaction((tx) => services.positions.renamePosition(tx, user, input))
  refresh()
  return {}
})

export const movePosition = action(movePositionInput, async (input, { user }): Promise<Ok> => {
  authz.requireManager(user)
  await db.transaction((tx) => services.positions.movePosition(tx, user, input))
  refresh()
  return {}
})

/** Hard delete of an unused position; the client keeps `deleted` for the undo (restorePosition). */
export const deletePosition = action(
  deletePositionInput,
  async (input, { user }): Promise<{ deleted: DeletedPosition }> => {
    authz.requireManager(user)
    const res = await db.transaction((tx) => services.positions.deletePosition(tx, user, input))
    refresh()
    return res
  },
)

export const restorePosition = action(restorePositionInput, async (input, { user }): Promise<Ok> => {
  authz.requireManager(user)
  await db.transaction((tx) => services.positions.restorePosition(tx, user, input))
  refresh()
  return {}
})
