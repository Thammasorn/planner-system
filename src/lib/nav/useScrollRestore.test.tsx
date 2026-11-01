// FR-686 / M6.1-D18: a list view puts the window back where it was once its data has rendered after a history return.
import { renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { rememberScroll, resetScrollMemory } from './scroll-memory'
import { useScrollRestore } from './useScrollRestore'

afterEach(() => {
  resetScrollMemory()
  vi.restoreAllMocks()
})

function setup() {
  vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
    cb(0)
    return 1
  })
  return vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
}

describe('useScrollRestore', () => {
  it('restores the remembered position after a popstate return once the data is ready', () => {
    const scrollTo = setup()
    window.history.replaceState(null, '', '/projects/p/tasks')
    rememberScroll('/projects/p/tasks', 640)
    const { rerender } = renderHook(({ ready }) => useScrollRestore(ready), {
      initialProps: { ready: false },
    })
    window.dispatchEvent(new PopStateEvent('popstate'))
    expect(scrollTo).not.toHaveBeenCalled()
    rerender({ ready: true })
    expect(scrollTo).toHaveBeenCalledWith({ top: 640 })
  })

  it('a push navigation (no popstate) does not scroll', () => {
    const scrollTo = setup()
    window.history.replaceState(null, '', '/my')
    rememberScroll('/my', 200)
    renderHook(() => useScrollRestore(true))
    expect(scrollTo).not.toHaveBeenCalled()
  })

  it('nothing remembered → nothing happens', () => {
    const scrollTo = setup()
    window.history.replaceState(null, '', '/tasks')
    const { rerender } = renderHook(({ ready }) => useScrollRestore(ready), {
      initialProps: { ready: false },
    })
    window.dispatchEvent(new PopStateEvent('popstate'))
    rerender({ ready: true })
    expect(scrollTo).not.toHaveBeenCalled()
  })
})
