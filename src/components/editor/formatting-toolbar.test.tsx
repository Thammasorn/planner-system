// M11 S5.8 — the formatting toolbar's "สมการ" (FR-1502, AC-1502) and the lazy KaTeX check (M11-D30, NFR-12):
// BlockNote's default items are kept and "สมการ" is appended; the selected text becomes an inline equation with
// that source and the text around it stays; a real editor view of a document without equations never calls
// loadKatex, while one with an equation does.
import { BlockNoteEditor } from '@blocknote/core'
import { BlockNoteView } from '@blocknote/mantine'
import { getFormattingToolbarItems } from '@blocknote/react'
import { render, screen, waitFor } from '@testing-library/react'
import { isValidElement, type ReactElement } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { loadKatex } from '@/lib/math/load-katex'
import {
  AppFormattingToolbar,
  EquationButton,
  equationSourceOfSelection,
  insertEquationFromSelection,
} from './formatting-toolbar'
import { type AppEditor, schema } from './schema'

vi.mock('@/lib/math/load-katex', async (importOriginal) => {
  const orig = await importOriginal<typeof import('@/lib/math/load-katex')>()
  return { ...orig, loadKatex: vi.fn(orig.loadKatex) }
})

function editorWith(text: string): AppEditor {
  return BlockNoteEditor.create({ schema, initialContent: [{ type: 'paragraph', content: text }] })
}

/** Selects `needle` inside the first paragraph (ProseMirror positions: doc › blockGroup › blockContainer › paragraph). */
function select(editor: AppEditor, needle: string): void {
  const tt = editor._tiptapEditor
  let from = -1
  tt.state.doc.descendants((node, pos) => {
    if (from === -1 && node.isText && node.text?.includes(needle)) from = pos + node.text.indexOf(needle)
  })
  tt.commands.setTextSelection({ from, to: from + needle.length })
}

describe('"สมการ" in the formatting toolbar', () => {
  it('keeps every default item and appends the equation button', () => {
    const el = AppFormattingToolbar({}) as ReactElement<{ children: unknown[] }>
    const [defaults, extra] = el.props.children as [ReactElement[], ReactElement]
    expect(defaults).toHaveLength(getFormattingToolbarItems().length)
    expect(isValidElement(extra) && extra.type).toBe(EquationButton)
  })

  it('the selected text becomes an inline equation with that source; the text around stays (AC-1502)', () => {
    const editor = editorWith('พลังงาน E=mc^2 ของไอน์สไตน์')
    select(editor, 'E=mc^2')
    expect(equationSourceOfSelection(editor)).toBe('E=mc^2')
    expect(insertEquationFromSelection(editor)).toBe(true)
    expect(editor.document[0]!.content).toEqual([
      { type: 'text', text: 'พลังงาน ', styles: {} },
      { type: 'inlineEquation', props: { latex: 'E=mc^2' } },
      { type: 'text', text: ' ของไอน์สไตน์', styles: {} },
    ])
  })

  it('no selection, blank selection or read-only → nothing to convert', () => {
    const editor = editorWith('a  b')
    expect(equationSourceOfSelection(editor)).toBeNull()
    select(editor, '  ')
    expect(insertEquationFromSelection(editor)).toBe(false)
    select(editor, 'a')
    editor.isEditable = false
    expect(equationSourceOfSelection(editor)).toBeNull()
  })
})

describe('lazy KaTeX (M11-D30)', () => {
  beforeEach(() => {
    vi.mocked(loadKatex).mockClear()
    // jsdom has no matchMedia (Mantine reads the colour scheme)
    vi.stubGlobal(
      'matchMedia',
      vi.fn(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() })),
    )
  })
  afterEach(() => vi.unstubAllGlobals())

  it('a real editor view without equations never loads KaTeX; with one it does', async () => {
    const plain = BlockNoteEditor.create({
      schema,
      initialContent: [
        { type: 'heading', props: { level: 1 }, content: 'หัวข้อ' },
        { type: 'paragraph', content: 'ข้อความ' },
      ],
    })
    const { unmount } = render(<BlockNoteView editor={plain} theme="light" formattingToolbar={false} slashMenu={false} />)
    await waitFor(() => expect(screen.getByText('ข้อความ')).toBeInTheDocument())
    expect(loadKatex).not.toHaveBeenCalled()
    unmount()

    const math = BlockNoteEditor.create({
      schema,
      initialContent: [{ type: 'equation', props: { latex: 'x^2' } }],
    })
    render(<BlockNoteView editor={math} theme="light" formattingToolbar={false} slashMenu={false} />)
    await waitFor(() => expect(loadKatex).toHaveBeenCalled())
    await waitFor(() => expect(screen.getByTestId('equation')).toHaveAttribute('data-state', 'ok'))
  })
})
