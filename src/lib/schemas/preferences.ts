// src/lib/schemas/preferences.ts — user_preferences keys (X05, M1-D17). Later milestones add their keys to both
// the discriminated union and the read schema (each with `.catch(default)` so bad stored values fall back).
import { z } from '@/lib/z'

export const THEMES = ['light', 'dark', 'system'] as const
export type Theme = (typeof THEMES)[number]

export const preferenceInput = z.discriminatedUnion('key', [
  z.object({ key: z.literal('theme'), value: z.enum(THEMES) }),
  z.object({ key: z.literal('sidebar.collapsed'), value: z.boolean() }),
])
export type PreferenceInput = z.infer<typeof preferenceInput>
export type PreferenceKey = PreferenceInput['key']

export const preferencesSchema = z.object({
  theme: z.enum(THEMES).catch('system'),
  'sidebar.collapsed': z.boolean().catch(false),
})
export type Preferences = z.infer<typeof preferencesSchema>

export const DEFAULT_PREFERENCES: Preferences = { theme: 'system', 'sidebar.collapsed': false }
