'use client'
import { useEffect, useMemo, useRef, useState, type MouseEvent } from 'react'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Divider from '@mui/material/Divider'
import IconButton from '@mui/material/IconButton'
import Skeleton from '@mui/material/Skeleton'
import Typography from '@mui/material/Typography'
import { useTheme } from '@mui/material/styles'
import useMediaQuery from '@mui/material/useMediaQuery'
import CloseOutlined from '@mui/icons-material/CloseOutlined'
import DeleteOutlined from '@mui/icons-material/DeleteOutlined'
import NorthEastOutlined from '@mui/icons-material/NorthEastOutlined'
import { useQueryClient } from '@tanstack/react-query'
import Link from '@/components/Link'
import { InlineEditText } from '@/components/common/InlineEditText'
import { TaskBody } from '@/components/editor/TaskBody'
import { useHotkeys } from '@/hooks/useHotkeys'
import { th } from '@/i18n/th'
import type { ProjectTasksResponse } from '@/lib/contracts/tasks'
import { patchTaskHasBody } from '@/lib/invalidate'
import { rememberScroll } from '@/lib/nav/scroll-memory'
import { isPlainClick, taskPageHref } from '@/lib/nav/task-href'
import { buildTaskRows } from '@/lib/tasks/tree'
import { closeTaskPanel, useTaskParam } from './task-param'
import { TaskProperties } from './TaskProperties'
import { useProjectTasks } from './useProjectTasks'
import { useTaskBodyView } from './useTaskBodyView'
import { errorMessage, useTaskMutations } from './useTaskMutations'

const PANEL_SELECTOR = '[data-testid="task-panel"]'

/** The task's list row or board card, else the list/board's current roving tab stop. */
function focusTask(taskId: string): void {
  const id = CSS.escape(taskId)
  const el =
    document.querySelector<HTMLElement>(`[role="row"][data-task-id="${id}"], [data-board-card="${id}"]`) ??
    document.querySelector<HTMLElement>(
      '[role="treegrid"] [role="row"][tabindex="0"], [data-board-card][tabindex="0"]',
    )
  el?.focus()
}

/**
 * Close the panel; when focus was inside it (Esc, ✕, ลบงาน) put it back on the task's row/card so keyboard users
 * keep their place instead of landing on <body> (FR-611, §8.9). Esc from the list leaves focus where it is.
 */
function closePanel(taskId: string): void {
  const fromPanel = document.activeElement?.closest(PANEL_SELECTOR) != null
  closeTaskPanel()
  if (fromPanel) setTimeout(() => focusTask(taskId), 0)
}

/**
 * Task detail panel (FR-601, FR-611, FR-684, M3-D17, M6.1-D16): an `<aside>` beside the list (not an overlay), opened
 * by `?task=<id>`; Esc or ✕ closes. Reads the task from the project-tasks query — an id not in it shows only
 * "ไม่พบงาน". Header: parent path, name, "เปิดเป็นหน้า" (→ /t/<id>), ✕; then the shared TaskProperties and the compact
 * body (same editor and data as the task page). Width `--panel-width`; a full-screen sheet below md.
 */
export function TaskPanel({ projectId }: { projectId: string }) {
  const taskId = useTaskParam()
  const q = useProjectTasks(projectId)
  const onEscape = () => {
    if (taskId !== null) closePanel(taskId)
  }
  useHotkeys([{ hotkey: { code: 'Escape', key: 'Escape' }, handler: onEscape }], {
    enabled: taskId !== null,
  })
  // Below md there is no room beside the list: the panel becomes a full-screen sheet over it (SPEC §7 browser
  // support) and takes focus, so Esc / ✕ / Tab work from inside it and closing returns focus to the row.
  const sheet = useMediaQuery(useTheme().breakpoints.down('md'))
  const ref = useRef<HTMLElement>(null)
  const ready = q.data !== undefined
  useEffect(() => {
    if (sheet && taskId !== null && ready) ref.current?.focus()
  }, [sheet, taskId, ready])
  if (taskId === null || !q.data) return null
  return (
    <Box
      ref={ref}
      component="aside"
      aria-label={th.tasks.panel.label}
      data-testid="task-panel"
      data-sheet={sheet ? 'true' : undefined}
      tabIndex={sheet ? -1 : undefined}
      sx={{
        width: { xs: '100%', md: 'var(--panel-width)' },
        flex: 'none',
        alignSelf: 'flex-start',
        position: { xs: 'fixed', md: 'sticky' },
        inset: { xs: 0, md: 'auto' },
        zIndex: { xs: 'appBar', md: 'auto' },
        top: { md: 'calc(var(--header-height) + var(--space-2))' },
        maxHeight: { md: 'calc(100vh - var(--header-height) - var(--space-6))' },
        overflowY: 'auto',
        overscrollBehavior: 'contain',
        border: { xs: 0, md: '1px solid var(--border-subtle)' },
        borderRadius: { xs: 0, md: 'var(--radius-lg)' },
        bgcolor: 'var(--surface)',
        p: 2,
        outline: 'none',
      }}
    >
      <PanelBody key={taskId} projectId={projectId} taskId={taskId} data={q.data} />
    </Box>
  )
}

