// M10-D8 (revised by the S3.1 spike): the frame runs the app undo for Mod+Z / Mod+Shift+Z outside form fields, leaves
// Mod+K to the palette's window listener, and never stops propagation (React handlers inside keep working).
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { UndoContext, type UndoApi } from '@/components/undo/useUndo'
import { th } from '@/i18n/th'
import { LiveBlockFrame } from './LiveBlockFrame'

function mount(opts: { inEditor?: boolean } = {}) {
  const api: UndoApi = {
    push: vi.fn(),
    undo: vi.fn(() => Promise.resolve()),
    redo: vi.fn(() => Promise.resolve()),
    undoEntry: vi.fn(() => Promise.resolve()),
    canUndo: true,
    canRedo: true,
  }
  const onClick = vi.fn()
  const frame = (
    <LiveBlockFrame title={th.editor.liveBlocks.taskViewTitle} projectName="POS">
      <div tabIndex={0} data-testid="row">
        row
      </div>
      <input aria-label="field" />
      <button type="button" onClick={onClick}>
        go
      </button>
    </LiveBlockFrame>
  )
  render(
    <UndoContext value={api}>
      {opts.inEditor ? (
        // the BlockNote root (`.bn-editor`) is contenteditable="true" around every block
        <div className="bn-editor" contentEditable suppressContentEditableWarning>
          {frame}
        </div>
      ) : (
        frame
      )}
    </UndoContext>,
  )
  return { api, onClick }
}

describe('LiveBlockFrame', () => {
  it('is a non-editable region named by title and project', () => {
    mount()
    const region = screen.getByRole('region', {
      name: th.editor.liveBlocks.regionLabel(th.editor.liveBlocks.taskViewTitle, 'POS'),
    })
    expect(region).toHaveAttribute('contenteditable', 'false')
    expect(region).toHaveAttribute('data-live-block')
  })

  it('Mod+Z / Mod+Shift+Z on a row run the app undo / redo', () => {
    const { api } = mount()
    const row = screen.getByTestId('row')
    const z = fireEvent.keyDown(row, { key: 'z', code: 'KeyZ', metaKey: true })
    expect(z).toBe(false) // default prevented
    expect(api.undo).toHaveBeenCalledOnce()
    fireEvent.keyDown(row, { key: 'Z', code: 'KeyZ', ctrlKey: true, shiftKey: true })
    expect(api.redo).toHaveBeenCalledOnce()
  })

  it('Mod+Z on a control inside the editor root still runs the app undo (the root is contenteditable)', () => {
    const { api } = mount({ inEditor: true })
    const z = fireEvent.keyDown(screen.getByRole('button', { name: 'go' }), {
      key: 'z',
      code: 'KeyZ',
      metaKey: true,
    })
    expect(z).toBe(false)
    expect(api.undo).toHaveBeenCalledOnce()
    const inField = fireEvent.keyDown(screen.getByLabelText('field'), {
      key: 'z',
      code: 'KeyZ',
      metaKey: true,
    })
    expect(inField).toBe(true)
    expect(api.undo).toHaveBeenCalledOnce()
  })

  it('Mod+Z in a form field is left to the field', () => {
    const { api } = mount()
    const notPrevented = fireEvent.keyDown(screen.getByLabelText('field'), {
      key: 'z',
      code: 'KeyZ',
      metaKey: true,
    })
    expect(notPrevented).toBe(true)
    expect(api.undo).not.toHaveBeenCalled()
  })

  it('a press on the frame surface keeps the caret out of the page; controls keep their default', () => {
    mount({ inEditor: true })
    expect(fireEvent.mouseDown(screen.getByText(th.editor.liveBlocks.taskViewTitle))).toBe(false)
    expect(fireEvent.mouseDown(screen.getByRole('button', { name: 'go' }))).toBe(true)
    expect(fireEvent.mouseDown(screen.getByLabelText('field'))).toBe(true)
    expect(fireEvent.mouseDown(screen.getByTestId('row'))).toBe(true) // focusable (tabIndex) rows and cards
  })

  it('Mod+K reaches the window untouched; clicks inside reach React', () => {
    const { onClick } = mount()
    const onWindow = vi.fn((e: KeyboardEvent) => e.defaultPrevented)
    window.addEventListener('keydown', onWindow)
    fireEvent.keyDown(screen.getByTestId('row'), { key: 'k', code: 'KeyK', metaKey: true })
    window.removeEventListener('keydown', onWindow)
    expect(onWindow).toHaveReturnedWith(false)
    fireEvent.click(screen.getByRole('button', { name: 'go' }))
    expect(onClick).toHaveBeenCalledOnce()
  })
})
