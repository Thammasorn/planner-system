'use client'
// src/components/editor/blocks/task-view/spec.tsx — the "มุมมองงาน" live block (FR-1301/1302/1304, X78, M10-D4/D8).
// Props are view config only (no project id, no task data); the data is read through authz at render time.
// `meta.selectable: false` → BlockNote's node view stops every event from inside, so ProseMirror never acts on the
// live view's keys, clicks, pastes or drags (S3.1 spike; see LiveBlockFrame).
import { createReactBlockSpec } from '@blocknote/react'
import { th } from '@/i18n/th'
import { resolveTaskViewProps, TASK_VIEW_DEFAULTS, TASK_VIEW_LIMITS } from '@/lib/schemas/page-content'
import { usePageEditor } from '../../PageEditorContext'
import { TaskViewBlock } from './TaskViewBlock'

export const createTaskViewBlock = createReactBlockSpec(
  {
    type: 'taskView',
    content: 'none',
    propSchema: {
      view: { default: TASK_VIEW_DEFAULTS.view, values: ['LIST', 'BOARD'] as const },
      assigneeId: { default: '' },
      milestoneId: { default: '' },
      statusIds: { default: '' },
      showDone: { default: false },
      limit: { default: TASK_VIEW_DEFAULTS.limit, values: TASK_VIEW_LIMITS },
    },
  },
  {
    meta: { selectable: false },
    render: function TaskViewRender({ block, editor }) {
      const ctx = usePageEditor()
      return (
        <TaskViewBlock
          pageId={ctx?.pageId ?? null}
          props={resolveTaskViewProps(block.props)}
          editable={ctx ? ctx.editable : editor.isEditable}
          onPropsChange={(next) => {
            const current = editor.getBlock(block.id)
            if (current) editor.updateBlock(current, { props: next })
          }}
        />
      )
    },
    // copy to other apps: the title only, never task data
    toExternalHTML: () => <p>{th.editor.liveBlocks.taskViewTitle}</p>,
  },
)
