'use client'
// src/components/editor/blocks/project-workload/spec.tsx — the "ภาระทีมโปรเจค" live block (FR-1303, X78, M10-D4/D8/
// D11). One view prop; the members × 8 weeks table is read through authz at render time (M9 masking).
// `meta.selectable: false` → ProseMirror ignores every event from inside the live view (S3.1 spike; LiveBlockFrame).
import { createReactBlockSpec } from '@blocknote/react'
import { th } from '@/i18n/th'
import { resolveWorkloadProps, WORKLOAD_VIEW_DEFAULTS } from '@/lib/schemas/page-content'
import { usePageEditor } from '../../PageEditorContext'
import { ProjectWorkloadBlock } from './ProjectWorkloadBlock'

export const createProjectWorkloadBlock = createReactBlockSpec(
  {
    type: 'projectWorkload',
    content: 'none',
    propSchema: {
      view: { default: WORKLOAD_VIEW_DEFAULTS.view, values: ['ALL', 'COMMITTED', 'AT_RISK'] as const },
    },
  },
  {
    meta: { selectable: false },
    render: function ProjectWorkloadRender({ block, editor }) {
      const ctx = usePageEditor()
      return (
        <ProjectWorkloadBlock
          pageId={ctx?.pageId ?? null}
          props={resolveWorkloadProps(block.props)}
          editable={ctx ? ctx.editable : editor.isEditable}
          onPropsChange={(next) => {
            const current = editor.getBlock(block.id)
            if (current) editor.updateBlock(current, { props: next })
          }}
        />
      )
    },
    // copy to other apps: the title only, never workload data
    toExternalHTML: () => <p>{th.editor.liveBlocks.workloadTitle}</p>,
  },
)
