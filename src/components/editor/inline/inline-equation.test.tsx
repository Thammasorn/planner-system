// M11 S5.7 — inline equation + the editable equation wrapper (FR-1502/1503/1506, M11-D29): spec shape (latex only,
// no content), copy to other apps = the source, click (edit mode) → popover → confirm writes once and only on change,
// Esc keeps the source, read-only has no popover, the slash item's request opens the popover on mount.
import { BlockNoteEditor } from '@blocknote/core'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { th } from '@/i18n/th'
import { EditableEquation } from '../math/EditableEquation'
import { requestInlineEquationOpen, takeInlineEquationOpen } from '../math/open-request'
import { schema } from '../schema'

const E = th.editor.equation

function mount(o: { latex?: string; editable?: boolean; takeAutoOpen?: () => boolean } = {}) {
  const onChange = vi.fn()
  const onClosed = vi.fn()
  render(
    <EditableEquation
      latex={o.latex ?? 'a'}
      display={false}
      testId="inline-equation"
      editable={o.editable ?? true}
      onChange={onChange}
      onClosed={onClosed}
      {...(o.takeAutoOpen ? { takeAutoOpen: o.takeAutoOpen } : {})}
    />,
  )
  return { onChange, onClosed }
}
const field = () => screen.getByRole('textbox', { name: E.label })

describe('inlineEquation spec', () => {
  it('is inline content with only `latex` and no content', () => {
    const spec = schema.inlineContentSpecs.inlineEquation
    expect(spec?.config).toEqual({
      type: 'inlineEquation',
      content: 'none',
      propSchema: { latex: { default: '' } },
    })
  })

  it('external HTML (other apps) carries the source; the document keeps it in props', () => {
    const editor = BlockNoteEditor.create({
      schema,
      initialContent: [
        {
          type: 'paragraph',
          content: ['ก ', { type: 'inlineEquation', props: { latex: 'E=mc^2' } }, ' ข'],
        },
      ],
    })
    expect(editor.document[0]!.content).toEqual([
      { type: 'text', text: 'ก ', styles: {} },
      { type: 'inlineEquation', props: { latex: 'E=mc^2' } },
      { type: 'text', text: ' ข', styles: {} },
    ])
    expect(editor.blocksToHTMLLossy(editor.document)).toContain('<code>E=mc^2</code>')
  })
})

describe('EditableEquation (inline)', () => {
  it('click → popover; Enter with a new source → onChange once, closed, focus back', () => {
    const { onChange, onClosed } = mount({ latex: 'a' })
    fireEvent.click(screen.getByRole('button', { name: `${E.label}: a` }))
    fireEvent.change(field(), { target: { value: 'b^2' } })
    fireEvent.keyDown(field(), { key: 'Enter', code: 'Enter' })
    expect(onChange).toHaveBeenCalledExactlyOnceWith('b^2')
    expect(onClosed).toHaveBeenCalledOnce()
  })

  it('confirm without a change writes nothing (no empty undo step)', () => {
    const { onChange } = mount({ latex: 'a' })
    fireEvent.click(screen.getByRole('button'))
    fireEvent.keyDown(field(), { key: 'Enter', code: 'Enter' })
    expect(onChange).not.toHaveBeenCalled()
  })

  it('Esc restores: nothing written', () => {
    const { onChange, onClosed } = mount({ latex: 'a' })
    fireEvent.click(screen.getByRole('button'))
    fireEvent.change(field(), { target: { value: 'zzz' } })
    fireEvent.keyDown(field(), { key: 'Escape', code: 'Escape' })
    expect(onChange).not.toHaveBeenCalled()
    expect(onClosed).toHaveBeenCalledOnce()
  })

  it('read-only: no button, no popover', () => {
    mount({ latex: 'a', editable: false })
    expect(screen.queryByRole('button')).toBeNull()
    fireEvent.click(screen.getByTestId('inline-equation'))
    expect(screen.queryByRole('textbox')).toBeNull()
  })

  it('the slash item’s request opens the popover of the equation that mounts (once)', () => {
    requestInlineEquationOpen()
    act(() => {
      mount({ latex: '', takeAutoOpen: () => takeInlineEquationOpen() })
    })
    expect(field()).toHaveFocus()
    expect(takeInlineEquationOpen()).toBe(false) // consumed
  })

  it('no request → closed on mount', () => {
    mount({ latex: '', takeAutoOpen: () => takeInlineEquationOpen() })
    expect(screen.queryByRole('textbox')).toBeNull()
  })
})
