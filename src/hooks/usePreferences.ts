'use client'
import { createContext, useContext } from 'react'
import {
  DEFAULT_PREFERENCES,
  type PreferenceInput,
  type PreferenceKey,
  type Preferences,
} from '@/lib/schemas/preferences'

export type PreferenceValue<K extends PreferenceKey> = Extract<PreferenceInput, { key: K }>['value']

export interface PreferencesApi {
  prefs: Preferences
  /** Optimistic; saved through the `setPreference` action, debounced 300 ms per key (X05). */
  setPreference: <K extends PreferenceKey>(key: K, value: PreferenceValue<K>) => void
}

/** Outside a provider (never in the app) the defaults apply and nothing is saved, like an anonymous page. */
export const PreferencesContext = createContext<PreferencesApi>({
  prefs: DEFAULT_PREFERENCES,
  setPreference: () => {},
})

/** The signed-in user's UI preferences (`user_preferences`, never localStorage — PLAN §3.9). */
export function usePreferences(): PreferencesApi {
  return useContext(PreferencesContext)
}
