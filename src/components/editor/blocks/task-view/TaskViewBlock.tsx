'use client'
// src/components/editor/blocks/task-view/TaskViewBlock.tsx — body of the "มุมมองงาน" live block (FR-1301/1302/1304,
// M10-D3/D7/D31). Reads the page's embed answer (authz on the server); a wiki page shows the placeholder; a project
// page renders EmbeddedTasks. Nothing from the answer is written into the document — only the view props are.
import Alert from '@mui/material/Alert'
import Button from '@mui/material/Button'
import Skeleton from '@mui/material/Skeleton'
import type { JSX } from 'react'
import { EmptyState } from '@/components/common/EmptyState'
import { EmbeddedTasks } from '@/components/tasks/embed/EmbeddedTasks'
import { useEmbedTasks } from '@/components/tasks/embed/useEmbedTasks'
import { th } from '@/i18n/th'
import type { TaskViewProps } from '@/lib/schemas/page-content'
import { LiveBlockFrame } from '../live/LiveBlockFrame'

export interface TaskViewBlockProps {
  /** null: no stored page yet (a new task body) → the placeholder. */
  pageId: string | null
  props: TaskViewProps
  /** The page editor is editable → the config toolbar (M10-D7). */
  editable: boolean
  onPropsChange: (next: Partial<TaskViewProps>) => void
}

const L = th.editor.liveBlocks

export function TaskViewBlock(p: TaskViewBlockProps): JSX.Element {
  if (p.pageId === null) {
    return (
      <LiveBlockFrame title={L.taskViewTitle}>
        <EmptyState title={L.wikiOnly} />
      </LiveBlockFrame>
    )
  }
  return <TaskViewBody {...p} pageId={p.pageId} />
}

function TaskViewBody(p: TaskViewBlockProps & { pageId: string }): JSX.Element {
  const q = useEmbedTasks(p.pageId)
  if (q.isPending) {
    return (
      <LiveBlockFrame title={L.taskViewTitle}>
        <Skeleton variant="rounded" height={96} />
        <span role="status">{L.loading}</span>
      </LiveBlockFrame>
    )
  }
  if (q.isError) {
    return (
      <LiveBlockFrame title={L.taskViewTitle}>
        <Alert
          severity="error"
          action={
            <Button color="inherit" size="small" onClick={() => void q.refetch()}>
              {L.retry}
            </Button>
          }
        >
          {L.error}
        </Alert>
      </LiveBlockFrame>
    )
  }
  const r = q.data
  if (r.kind === 'wiki') {
    return (
      <LiveBlockFrame title={L.taskViewTitle}>
        <EmptyState title={L.wikiOnly} />
      </LiveBlockFrame>
    )
  }
  return (
    <LiveBlockFrame title={L.taskViewTitle} projectName={r.projectName}>
      <EmbeddedTasks
        projectId={r.projectId}
        projectName={r.projectName}
        tasksHref={r.tasksHref}
        props={p.props}
        editable={p.editable}
        onPropsChange={p.onPropsChange}
      />
    </LiveBlockFrame>
  )
}
