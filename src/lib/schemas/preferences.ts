// src/lib/schemas/preferences.ts — user_preferences keys (X05, M1-D17). Later milestones add their keys to both
// the discriminated union and the read schema (each with `.catch(default)` so bad stored values fall back).
import { z } from '@/lib/z'

export const THEMES = ['light', 'dark', 'system'] as const
export type Theme = (typeof THEMES)[number]

const SIDEBAR_EXPANDED = z.array(z.string().max(80)).max(500)

/** M3 task-list keys (plan/m03 S0.13, X74, M3-D6). */
export const TASK_GROUP_BY = ['none', 'status', 'assignee', 'certainty'] as const
export const TASK_SORT = ['manual', 'due'] as const
export const TASK_VIEWS = ['LIST', 'BOARD'] as const

/** M6 grid / load keys (plan/m06 S0.5, M6-D21, X59). `load.view` is reused by M9's workload. */
export const GRID_UNITS = ['DAYS', 'FRACTION'] as const
export const LOAD_VIEWS = ['ALL', 'COMMITTED', 'AT_RISK'] as const
/** M7 grid zoom (FR-802, X59: first consumer). The URL uses lowercase `week` | `day` (M7-D17). */
export const GRID_ZOOMS = ['WEEK', 'DAY'] as const

export const preferenceInput = z.discriminatedUnion('key', [
  z.object({ key: z.literal('theme'), value: z.enum(THEMES) }),
  z.object({ key: z.literal('sidebar.collapsed'), value: z.boolean() }),
  /** Expanded sidebar nodes (M2 X05): `project:<uuid>`; M4 adds `page:<uuid>`. */
  z.object({ key: z.literal('sidebar.expanded'), value: SIDEBAR_EXPANDED }),
  // M3
  z.object({ key: z.literal('tasks.groupBy'), value: z.enum(TASK_GROUP_BY) }),
  z.object({ key: z.literal('tasks.sort'), value: z.enum(TASK_SORT) }),
  z.object({ key: z.literal('tasks.showCompleted'), value: z.boolean() }),
  z.object({ key: z.literal('tasks.view'), value: z.enum(TASK_VIEWS) }),
  z.object({ key: z.literal('tasks.board.leafOnly'), value: z.boolean() }),
  z.object({ key: z.literal('tasks.board.hideDone'), value: z.boolean() }),
  // M6
  z.object({ key: z.literal('grid.unit'), value: z.enum(GRID_UNITS) }),
  z.object({ key: z.literal('load.view'), value: z.enum(LOAD_VIEWS) }),
  // M7
  z.object({ key: z.literal('grid.zoom'), value: z.enum(GRID_ZOOMS) }),
])
export type PreferenceInput = z.infer<typeof preferenceInput>
export type PreferenceKey = PreferenceInput['key']

export const preferencesSchema = z.object({
  theme: z.enum(THEMES).catch('system'),
  'sidebar.collapsed': z.boolean().catch(false),
  /** Optional (absent = nothing expanded); read it as `prefs['sidebar.expanded'] ?? []`. Kept optional so stored
   *  rows and DEFAULT_PREFERENCES from M1 stay valid unchanged (M2 S0.9). */
  'sidebar.expanded': SIDEBAR_EXPANDED.optional().catch(undefined),
  // M3 keys: optional like sidebar.expanded (absent or invalid = the default in TASK_PREFERENCE_DEFAULTS), so stored
  // rows and DEFAULT_PREFERENCES from M1/M2 stay valid unchanged. Read with taskPreference(prefs, key).
  'tasks.groupBy': z.enum(TASK_GROUP_BY).optional().catch(undefined),
  'tasks.sort': z.enum(TASK_SORT).optional().catch(undefined),
  'tasks.showCompleted': z.boolean().optional().catch(undefined),
  'tasks.view': z.enum(TASK_VIEWS).optional().catch(undefined),
  'tasks.board.leafOnly': z.boolean().optional().catch(undefined),
  'tasks.board.hideDone': z.boolean().optional().catch(undefined),
  // M6 keys (M6-D21): optional like the M3 keys (absent or invalid = GRID_PREFERENCE_DEFAULTS), so stored rows and
  // DEFAULT_PREFERENCES stay valid unchanged. Read with gridPreference(prefs, key).
  'grid.unit': z.enum(GRID_UNITS).optional().catch(undefined),
  'load.view': z.enum(LOAD_VIEWS).optional().catch(undefined),
  // M7 key: optional like the M6 keys; read with gridPreference(prefs, 'grid.zoom').
  'grid.zoom': z.enum(GRID_ZOOMS).optional().catch(undefined),
})
export type Preferences = z.infer<typeof preferencesSchema>

export const DEFAULT_PREFERENCES: Preferences = { theme: 'system', 'sidebar.collapsed': false }

/** Defaults of the optional M3 keys (M3-D6: completed rows are shown by default; X74: list view). */
export const TASK_PREFERENCE_DEFAULTS = {
  'tasks.groupBy': 'none',
  'tasks.sort': 'manual',
  'tasks.showCompleted': true,
  'tasks.view': 'LIST',
  'tasks.board.leafOnly': false,
  'tasks.board.hideDone': false,
} as const satisfies { [K in TaskPreferenceKey]-?: NonNullable<Preferences[K]> }
export type TaskPreferenceKey =
  | 'tasks.groupBy'
  | 'tasks.sort'
  | 'tasks.showCompleted'
  | 'tasks.view'
  | 'tasks.board.leafOnly'
  | 'tasks.board.hideDone'

/** The stored value of an M3 key, or its default. */
export function taskPreference<K extends TaskPreferenceKey>(
  prefs: Preferences,
  key: K,
): NonNullable<Preferences[K]> {
  return (prefs[key] ?? TASK_PREFERENCE_DEFAULTS[key]) as NonNullable<Preferences[K]>
}

/** Defaults of the optional grid keys (M6-D21: days, all load; M7: week zoom). */
export const GRID_PREFERENCE_DEFAULTS = {
  'grid.unit': 'DAYS',
  'load.view': 'ALL',
  'grid.zoom': 'WEEK',
} as const satisfies { [K in GridPreferenceKey]-?: NonNullable<Preferences[K]> }
export type GridPreferenceKey = 'grid.unit' | 'load.view' | 'grid.zoom'

/** The stored value of a grid key (M6/M7), or its default. */
export function gridPreference<K extends GridPreferenceKey>(
  prefs: Preferences,
  key: K,
): NonNullable<Preferences[K]> {
  return (prefs[key] ?? GRID_PREFERENCE_DEFAULTS[key]) as NonNullable<Preferences[K]>
}
