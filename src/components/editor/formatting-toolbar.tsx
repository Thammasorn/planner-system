'use client'
// src/components/editor/formatting-toolbar.tsx — the editor's formatting toolbar (FR-1502, M11-D29): BlockNote's
// default items (getFormattingToolbarItems — kept as they are, S5.1 spike) plus "สมการ", which turns the selected
// text into an inline equation whose source is that text. Mounted through `FormattingToolbarController` with
// BlockNoteView's own toolbar switched off (`formattingToolbar={false}`).
import {
  FormattingToolbar,
  type FormattingToolbarProps,
  getFormattingToolbarItems,
  useBlockNoteEditor,
  useComponentsContext,
  useEditorState,
} from '@blocknote/react'
import Functions from '@mui/icons-material/Functions'
import type { JSX } from 'react'
import { th } from '@/i18n/th'
import { EQUATION_LATEX_MAX } from '@/lib/schemas/page-content'
import type { AppEditor, AppSchema } from './schema'

type EquationEditor = Pick<AppEditor, 'isEditable' | 'getSelectedText' | 'insertInlineContent'>

/** The selected text as the source of an inline equation, or null when the selection cannot become one. */
export function equationSourceOfSelection(editor: Pick<AppEditor, 'isEditable' | 'getSelectedText'>): string | null {
  if (!editor.isEditable) return null
  const text = editor.getSelectedText()
  if (text.trim() === '' || text.length > EQUATION_LATEX_MAX || /[\r\n]/.test(text)) return null
  return text
}

/** Replaces the selection by `inlineEquation { latex: selectedText }` (AC-1502: the text around stays). */
export function insertEquationFromSelection(editor: EquationEditor): boolean {
  const latex = equationSourceOfSelection(editor)
  if (latex === null) return false
  editor.insertInlineContent([{ type: 'inlineEquation', props: { latex } }])
  return true
}

export function EquationButton(): JSX.Element | null {
  const editor = useBlockNoteEditor<AppSchema['blockSchema'], AppSchema['inlineContentSchema'], AppSchema['styleSchema']>()
  const Components = useComponentsContext()
  const source = useEditorState({
    editor,
    selector: ({ editor: e }) => {
      if (e.prosemirrorState.selection.empty) return null
      const blocks = e.getSelection()?.blocks ?? [e.getTextCursorPosition().block]
      if (!blocks.some((b) => Array.isArray(b.content))) return null // not tables, not content-less blocks
      return equationSourceOfSelection(e)
    },
  })
  if (source === null || !Components) return null
  return (
    <Components.FormattingToolbar.Button
      className="bn-button"
      data-test="inlineEquation"
      label={th.editor.equation.toolbar}
      mainTooltip={th.editor.equation.toolbar}
      icon={<Functions fontSize="small" />}
      onClick={() => {
        insertEquationFromSelection(editor)
      }}
    />
  )
}

export function AppFormattingToolbar(props: FormattingToolbarProps): JSX.Element {
  return (
    <FormattingToolbar {...props}>
      {getFormattingToolbarItems(props.blockTypeSelectItems)}
      <EquationButton key="inlineEquation" />
    </FormattingToolbar>
  )
}
