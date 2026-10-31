// src/lib/schemas/preferences.ts — user_preferences keys (X05, M1-D17). Later milestones add their keys to both
// the discriminated union and the read schema (each with `.catch(default)` so bad stored values fall back).
import { z } from '@/lib/z'

export const THEMES = ['light', 'dark', 'system'] as const
export type Theme = (typeof THEMES)[number]

const SIDEBAR_EXPANDED = z.array(z.string().max(80)).max(500)

export const preferenceInput = z.discriminatedUnion('key', [
  z.object({ key: z.literal('theme'), value: z.enum(THEMES) }),
  z.object({ key: z.literal('sidebar.collapsed'), value: z.boolean() }),
  /** Expanded sidebar nodes (M2 X05): `project:<uuid>`; M4 adds `page:<uuid>`. */
  z.object({ key: z.literal('sidebar.expanded'), value: SIDEBAR_EXPANDED }),
])
export type PreferenceInput = z.infer<typeof preferenceInput>
export type PreferenceKey = PreferenceInput['key']

export const preferencesSchema = z.object({
  theme: z.enum(THEMES).catch('system'),
  'sidebar.collapsed': z.boolean().catch(false),
  /** Optional (absent = nothing expanded); read it as `prefs['sidebar.expanded'] ?? []`. Kept optional so stored
   *  rows and DEFAULT_PREFERENCES from M1 stay valid unchanged (M2 S0.9). */
  'sidebar.expanded': SIDEBAR_EXPANDED.optional().catch(undefined),
})
export type Preferences = z.infer<typeof preferencesSchema>

export const DEFAULT_PREFERENCES: Preferences = { theme: 'system', 'sidebar.collapsed': false }
