'use server'
// src/server/actions/preferences.ts — X05 (M1-D17). Own preferences only; not audited (X44), no refresh() (the
// client applies the change itself and the next full load renders it).
import type { Ok } from '@/lib/action-result'
import { preferenceInput } from '@/lib/schemas/preferences'
import { action } from '../action'
import * as authz from '../authz'
import { db } from '../db/client'
import * as services from '../services'

export const setPreference = action(preferenceInput, async (input, { user }): Promise<Ok> => {
  authz.requireUser(user)
  await services.preferences.setPreference(db, user.id, input)
  return {}
})
