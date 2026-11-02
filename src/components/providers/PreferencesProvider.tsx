'use client'
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { toast } from 'sonner'
import { useDebouncedCallback } from '@/hooks/useDebouncedCallback'
import { PreferencesContext, type PreferencesApi, type PreferenceValue } from '@/hooks/usePreferences'
import { th } from '@/i18n/th'
import type { PreferenceInput, PreferenceKey, Preferences } from '@/lib/schemas/preferences'
import { setPreference as savePreference } from '@/server/actions/preferences'

/** X05: debounce per key so quick toggles send one request with the last value. */
export const PREFERENCE_DEBOUNCE_MS = 300

async function save(input: PreferenceInput): Promise<void> {
  try {
    const res = await savePreference(input)
    if (!res.ok) toast.error(th.prefs.saveFailed)
  } catch {
    toast.error(th.prefs.saveFailed)
  }
}

/**
 * Holds the user's preferences (read on the server by the root layout) with optimistic local updates.
 * `enabled=false` (anonymous pages) keeps changes local and never calls the action. Pending saves are flushed on
 * `pagehide` so a toggle right before a full navigation (login/logout) is not lost.
 */
export function PreferencesProvider({
  initial,
  enabled,
  children,
}: {
  initial: Preferences
  enabled: boolean
  children: ReactNode
}) {
  const [prefs, setPrefs] = useState(initial)
  const debounced = useDebouncedCallback(
    (input: PreferenceInput) => void save(input),
    PREFERENCE_DEBOUNCE_MS,
    (input) => input.key,
  )

  useEffect(() => {
    if (!enabled) return
    const onPageHide = () => debounced.flush()
    window.addEventListener('pagehide', onPageHide)
    return () => {
      window.removeEventListener('pagehide', onPageHide)
      debounced.flush()
    }
  }, [enabled, debounced])

  const setPreference = useCallback(
    <K extends PreferenceKey>(key: K, value: PreferenceValue<K>, opts?: { immediate?: boolean }) => {
      setPrefs((p) => ({ ...p, [key]: value }))
      if (!enabled) return
      // `{ key, value }` is a valid PreferenceInput member for this K; TS cannot correlate the generic pair.
      debounced.call({ key, value } as PreferenceInput)
      if (opts?.immediate === true) debounced.flush()
    },
    [enabled, debounced],
  )

  const api = useMemo<PreferencesApi>(() => ({ prefs, setPreference }), [prefs, setPreference])
  return <PreferencesContext value={api}>{children}</PreferencesContext>
}
