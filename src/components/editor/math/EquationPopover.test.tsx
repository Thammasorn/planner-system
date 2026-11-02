// M11 S5.7 — EquationPopover (FR-1503, X49): monospace field ≤ 2,000 chars, live preview after 150 ms, inline
// Enter = confirm, block Cmd/Ctrl+Enter = confirm and Enter = new line, Esc = cancel (stored source unchanged), a
// click outside confirms.
import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { th } from '@/i18n/th'
import { EQUATION_LATEX_MAX } from '@/lib/schemas/page-content'
import { EquationPopover, PREVIEW_DEBOUNCE_MS } from './EquationPopover'

const E = th.editor.equation

function mount(display: boolean, initial = 'a') {
  const anchor = document.createElement('span')
  document.body.append(anchor)
  const onConfirm = vi.fn()
  const onCancel = vi.fn()
  render(
    <EquationPopover anchorEl={anchor} initial={initial} display={display} onConfirm={onConfirm} onCancel={onCancel} />,
  )
  const field = screen.getByRole('textbox', { name: E.label })
  const type = (v: string) => fireEvent.change(field, { target: { value: v } })
  return { field, type, onConfirm, onCancel }
}

describe('EquationPopover', () => {
  afterEach(() => vi.useRealTimers())

  it('starts from the stored source, focused, with the length limit and the key hint', () => {
    const { field } = mount(true, String.raw`\alpha`)
    expect(field).toHaveValue(String.raw`\alpha`)
    expect(field).toHaveFocus()
    expect(field).toHaveAttribute('maxlength', String(EQUATION_LATEX_MAX))
    expect(screen.getByText(E.confirmHintBlock)).toBeInTheDocument()
  })

  it('inline: Enter confirms the typed source', () => {
    const { field, type, onConfirm } = mount(false)
    expect(screen.getByText(E.confirmHintInline)).toBeInTheDocument()
    type('E=mc^2')
    fireEvent.keyDown(field, { key: 'Enter', code: 'Enter' })
    expect(onConfirm).toHaveBeenCalledExactlyOnceWith('E=mc^2')
  })

  it('block: Enter is a new line (no confirm); Cmd+Enter and Ctrl+Enter confirm', () => {
    const { field, type, onConfirm } = mount(true)
    type('x')
    expect(fireEvent.keyDown(field, { key: 'Enter', code: 'Enter' })).toBe(true) // default kept → newline
    expect(onConfirm).not.toHaveBeenCalled()
    fireEvent.keyDown(field, { key: 'Enter', code: 'Enter', metaKey: true })
    fireEvent.keyDown(field, { key: 'Enter', code: 'NumpadEnter', ctrlKey: true })
    expect(onConfirm).toHaveBeenCalledTimes(2)
    expect(onConfirm).toHaveBeenLastCalledWith('x')
  })

  it('Esc cancels: the stored source is untouched', () => {
    const { field, type, onConfirm, onCancel } = mount(false, 'old')
    type('new')
    fireEvent.keyDown(field, { key: 'Escape', code: 'Escape' })
    expect(onCancel).toHaveBeenCalledOnce()
    expect(onConfirm).not.toHaveBeenCalled()
  })

  it('the preview follows the field 150 ms after typing stops', () => {
    vi.useFakeTimers()
    const { type } = mount(false, 'a')
    const preview = () => screen.getByTestId('equation-preview')
    type('b')
    act(() => void vi.advanceTimersByTime(PREVIEW_DEBOUNCE_MS - 1))
    expect(preview()).toHaveAttribute('data-latex', 'a')
    act(() => void vi.advanceTimersByTime(1))
    expect(preview()).toHaveAttribute('data-latex', 'b')
  })

  it('a click outside (backdrop) confirms what was typed', () => {
    const { type, onConfirm } = mount(false, 'a')
    type('c')
    const backdrop = document.querySelector('.MuiBackdrop-root')
    expect(backdrop).not.toBeNull()
    fireEvent.click(backdrop!)
    expect(onConfirm).toHaveBeenCalledExactlyOnceWith('c')
  })
})
