// src/server/services/preferences.ts — user_preferences (X05, M1-D17). Not audited.
import {
  preferencesSchema,
  type PreferenceInput,
  type Preferences,
} from '@/lib/schemas/preferences'
import type { DbOrTx } from '../db/types'
import * as repo from '../repo'

/** preferencesSchema.parse(stored data ?? {}) — invalid stored values fall back to defaults, unknown keys dropped. */
export async function getPreferences(tx: DbOrTx, userId: string): Promise<Preferences> {
  return preferencesSchema.parse((await repo.preferences.getPreferenceData(tx, userId)) ?? {})
}

/** jsonb merge of one validated key (insert … on conflict do update set data = data || …). */
export async function setPreference(tx: DbOrTx, userId: string, input: PreferenceInput): Promise<void> {
  await repo.preferences.mergePreference(tx, userId, input.key, input.value)
}
