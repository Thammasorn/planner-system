import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { HOTKEYS } from '@/lib/keys'
import { useFallbackHotkey } from './useFallbackHotkey'
import { useHotkeys } from './useHotkeys'

function Fallback({ onFallback }: { onFallback: () => void }) {
  useFallbackHotkey(HOTKEYS.newTask, onFallback)
  return null
}

function Local({ onLocal }: { onLocal: () => void }) {
  useHotkeys([{ hotkey: HOTKEYS.newTask, handler: onLocal }])
  return null
}

beforeEach(() => {
  vi.useFakeTimers()
})
afterEach(() => {
  vi.useRealTimers()
})

describe('useFallbackHotkey (KEY-05, M10-D25)', () => {
  it('a page-local N binding (mounted later) wins: local called, fallback not', () => {
    const fallback = vi.fn()
    const local = vi.fn()
    render(
      <>
        <Fallback onFallback={fallback} />
        <Local onLocal={local} />
      </>,
    )
    fireEvent.keyDown(document.body, { code: 'KeyN', key: 'n' })
    act(() => {
      vi.runAllTimers()
    })
    expect(local).toHaveBeenCalledTimes(1)
    expect(fallback).not.toHaveBeenCalled()
  })

  it('without a local binding the fallback runs once after the dispatch', () => {
    const fallback = vi.fn()
    render(<Fallback onFallback={fallback} />)
    fireEvent.keyDown(document.body, { code: 'KeyN', key: 'n' })
    expect(fallback).not.toHaveBeenCalled() // deferred until every listener of this dispatch ran
    act(() => {
      vi.runAllTimers()
    })
    expect(fallback).toHaveBeenCalledTimes(1)
  })

  it('ignores editable targets, modifiers and repeats', () => {
    const fallback = vi.fn()
    render(
      <>
        <Fallback onFallback={fallback} />
        <input aria-label="name" />
      </>,
    )
    fireEvent.keyDown(screen.getByRole('textbox', { name: 'name' }), { code: 'KeyN', key: 'n' })
    fireEvent.keyDown(document.body, { code: 'KeyN', key: 'n', ctrlKey: true })
    fireEvent.keyDown(document.body, { code: 'KeyN', key: 'n', metaKey: true })
    fireEvent.keyDown(document.body, { code: 'KeyN', key: 'n', repeat: true })
    act(() => {
      vi.runAllTimers()
    })
    expect(fallback).not.toHaveBeenCalled()
  })

  it('an already handled event (defaultPrevented) is skipped', () => {
    const fallback = vi.fn()
    render(<Fallback onFallback={fallback} />)
    const ev = new KeyboardEvent('keydown', { code: 'KeyN', key: 'n', bubbles: true, cancelable: true })
    ev.preventDefault()
    document.body.dispatchEvent(ev)
    act(() => {
      vi.runAllTimers()
    })
    expect(fallback).not.toHaveBeenCalled()
  })

  it('matches e.code on the Thai layout (KeyN = "ื")', () => {
    const fallback = vi.fn()
    render(<Fallback onFallback={fallback} />)
    fireEvent.keyDown(document.body, { code: 'KeyN', key: 'ื' })
    act(() => {
      vi.runAllTimers()
    })
    expect(fallback).toHaveBeenCalledTimes(1)
  })

  it('enabled: false listens to nothing', () => {
    const fallback = vi.fn()
    function Off() {
      useFallbackHotkey(HOTKEYS.newTask, fallback, { enabled: false })
      return null
    }
    render(<Off />)
    fireEvent.keyDown(document.body, { code: 'KeyN', key: 'n' })
    act(() => {
      vi.runAllTimers()
    })
    expect(fallback).not.toHaveBeenCalled()
  })
})
