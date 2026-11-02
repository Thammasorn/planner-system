'use client'
import { useEffect, useEffectEvent } from 'react'
import { isEditableTarget, matchesHotkey, type Hotkey } from '@/lib/keys'

/**
 * A shortcut that runs only when nobody else handled it (KEY-05, M10-D25): a bubbling window `keydown` listener that
 * skips editable targets, repeats and events already `defaultPrevented`, then waits a macrotask and runs the handler
 * only if no later listener of the same dispatch called `preventDefault()` (M0's `useHotkeys` does whenever it
 * handles a binding, so M3's tasks-tab `N` and M6's grid `N` keep precedence without changes).
 */
export function useFallbackHotkey(
  hotkey: Hotkey,
  handler: () => void,
  opts: { enabled?: boolean } = {},
): void {
  const enabled = opts.enabled ?? true
  const run = useEffectEvent(handler)
  const onKeyDown = useEffectEvent((e: KeyboardEvent) => {
    if (e.defaultPrevented || e.repeat || isEditableTarget(e.target) || !matchesHotkey(e, hotkey)) return
    setTimeout(() => {
      if (!e.defaultPrevented) run()
    }, 0)
  })
  useEffect(() => {
    if (!enabled) return
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [enabled])
}
