'use client'
import { useEffect, useEffectEvent } from 'react'
import { isEditableTarget, matchesHotkey, type Hotkey } from '@/lib/keys'

export interface HotkeyBinding {
  hotkey: Hotkey
  handler: (e: KeyboardEvent) => void
  /** default false: shortcuts are ignored while typing (X49) */
  allowInEditable?: boolean
}

/** Global keydown bindings on window; skips events already handled (e.defaultPrevented). */
export function useHotkeys(bindings: readonly HotkeyBinding[], opts: { enabled?: boolean } = {}): void {
  const enabled = opts.enabled ?? true
  const onKeyDown = useEffectEvent((e: KeyboardEvent) => {
    if (e.defaultPrevented) return
    for (const b of bindings) {
      if (!matchesHotkey(e, b.hotkey)) continue
      if (!b.allowInEditable && isEditableTarget(e.target)) return
      e.preventDefault()
      b.handler(e)
      return
    }
  })
  useEffect(() => {
    if (!enabled) return
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [enabled])
}
