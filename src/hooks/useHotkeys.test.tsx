import { fireEvent, render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { HOTKEYS } from '@/lib/keys'
import { useHotkeys } from './useHotkeys'

function Harness({
  handler,
  allowInEditable,
}: {
  handler: (e: KeyboardEvent) => void
  allowInEditable?: boolean
}) {
  useHotkeys([{ hotkey: HOTKEYS.toggleSidebar, handler, ...(allowInEditable ? { allowInEditable } : {}) }])
  return (
    <div>
      <input aria-label="field" />
      <textarea aria-label="area" />
      <div contentEditable="true" suppressContentEditableWarning data-testid="ce">
        x
      </div>
    </div>
  )
}

const shortcut = { code: 'Backslash', key: 'ฃ', ctrlKey: true }

describe('useHotkeys', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('calls the handler once and prevents the default action', () => {
    const handler = vi.fn()
    render(<Harness handler={handler} />)
    const notCancelled = fireEvent.keyDown(document.body, shortcut)
    expect(handler).toHaveBeenCalledTimes(1)
    expect(notCancelled).toBe(false)
    const [[event]] = handler.mock.calls as [[KeyboardEvent]]
    expect(event.defaultPrevented).toBe(true)
  })

  it('ignores the shortcut in editable targets', () => {
    const handler = vi.fn()
    const { getByLabelText, getByTestId } = render(<Harness handler={handler} />)
    for (const el of [getByLabelText('field'), getByLabelText('area'), getByTestId('ce')]) {
      el.focus()
      fireEvent.keyDown(el, shortcut)
    }
    expect(handler).not.toHaveBeenCalled()
  })

  it('fires in editable targets when allowInEditable is set', () => {
    const handler = vi.fn()
    const { getByLabelText } = render(<Harness handler={handler} allowInEditable />)
    fireEvent.keyDown(getByLabelText('field'), shortcut)
    expect(handler).toHaveBeenCalledTimes(1)
  })

  it('skips events another listener already handled', () => {
    const handler = vi.fn()
    const pre = (e: Event) => e.preventDefault()
    document.addEventListener('keydown', pre, { capture: true })
    try {
      render(<Harness handler={handler} />)
      fireEvent.keyDown(document.body, shortcut)
      expect(handler).not.toHaveBeenCalled()
    } finally {
      document.removeEventListener('keydown', pre, { capture: true })
    }
  })

  it('removes the listener on unmount', () => {
    const handler = vi.fn()
    const { unmount } = render(<Harness handler={handler} />)
    unmount()
    fireEvent.keyDown(document.body, shortcut)
    expect(handler).not.toHaveBeenCalled()
  })
})
