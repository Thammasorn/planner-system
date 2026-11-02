'use client'
// src/components/editor/blocks/equation/spec.tsx — the block equation (FR-1501/1503/1504, M11-D29): `latex` only,
// centred display math rendered by the lazily loaded KaTeX (src/lib/math/load-katex.ts); click (edit mode) → the
// popover editor (Cmd/Ctrl+Enter confirms, Enter is a new line, Esc cancels); invalid LaTeX → the error state.
// Deleting the block / Cmd+Z is the editor's own behaviour (the block stays selectable).
import { createReactBlockSpec } from '@blocknote/react'
import { usePageEditor } from '../../PageEditorContext'
import { EditableEquation } from '../../math/EditableEquation'
import { takeBlockEquationOpen } from '../../math/open-request'

export const createEquationBlock = createReactBlockSpec(
  {
    type: 'equation',
    content: 'none',
    propSchema: { latex: { default: '' } },
  },
  {
    render: function EquationRender({ block, editor }) {
      const ctx = usePageEditor()
      return (
        <EditableEquation
          latex={block.props.latex}
          display
          testId="equation"
          editable={ctx ? ctx.editable : editor.isEditable}
          takeAutoOpen={() => takeBlockEquationOpen(block.id)}
          onChange={(latex) => {
            const current = editor.getBlock(block.id)
            if (current) editor.updateBlock(current, { props: { latex } })
          }}
          onClosed={() => editor.focus()}
        />
      )
    },
    // copy to other apps: the source (FR-1506); internal copies keep the block via blocknote/html
    toExternalHTML: ({ block }) => <pre>{block.props.latex}</pre>,
  },
)
