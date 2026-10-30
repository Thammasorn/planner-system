// src/server/repo/preferences.ts — user_preferences jsonb (X05). Values are validated by the caller (zod).
import { eq, sql } from 'drizzle-orm'
import { userPreferences } from '../db/schema'
import type { DbOrTx } from '../db/types'

/** The raw stored object, or null when the user has no row yet. */
export async function getPreferenceData(tx: DbOrTx, userId: string): Promise<Record<string, unknown> | null> {
  const [row] = await tx
    .select({ data: userPreferences.data })
    .from(userPreferences)
    .where(eq(userPreferences.userId, userId))
  return row?.data ?? null
}

/** Upsert + jsonb merge of one key (other keys untouched). */
export async function mergePreference(tx: DbOrTx, userId: string, key: string, value: unknown): Promise<void> {
  const json = JSON.stringify(value)
  await tx
    .insert(userPreferences)
    .values({ userId, data: sql`jsonb_build_object(${key}::text, ${json}::jsonb)` })
    .onConflictDoUpdate({
      target: userPreferences.userId,
      set: { data: sql`${userPreferences.data} || jsonb_build_object(${key}::text, ${json}::jsonb)` },
    })
}
