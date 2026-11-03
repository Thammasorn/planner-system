'use client'
// src/components/editor/TaskBody.tsx — the body of a task (SPEC §4.6.4 FR-680/681/688/691, §7.7, M6.1-D8/D11/D26):
// the M4 editor on the task's TASK page. The row is created lazily: the editor calls `ensureTaskBody` on the first
// focus / input / paste / drop / upload (never on open), then takes the lease; text typed meanwhile is saved after.
// - Data: `qk.taskBody(taskId)` (initialData = the caller's view; GET /api/tasks/[id]/body). Saves keep the cache in
//   step (content / version / isBlank), so reopening the panel shows the latest text without a refetch.
// - 📄: `onHasBodyChange` fires (debounced 500 ms) when the body turns blank / non-blank — the caller patches the task
//   list cache (`patchTaskHasBody`), no refetch per autosave (M6.1-D11).
// - Variants: `page` (/t: document font, save status + lease badge portalled into the header bar) and `compact`
//   (task panel: UI font, min-height, banners inline as in M4).
// - Read-only and blank: the placeholder as plain muted text (BlockNote shows placeholders only while editable).
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { type JSX, type Ref, useCallback, useEffect, useImperativeHandle, useRef } from 'react'
import { useHeaderSlot } from '@/components/layout/HeaderActions'
import { th } from '@/i18n/th'
import { unwrap } from '@/lib/action-result'
import { getJson } from '@/lib/api'
import type { TaskBodyView } from '@/lib/contracts/task-pages'
import { hasTaskBodyContent } from '@/lib/editor/task-body'
import { isBlankPage } from '@/lib/pages/blank'
import { qk } from '@/lib/query-keys'
import { ensureTaskBody } from '@/server/actions/task-pages'
import { EditorClient } from './EditorClient'

/** FR-691: the 📄 marker follows the body after typing pauses (no flicker per keystroke). */
export const HAS_BODY_DEBOUNCE_MS = 500

export interface TaskBodyProps {
  view: TaskBodyView
  variant: 'page' | 'compact'
  canEdit: boolean
  /** Called when the body turns blank / non-blank (the caller patches `hasBody` in the task list cache). */
  onHasBodyChange?: (hasBody: boolean) => void
  /** `focus()` moves the caret into the body (Enter in the task page title, FR-683). */
  focusRef?: Ref<{ focus(): void }>
  /** 'compact': the panel's body-heading element the save status is portalled into (inline when absent). */
  statusSlot?: HTMLElement | null
}

export function TaskBody(p: TaskBodyProps): JSX.Element {
  const { taskId } = p.view
  const qc = useQueryClient()
  const { data } = useQuery({
    queryKey: qk.taskBody(taskId),
    queryFn: ({ signal }) => getJson<TaskBodyView>(`/api/tasks/${taskId}/body`, { signal }),
    initialData: p.view,
  })
  const view = data
  const canEdit = p.canEdit && view.can.edit
  const page = view.page

  // Header slots exist only on the task page (/t); in the panel everything stays inline (M6.1-D26).
  const statusSlot = useHeaderSlot('status')
  const leaseSlot = useHeaderSlot('lease')
  const inHeader = p.variant === 'page'

  const ensurePageId = useCallback(async (): Promise<string> => {
    const r = await unwrap(ensureTaskBody({ taskId }))
    qc.setQueryData<TaskBodyView>(qk.taskBody(taskId), (v) =>
      v && !v.page
        ? { ...v, page: { id: r.pageId, version: r.version, content: [], fullWidth: false, isBlank: true } }
        : v,
    )
    return r.pageId
  }, [qc, taskId])

  const onSaved = useCallback(
    (r: { content: unknown[]; version: number }) => {
      qc.setQueryData<TaskBodyView>(qk.taskBody(taskId), (v) =>
        v?.page
          ? {
              ...v,
              page: {
                ...v.page,
                content: r.content,
                version: r.version,
                isBlank: isBlankPage({ title: '', content: r.content }),
              },
            }
          : v,
      )
    },
    [qc, taskId],
  )

  // hasBody follows the live document (debounced); only changes are reported.
  const hasBody = useRef(page ? hasTaskBodyContent(page.content) : false)
  const onHasBodyChange = useRef(p.onHasBodyChange)
  useEffect(() => {
    onHasBodyChange.current = p.onHasBodyChange
  })
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const onDocumentChange = useCallback((doc: unknown[]) => {
    if (timer.current !== null) clearTimeout(timer.current)
    timer.current = setTimeout(() => {
      timer.current = null
      const next = hasTaskBodyContent(doc)
      if (next === hasBody.current) return
      hasBody.current = next
      onHasBodyChange.current?.(next)
    }, HAS_BODY_DEBOUNCE_MS)
  }, [])
  useEffect(
    () => () => {
      if (timer.current !== null) clearTimeout(timer.current)
    },
    [],
  )

  const boxRef = useRef<HTMLDivElement>(null)
  const editorHandle = useRef<{ focus(): void } | null>(null)
  useImperativeHandle(
    p.focusRef,
    () => ({
      focus: () => {
        if (editorHandle.current) editorHandle.current.focus()
        else boxRef.current?.focus() // editor chunk still loading
      },
    }),
    [],
  )

  const readOnlyBlank = !canEdit && (page === null || page.isBlank)

  return (
    <Box
      ref={boxRef}
      tabIndex={-1}
      data-testid="task-body"
      data-variant={p.variant}
      data-has-page={page ? 'true' : 'false'}
      role="region"
      aria-label={th.taskPage.bodyLabel}
      className={`task-body task-body--${p.variant}`}
      sx={{ outline: 'none' }}
    >
      {readOnlyBlank ? (
        <Typography
          data-testid="task-body-placeholder"
          sx={{
            color: 'var(--text-secondary)',
            fontSize: p.variant === 'page' ? 'var(--font-lg)' : 'var(--font-md)',
            lineHeight: p.variant === 'page' ? 'var(--leading-doc)' : 'var(--leading-ui)',
            py: 0.5,
          }}
        >
          {th.editor.taskPlaceholder}
        </Typography>
      ) : (
        <EditorClient
          pageId={page?.id ?? null}
          kind="TASK"
          editorKey={`task:${taskId}`}
          space="PROJECT"
          projectId={view.projectId}
          depth={0}
          initialContent={page?.content ?? []}
          // a body created by our first focus starts at version 1 (ensureTaskBody); an existing one at its own
          version={page?.version ?? 1}
          canEdit={canEdit}
          uploadLimits={view.uploadLimits}
          reloadToken={0}
          leaseAcquire="focus"
          variant={p.variant}
          ensurePageId={ensurePageId}
          saveStatusSlot={inHeader ? statusSlot : (p.statusSlot ?? null)}
          leaseSlot={inHeader ? leaseSlot : null}
          onDocumentChange={onDocumentChange}
          onSaved={onSaved}
          focusHandle={editorHandle}
        />
      )}
    </Box>
  )
}
