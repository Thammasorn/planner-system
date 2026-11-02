import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useDebouncedValue } from './useDebouncedValue'

beforeEach(() => {
  vi.useFakeTimers()
})
afterEach(() => {
  vi.useRealTimers()
})

describe('useDebouncedValue (M10 S2.3)', () => {
  it('returns the initial value at once', () => {
    const { result } = renderHook(() => useDebouncedValue('a', 120))
    expect(result.current).toBe('a')
  })

  it('updates only after the value is stable for the delay', () => {
    const { result, rerender } = renderHook(({ v }) => useDebouncedValue(v, 120), {
      initialProps: { v: '' },
    })
    rerender({ v: 'p' })
    act(() => {
      vi.advanceTimersByTime(100)
    })
    rerender({ v: 'po' })
    act(() => {
      vi.advanceTimersByTime(100)
    })
    expect(result.current).toBe('') // the second keystroke restarted the timer
    act(() => {
      vi.advanceTimersByTime(20)
    })
    expect(result.current).toBe('po')
  })

  it('skips intermediate values', () => {
    const seen: string[] = []
    const { rerender } = renderHook(
      ({ v }) => {
        const d = useDebouncedValue(v, 120)
        if (seen.at(-1) !== d) seen.push(d)
        return d
      },
      { initialProps: { v: 'x' } },
    )
    for (const v of ['xy', 'xyz', 'xyzw']) {
      rerender({ v })
      act(() => {
        vi.advanceTimersByTime(50)
      })
    }
    act(() => {
      vi.advanceTimersByTime(120)
    })
    expect(seen).toEqual(['x', 'xyzw'])
  })
})
