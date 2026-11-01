// @vitest-environment jsdom
// FR-686 / M6.1-D18: "back where I was" — the list remembers its scroll position before ↗ / Shift+Space leaves it
// and restores it after its data renders on a browser-history (popstate) return.
import { afterEach, describe, expect, it } from 'vitest'
import {
  consumePopNavigation,
  currentScrollKey,
  installPopListener,
  rememberBoxScroll,
  rememberScroll,
  resetScrollMemory,
  takeBoxScroll,
  takeScroll,
} from './scroll-memory'

afterEach(() => resetScrollMemory())

describe('scroll-memory (M6.1-D18)', () => {
  it('the key is pathname + search (the open panel is part of the place)', () => {
    window.history.replaceState(null, '', '/projects/p/tasks?task=1')
    expect(currentScrollKey()).toBe('/projects/p/tasks?task=1')
  })

  it('remember → take returns the value once', () => {
    rememberScroll('/a', 420)
    expect(takeScroll('/a')).toBe(420)
    expect(takeScroll('/a')).toBeNull()
  })

  it('remember defaults to the current key and window.scrollY', () => {
    window.history.replaceState(null, '', '/my')
    Object.defineProperty(window, 'scrollY', { value: 333, configurable: true })
    rememberScroll()
    expect(takeScroll('/my')).toBe(333)
  })

  it('keys are independent', () => {
    rememberScroll('/a', 1)
    rememberScroll('/b', 2)
    expect(takeScroll('/b')).toBe(2)
    expect(takeScroll('/a')).toBe(1)
  })

  it('a popstate since the last consume is reported once; pushes are not', () => {
    installPopListener()
    expect(consumePopNavigation()).toBe(false)
    window.dispatchEvent(new PopStateEvent('popstate'))
    expect(consumePopNavigation()).toBe(true)
    expect(consumePopNavigation()).toBe(false)
  })

  it('with the Navigation API, a traverse counts at once (before popstate); push / replace do not', () => {
    const nav = new EventTarget()
    const before = Object.getOwnPropertyDescriptor(window, 'navigation')
    Object.defineProperty(window, 'navigation', { value: nav, configurable: true })
    const navigate = (navigationType: string): void => {
      nav.dispatchEvent(Object.assign(new Event('navigate'), { navigationType }))
    }
    try {
      installPopListener()
      navigate('push')
      navigate('replace')
      expect(consumePopNavigation()).toBe(false)
      navigate('traverse')
      expect(consumePopNavigation()).toBe(true)
      window.dispatchEvent(new PopStateEvent('popstate')) // the same traversal's popstate does not count twice
      expect(consumePopNavigation()).toBe(false)
      resetScrollMemory()
      navigate('traverse') // stopped listening
      expect(consumePopNavigation()).toBe(false)
    } finally {
      if (before) Object.defineProperty(window, 'navigation', before)
      else Reflect.deleteProperty(window, 'navigation')
    }
  })

  it('installing twice listens once', () => {
    installPopListener()
    installPopListener()
    window.dispatchEvent(new PopStateEvent('popstate'))
    expect(consumePopNavigation()).toBe(true)
    expect(consumePopNavigation()).toBe(false)
  })

  it('a scroll box (the grid) is remembered with both axes and the window, once', () => {
    window.history.replaceState(null, '', '/projects/p/plan')
    Object.defineProperty(window, 'scrollY', { value: 12, configurable: true })
    const el = document.createElement('div')
    el.scrollTop = 640
    el.scrollLeft = 900
    rememberBoxScroll(el)
    expect(takeBoxScroll('/projects/p/plan')).toEqual({ top: 640, left: 900, windowY: 12 })
    expect(takeBoxScroll('/projects/p/plan')).toBeNull()
  })

  it('remembering a box re-arms the popstate flag (only the return trip counts)', () => {
    installPopListener()
    window.dispatchEvent(new PopStateEvent('popstate'))
    rememberBoxScroll(document.createElement('div'), '/x')
    expect(consumePopNavigation()).toBe(false)
  })
})
