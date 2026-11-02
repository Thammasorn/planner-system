'use client'
// src/components/editor/inline/inline-equation.tsx — inline LaTeX (FR-1502/1503/1504, M11-D29): `latex` only, no
// content; flows with the surrounding text. Click (edit mode) → the popover editor (Enter confirms, Esc cancels);
// rendered by the lazily loaded KaTeX; invalid → the error state. `updateInlineContent` replaces the node in place.
import { createReactInlineContentSpec } from '@blocknote/react'
import { usePageEditor } from '../PageEditorContext'
import { EditableEquation } from '../math/EditableEquation'
import { takeInlineEquationOpen } from '../math/open-request'

export const InlineEquation = createReactInlineContentSpec(
  {
    type: 'inlineEquation',
    propSchema: { latex: { default: '' } },
    content: 'none',
  },
  {
    render: function InlineEquationRender({ inlineContent, updateInlineContent, editor }) {
      const ctx = usePageEditor()
      const editable = ctx ? ctx.editable : editor.isEditable
      const latex = inlineContent.props.latex
      return (
        <EditableEquation
          latex={latex}
          display={false}
          testId="inline-equation"
          editable={editable}
          takeAutoOpen={() => latex === '' && takeInlineEquationOpen()}
          onChange={(next) => updateInlineContent({ type: 'inlineEquation', props: { latex: next } })}
          onClosed={() => editor.focus()}
        />
      )
    },
    toExternalHTML: ({ inlineContent }) => <code>{inlineContent.props.latex}</code>,
  },
)
