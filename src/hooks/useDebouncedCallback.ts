'use client'
import { useEffect, useMemo, useRef } from 'react'

export interface Debounced<A extends unknown[]> {
  /** Schedules `fn(...args)` after `delayMs`; a later call with the same key replaces the pending one. */
  call(...args: A): void
  /** Runs every pending call now. */
  flush(): void
  /** Drops every pending call. */
  cancel(): void
}

/**
 * Trailing-edge debounce with optional per-key timers (`keyOf`), so e.g. two preference keys never swallow each
 * other. The returned object is stable for a given delay; `fn`/`keyOf` may change between renders (the latest
 * ones run). Pending calls are dropped on unmount unless the caller flushes them first.
 */
export function useDebouncedCallback<A extends unknown[]>(
  fn: (...args: A) => void,
  delayMs: number,
  keyOf?: (...args: A) => string,
): Debounced<A> {
  const latest = useRef({ fn, keyOf })
  useEffect(() => {
    latest.current = { fn, keyOf }
  })
  const pending = useRef(new Map<string, { timer: ReturnType<typeof setTimeout>; args: A }>())

  const api = useMemo<Debounced<A>>(() => {
    const fire = (k: string) => {
      const p = pending.current.get(k)
      if (!p) return
      clearTimeout(p.timer)
      pending.current.delete(k)
      latest.current.fn(...p.args)
    }
    return {
      call: (...args: A) => {
        const k = latest.current.keyOf?.(...args) ?? ''
        const prev = pending.current.get(k)
        if (prev) clearTimeout(prev.timer)
        pending.current.set(k, { timer: setTimeout(() => fire(k), delayMs), args })
      },
      flush: () => {
        for (const k of [...pending.current.keys()]) fire(k)
      },
      cancel: () => {
        for (const p of pending.current.values()) clearTimeout(p.timer)
        pending.current.clear()
      },
    }
  }, [delayMs])

  useEffect(() => () => api.cancel(), [api])
  return api
}
