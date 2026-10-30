import { act, fireEvent, screen } from '@testing-library/react'
import { useEffect } from 'react'
import { toast } from 'sonner'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { th } from '@/i18n/th'
import { renderWithProviders } from '../../../tests/helpers/render'
import { ToasterHost } from '../providers/ToasterHost'
import { UNDO_TOAST_MS } from './toastUndo'
import { UndoProvider } from './UndoProvider'
import { useUndo, type UndoApi, type UndoEntry } from './useUndo'

function entry(label = 'x', impl?: Partial<Pick<UndoEntry, 'undo' | 'redo'>>) {
  return {
    label,
    undo: vi.fn(impl?.undo ?? (() => Promise.resolve())),
    redo: vi.fn(impl?.redo ?? (() => Promise.resolve())),
  }
}

/** Renders the provider and hands the latest API to the test. */
function setup(children?: React.ReactNode) {
  const ref: { current: UndoApi | null } = { current: null }
  function Probe() {
    const api = useUndo()
    useEffect(() => {
      ref.current = api
    })
    return (
      <span data-testid="state">
        {String(api.canUndo)}/{String(api.canRedo)}
      </span>
    )
  }
  renderWithProviders(
    <UndoProvider>
      <Probe />
      {children}
      <ToasterHost />
    </UndoProvider>,
  )
  const api = () => {
    if (!ref.current) throw new Error('no api')
    return ref.current
  }
  const state = () => screen.getByTestId('state').textContent
  return { api, state }
}

afterEach(() => {
  toast.dismiss() // sonner keeps toasts in a module-level store between tests
  vi.useRealTimers()
})

describe('UndoProvider', () => {
  it('U-UNDO-01 push + undo calls undo once and enables redo', async () => {
    const { api, state } = setup()
    const e = entry()
    act(() => api().push(e))
    expect(state()).toBe('true/false')
    await act(() => api().undo())
    expect(e.undo).toHaveBeenCalledTimes(1)
    expect(e.redo).not.toHaveBeenCalled()
    expect(state()).toBe('false/true')
  })

  it('U-UNDO-02 redo calls redo and moves the entry back to the undo stack', async () => {
    const { api, state } = setup()
    const e = entry()
    act(() => api().push(e))
    await act(() => api().undo())
    await act(() => api().redo())
    expect(e.redo).toHaveBeenCalledTimes(1)
    expect(state()).toBe('true/false')
  })

  it('U-UNDO-03 keeps at most 50 entries (oldest dropped)', async () => {
    const { api } = setup()
    const entries = Array.from({ length: 51 }, (_, i) => entry(String(i)))
    act(() => {
      for (const e of entries) api().push(e)
    })
    for (let i = 0; i < 51; i++) await act(() => api().undo())
    expect(entries[0]?.undo).not.toHaveBeenCalled()
    for (const e of entries.slice(1)) expect(e.undo).toHaveBeenCalledTimes(1)
  })

  it('U-UNDO-04 a push after undo clears the redo stack', async () => {
    const { api, state } = setup()
    act(() => api().push(entry('a')))
    await act(() => api().undo())
    expect(state()).toBe('false/true')
    act(() => api().push(entry('b')))
    expect(state()).toBe('true/false')
  })

  it('U-UNDO-05 Ctrl+Z (code KeyZ, Thai key) on the body undoes', async () => {
    const { api } = setup()
    const e = entry()
    act(() => api().push(e))
    await act(async () => {
      fireEvent.keyDown(document.body, { code: 'KeyZ', key: 'ผ', ctrlKey: true })
      await Promise.resolve()
    })
    expect(e.undo).toHaveBeenCalledTimes(1)
  })

  it('U-UNDO-06 ignores Ctrl+Z inside inputs, contenteditable and .bn-editor', async () => {
    const { api } = setup(
      <>
        <input aria-label="field" />
        <div data-testid="ce" contentEditable suppressContentEditableWarning>
          text
        </div>
        <div className="bn-editor">
          <p data-testid="bn">doc</p>
        </div>
      </>,
    )
    const e = entry()
    act(() => api().push(e))
    await act(async () => {
      fireEvent.keyDown(screen.getByRole('textbox', { name: 'field' }), { code: 'KeyZ', ctrlKey: true })
      fireEvent.keyDown(screen.getByTestId('ce'), { code: 'KeyZ', metaKey: true })
      fireEvent.keyDown(screen.getByTestId('bn'), { code: 'KeyZ', ctrlKey: true })
      await Promise.resolve()
    })
    expect(e.undo).not.toHaveBeenCalled()
  })

  it('U-UNDO-07 ignores defaultPrevented events; Ctrl+Shift+Z redoes', async () => {
    const { api } = setup()
    const e = entry()
    act(() => api().push(e))
    const prevented = new KeyboardEvent('keydown', { code: 'KeyZ', ctrlKey: true, bubbles: true, cancelable: true })
    prevented.preventDefault()
    await act(async () => {
      document.body.dispatchEvent(prevented)
      await Promise.resolve()
    })
    expect(e.undo).not.toHaveBeenCalled()

    await act(async () => {
      fireEvent.keyDown(document.body, { code: 'KeyZ', ctrlKey: true })
      await Promise.resolve()
    })
    expect(e.undo).toHaveBeenCalledTimes(1)
    await act(async () => {
      fireEvent.keyDown(document.body, { code: 'KeyZ', ctrlKey: true, shiftKey: true })
      await Promise.resolve()
    })
    expect(e.redo).toHaveBeenCalledTimes(1)
  })

  it('U-UNDO-08 the toast button undoes its own entry even when it is not on top; gone after 8 s', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const { api, state } = setup()
    const first = entry('first')
    const second = entry('second')
    act(() => api().push(first, { toast: 'deleted first' }))
    act(() => api().push(second))
    const toastEl = (await screen.findByText('deleted first')).closest('li')
    expect(toastEl).not.toBeNull()
    const button = screen.getByRole('button', { name: th.undo.undo })
    await act(async () => {
      fireEvent.click(button)
      await Promise.resolve()
    })
    expect(first.undo).toHaveBeenCalledTimes(1)
    expect(second.undo).not.toHaveBeenCalled()
    expect(state()).toBe('true/true')

    act(() => api().push(entry('third'), { toast: 'deleted third' }))
    expect(await screen.findByText('deleted third')).toBeInTheDocument()
    // SPEC §7.5 pins the undo window at 8 s; assert it independently of the implementation constant.
    expect(UNDO_TOAST_MS).toBe(8000)
    // Still visible well past the host's 4 s default → the 8 s undo duration is what applies (margin for the
    // real time that shouldAdvanceTime adds). Literals: 7500 + 500 = 8000 ms in total.
    act(() => {
      vi.advanceTimersByTime(7500)
    })
    expect(screen.getByText('deleted third')).toBeInTheDocument()
    act(() => {
      vi.advanceTimersByTime(500)
    })
    act(() => {
      vi.advanceTimersByTime(1000) // sonner's exit animation
    })
    expect(screen.queryByText('deleted third')).not.toBeInTheDocument()
  })

  it('U-UNDO-09 a rejecting undo shows th.undo.failed and drops the entry', async () => {
    const { api, state } = setup()
    const bad = entry('bad', { undo: () => Promise.reject(new Error('boom')) })
    act(() => api().push(bad))
    await act(() => api().undo())
    expect(bad.undo).toHaveBeenCalledTimes(1)
    expect(await screen.findByText(th.undo.failed)).toBeInTheDocument()
    expect(state()).toBe('false/false')
  })
})