function CloseButton({ taskId }: { taskId: string }) {
  return (
    <IconButton aria-label={th.tasks.panel.close} onClick={() => closePanel(taskId)} size="small">
      <CloseOutlined fontSize="small" />
    </IconButton>
  )
}

function PanelBody({
  projectId,
  taskId,
  data,
}: {
  projectId: string
  taskId: string
  data: ProjectTasksResponse
}) {
  const m = useTaskMutations(projectId)
  const qc = useQueryClient()
  const rows = useMemo(() => buildTaskRows(data.tasks), [data.tasks])
  const task = rows.find((r) => r.id === taskId)
  const body = useTaskBodyView(taskId, undefined, task !== undefined)
  const [statusSlot, setStatusSlot] = useState<HTMLElement | null>(null)

  if (!task) {
    return (
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Typography>{th.tasks.panel.notFound}</Typography>
        <CloseButton taskId={taskId} />
      </Box>
    )
  }
  const { canEdit } = data.viewer

  return (
    <Box sx={{ display: 'grid', gap: 2 }}>
      <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1 }}>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          {task.parentPath.length > 0 ? (
            <Typography
              component="p"
              sx={{ m: 0, color: 'var(--text-secondary)', fontSize: 'var(--font-xs)' }}
            >
              {th.tasks.groups.parentPath(task.parentPath.join(' › '))}
            </Typography>
          ) : null}
          <InlineEditText
            value={task.name}
            label={th.tasks.panel.name}
            disabled={!canEdit}
            maxLength={500}
            variant="h6"
            component="h2"
            onCommit={(name) => m.updateAsync(task.id, { name })}
          />
        </Box>
        {/* FR-684: the same task as a document page (a real link — Cmd/Ctrl+click opens a new tab) */}
        <Button
          size="small"
          component={Link}
          href={taskPageHref(task.id)}
          endIcon={<NorthEastOutlined aria-hidden="true" />}
          onClick={(e: MouseEvent) => {
            if (isPlainClick(e)) rememberScroll()
          }}
          sx={{ flex: 'none', textTransform: 'none', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}
        >
          {th.tasks.openAsPage}
        </Button>
        <CloseButton taskId={task.id} />
      </Box>

      <TaskProperties projectId={projectId} task={task} data={data} variant="panel" />

      <Divider sx={{ borderColor: 'var(--border-subtle)' }} />
      {/* the body heading row carries the save status, right-aligned (not floating above the editor) */}
      <Box sx={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 1, mb: -1 }}>
        <Typography
          component="h3"
          sx={{
            m: 0,
            color: 'var(--text-secondary)',
            fontSize: 'var(--font-sm)',
            fontWeight: 'var(--weight-medium)',
          }}
        >
          {th.taskPage.bodyLabel}
        </Typography>
        <Box component="span" ref={setStatusSlot} sx={{ flex: 'none' }} />
      </Box>
      {/* FR-684: the compact body replaces "หมายเหตุ" — same editor and data as the task page */}
      {body.data ? (
        <TaskBody
          view={body.data}
          variant="compact"
          canEdit={canEdit}
          statusSlot={statusSlot}
          onHasBodyChange={(hasBody) => patchTaskHasBody(qc, projectId, task.id, hasBody)}
        />
      ) : body.isError ? (
        <Alert
          severity="error"
          data-testid="task-body-error"
          action={
            <Button color="inherit" size="small" onClick={() => void body.refetch()}>
              {th.common.retry}
            </Button>
          }
        >
          {errorMessage(body.error)}
        </Alert>
      ) : (
        <Skeleton
          variant="rounded"
          height={120}
          data-testid="task-body-loading"
          aria-label={th.common.loading}
        />
      )}

      {canEdit ? (
        <Button
          color="error"
          startIcon={<DeleteOutlined />}
          onClick={() => {
            m.remove([task.id])
            closePanel(task.id)
          }}
          sx={{ justifySelf: 'start', textTransform: 'none' }}
        >
          {th.tasks.panel.delete}
        </Button>
      ) : null}
    </Box>
  )
}
