'use client'
// src/components/editor/RowBody.tsx — the body of a database row (SPEC §4.14 FR-1453, §7.7, M11-D8/D39): the M4 editor
// on the row's DB_ROW page, mirroring TaskBody (M6.1). The row is created lazily: the editor calls `ensureRowBody` on
// the first focus / input / paste / drop / upload (never on open), then takes the lease (`leaseAcquire 'focus'`).
// - Data: `qk.rowBody(rowId)` (initialData = the caller's view; GET /api/database-rows/[id]/body). Saves keep the
//   cache in step (content / version / isBlank).
// - 📄 (M11-D39): when the body turns blank / non-blank (debounced 500 ms, M6.1-D11 rule) the row's `hasBody` is
//   patched in the shared `qk.database(ownerPageId, databaseId)` cache (`patchRowHasBody`, no refetch) and
//   `onHasBodyChange` is told.
// - Variants: `page` (/r: document font, save status + lease badge portalled into the header bar) and `compact` (the
//   row side panel: UI font, banners inline).
// - Kind DB_ROW: no sub-page and no database blocks (slash menu, paste, drop — M11-D38); its own placeholder.
// - Read-only and blank: the placeholder as plain muted text (BlockNote shows placeholders only while editable).
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { type JSX, type Ref, useCallback, useEffect, useImperativeHandle, useRef } from 'react'
import { useHeaderSlot } from '@/components/layout/HeaderActions'
import { th } from '@/i18n/th'
import { unwrap } from '@/lib/action-result'
import { getJson } from '@/lib/api'
import type { RowBodyView } from '@/lib/contracts/row-pages'
import { hasTaskBodyContent } from '@/lib/editor/task-body'
import { patchRowHasBody } from '@/lib/invalidate'
import { isBlankPage } from '@/lib/pages/blank'
import { qk } from '@/lib/query-keys'
import { ensureRowBody } from '@/server/actions/row-pages'
import { EditorClient } from './EditorClient'

/** M11-D39 (M6.1-D11 pattern): 📄 follows the body after typing pauses (no flicker per keystroke). */
export const HAS_BODY_DEBOUNCE_MS = 500

export interface RowBodyProps {
  view: RowBodyView
  /** 'page' = /r/[rowId]; 'compact' = the row side panel. */
  variant: 'page' | 'compact'
  canEdit: boolean
  /** Called when the body turns blank / non-blank (after `hasBody` was patched in qk.database, M11-D39). */
  onHasBodyChange?: (hasBody: boolean) => void
  /** `focus()` moves the caret into the body (Enter in the row page title, M11-D27). */
  focusRef?: Ref<{ focus(): void }>
}

export function RowBody(p: RowBodyProps): JSX.Element {
  const { rowId } = p.view
  const qc = useQueryClient()
  const { data: view } = useQuery({
    queryKey: qk.rowBody(rowId),
    queryFn: ({ signal }) => getJson<RowBodyView>(`/api/database-rows/${rowId}/body`, { signal }),
    initialData: p.view,
  })
  const canEdit = p.canEdit && view.can.edit
  const page = view.page
  const { ownerPageId, databaseId } = view

  // Header slots exist only on the row page (/r); in the panel everything stays inline (M6.1-D26 pattern).
  const statusSlot = useHeaderSlot('status')
  const leaseSlot = useHeaderSlot('lease')
  const inHeader = p.variant === 'page'

  const ensurePageId = useCallback(async (): Promise<string> => {
    const r = await unwrap(ensureRowBody({ rowId }))
    qc.setQueryData<RowBodyView>(qk.rowBody(rowId), (v) =>
      v && !v.page
        ? { ...v, page: { id: r.pageId, version: r.version, content: [], fullWidth: false, isBlank: true } }
        : v,
    )
    return r.pageId
  }, [qc, rowId])

  const onSaved = useCallback(
    (r: { content: unknown[]; version: number }) => {
      qc.setQueryData<RowBodyView>(qk.rowBody(rowId), (v) =>
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
    [qc, rowId],
  )

  // hasBody follows the live document (debounced); only changes are reported.
  const hasBody = useRef(page ? hasTaskBodyContent(page.content) : false)
  const latest = useRef({ onHasBodyChange: p.onHasBodyChange, ownerPageId, databaseId })
  useEffect(() => {
    latest.current = { onHasBodyChange: p.onHasBodyChange, ownerPageId, databaseId }
  })
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const onDocumentChange = useCallback(
    (doc: unknown[]) => {
      if (timer.current !== null) clearTimeout(timer.current)
      timer.current = setTimeout(() => {
        timer.current = null
        const next = hasTaskBodyContent(doc)
        if (next === hasBody.current) return
        hasBody.current = next
        const l = latest.current
        patchRowHasBody(qc, l.ownerPageId, l.databaseId, rowId, next)
        l.onHasBodyChange?.(next)
      }, HAS_BODY_DEBOUNCE_MS)
    },
    [qc, rowId],
  )
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
      data-testid="row-body"
      data-variant={p.variant}
      data-has-page={page ? 'true' : 'false'}
      role="region"
      aria-label={th.database.rowPage.bodyLabel}
      className={`task-body task-body--${p.variant}`}
      sx={{ outline: 'none' }}
    >
      {readOnlyBlank ? (
        <Typography
          data-testid="row-body-placeholder"
          sx={{
            color: 'var(--text-secondary)',
            fontSize: p.variant === 'page' ? 'var(--font-lg)' : 'var(--font-md)',
            lineHeight: p.variant === 'page' ? 'var(--leading-doc)' : 'var(--leading-ui)',
            py: 0.5,
          }}
        >
          {th.editor.rowPlaceholder}
        </Typography>
      ) : (
        <EditorClient
          pageId={page?.id ?? null}
          kind="DB_ROW"
          editorKey={`row:${rowId}`}
          space={view.space}
          projectId={view.projectId}
          depth={0}
          initialContent={page?.content ?? []}
          // a body created by our first focus starts at version 1 (ensureRowBody); an existing one at its own
          version={page?.version ?? 1}
          canEdit={canEdit}
          uploadLimits={view.uploadLimits}
          reloadToken={0}
          leaseAcquire="focus"
          variant={p.variant}
          ensurePageId={ensurePageId}
          saveStatusSlot={inHeader ? statusSlot : null}
          leaseSlot={inHeader ? leaseSlot : null}
          onDocumentChange={onDocumentChange}
          onSaved={onSaved}
          focusHandle={editorHandle}
        />
      )}
    </Box>
  )
}
