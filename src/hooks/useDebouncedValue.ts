'use client'
import { useEffect, useState } from 'react'

/**
 * The value after it has been stable for `ms` (M10 S2.3: the palette's server search waits 120 ms after the last
 * keystroke). The first render returns the initial value immediately; a change of `ms` restarts the timer.
 */
export function useDebouncedValue<T>(value: T, ms: number): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), ms)
    return () => clearTimeout(t)
  }, [value, ms])
  return debounced
}
