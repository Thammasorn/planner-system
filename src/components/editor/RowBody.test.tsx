// M11 S5.6 — RowBody (FR-1453, M11-D8/D39): the editor props of a lazy row body (kind DB_ROW, lease on focus, stable
// key), ensure → qk.rowBody, saves keep the cache in step, 📄 patched in qk.database (debounced, changes only) and
// reported, variants + header slots, the read-only placeholder and focusRef. The editor itself is covered by
// PageEditor.lazy.test.tsx (same component as task bodies).
import { act, screen, waitFor } from '@testing-library/react'
import type { Ref } from 'react'
import { createRef } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { PageEditorShellProps } from '@/components/editor/PageEditor'
import { th } from '@/i18n/th'
import type { DatabaseResponse } from '@/lib/contracts/databases'
import type { RowBodyView } from '@/lib/contracts/row-pages'
import { DEFAULT_UPLOAD_LIMITS } from '@/lib/files/upload-rules'
import { qk } from '@/lib/query-keys'
import { ensureRowBody } from '@/server/actions/row-pages'
import { makeTestQueryClient, renderWithClient } from './render.test.helper'
import { HAS_BODY_DEBOUNCE_MS, RowBody } from './RowBody'

vi.mock('@/server/actions/row-pages', () => ({ ensureRowBody: vi.fn() }))
const editorProps: PageEditorShellProps[] = []
const focusSpy = vi.fn()
vi.mock('./EditorClient', async () => {
  const { useImperativeHandle } = await import('react')
  return {
    EditorClient: (p: PageEditorShellProps) => {
      editorProps.push(p)
      useImperativeHandle(p.focusHandle as Ref<{ focus(): void }>, () => ({ focus: focusSpy }), [])
      return <div data-testid="editor-stub" data-page-id={p.pageId ?? ''} />
    },
  }
})
const slots: { status: HTMLElement | null; lease: HTMLElement | null } = { status: null, lease: null }
vi.mock('@/components/layout/HeaderActions', () => ({
  useHeaderSlot: (name: 'status' | 'lease') => slots[name],
}))

const ROW = '3f2504e0-4f89-41d3-9a0c-0305e82c3301'
const PAGE = '7c9e6679-7425-40de-944b-e07fc1f90ae7'
const OWNER = 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d'
const DB = '9b2d5f4e-1c3a-4b5d-8e7f-0a1b2c3d4e5f'
const view = (over: Partial<RowBodyView> = {}): RowBodyView => ({
  rowId: ROW,
  databaseId: DB,
  ownerPageId: OWNER,
  space: 'WORKSPACE',
  projectId: null,
  page: null,
  can: { edit: true },
  uploadLimits: DEFAULT_UPLOAD_LIMITS,
  ...over,
})
const withPage = (content: unknown[], isBlank = false): RowBodyView =>
  view({ page: { id: PAGE, version: 3, content, fullWidth: false, isBlank } })
const last = () => editorProps.at(-1)!
const cachedDb = (hasBody: boolean) =>
  ({ id: DB, title: 'ฐาน', rows: [{ id: ROW, hasBody }, { id: 'other', hasBody: false }] }) as unknown as DatabaseResponse

describe('RowBody', () => {
  beforeEach(() => {
    editorProps.length = 0
    focusSpy.mockClear()
    vi.mocked(ensureRowBody).mockReset()
    slots.status = null
    slots.lease = null
  })
  afterEach(() => vi.useRealTimers())

  it('no body yet: a DB_ROW editor with pageId null, lease on focus, stable editorKey, the owner page’s space', () => {
    renderWithClient(<RowBody view={view({ space: 'PROJECT', projectId: 'p1' })} variant="compact" canEdit />)
    expect(last()).toMatchObject({
      pageId: null,
      kind: 'DB_ROW',
      editorKey: `row:${ROW}`,
      leaseAcquire: 'focus',
      variant: 'compact',
      version: 1,
      canEdit: true,
      initialContent: [],
      space: 'PROJECT',
      projectId: 'p1',
    })
    expect(last().ensurePageId).toBeTypeOf('function')
    expect(screen.getByRole('region', { name: th.database.rowPage.bodyLabel })).toHaveAttribute(
      'data-variant',
      'compact',
    )
  })

  it('ensurePageId → ensureRowBody({ rowId }), the id lands in qk.rowBody, the editor keeps its key', async () => {
    vi.mocked(ensureRowBody).mockResolvedValue({ ok: true, pageId: PAGE, version: 1, created: true })
    const { qc } = renderWithClient(<RowBody view={view()} variant="compact" canEdit />)
    let id = ''
    await act(async () => {
      id = await last().ensurePageId!()
    })
    expect(id).toBe(PAGE)
    expect(ensureRowBody).toHaveBeenCalledWith({ rowId: ROW })
    expect(qc.getQueryData<RowBodyView>(qk.rowBody(ROW))?.page).toMatchObject({ id: PAGE, version: 1 })
    await waitFor(() => expect(last().pageId).toBe(PAGE))
    expect(last().editorKey).toBe(`row:${ROW}`)
  })

  it('a failed ensure rejects with the server message (the editor toasts it)', async () => {
    vi.mocked(ensureRowBody).mockResolvedValue({ ok: false, code: 'FORBIDDEN', message: 'ห้าม' })
    renderWithClient(<RowBody view={view()} variant="compact" canEdit />)
    await expect(last().ensurePageId!()).rejects.toThrow('ห้าม')
  })

  it('an existing body passes its id, content and version; saves keep qk.rowBody in step', () => {
    const qc = makeTestQueryClient()
    const content = [{ type: 'paragraph', content: 'บันทึก' }]
    renderWithClient(<RowBody view={withPage(content)} variant="page" canEdit />, qc)
    expect(last()).toMatchObject({ pageId: PAGE, version: 3, initialContent: content, variant: 'page' })
    const next = [{ type: 'paragraph', content: 'ใหม่' }]
    act(() => last().onSaved!({ content: next, version: 4 }))
    expect(qc.getQueryData<RowBodyView>(qk.rowBody(ROW))?.page).toMatchObject({
      content: next,
      version: 4,
      isBlank: false,
    })
  })

  it('📄: debounced 500 ms, only on change — patches qk.database(owner, db) and reports it', () => {
    vi.useFakeTimers()
    const qc = makeTestQueryClient()
    qc.setQueryData(qk.database(OWNER, DB), cachedDb(false))
    const onHasBodyChange = vi.fn()
    renderWithClient(<RowBody view={view()} variant="compact" canEdit onHasBodyChange={onHasBodyChange} />, qc)
    const change = (doc: unknown[]) => act(() => last().onDocumentChange!(doc))
    const row = () => qc.getQueryData<DatabaseResponse>(qk.database(OWNER, DB))!.rows[0]!
    change([{ type: 'paragraph', content: 'ก' }])
    act(() => void vi.advanceTimersByTime(HAS_BODY_DEBOUNCE_MS - 1))
    expect(row().hasBody).toBe(false)
    act(() => void vi.advanceTimersByTime(1))
    expect(row().hasBody).toBe(true)
    expect(onHasBodyChange).toHaveBeenCalledExactlyOnceWith(true)
    change([{ type: 'image', props: { url: `/api/files/${PAGE}` } }])
    act(() => void vi.advanceTimersByTime(HAS_BODY_DEBOUNCE_MS))
    expect(onHasBodyChange).toHaveBeenCalledTimes(1)
    change([{ type: 'paragraph' }])
    act(() => void vi.advanceTimersByTime(HAS_BODY_DEBOUNCE_MS))
    expect(row().hasBody).toBe(false)
    expect(onHasBodyChange).toHaveBeenLastCalledWith(false)
  })

  it('variant page portals into the header slots; compact (panel) stays inline', () => {
    slots.status = document.createElement('div')
    slots.lease = document.createElement('div')
    const { unmount } = renderWithClient(<RowBody view={view()} variant="page" canEdit />)
    expect(last().saveStatusSlot).toBe(slots.status)
    expect(last().leaseSlot).toBe(slots.lease)
    unmount()
    renderWithClient(<RowBody view={view()} variant="compact" canEdit />)
    expect(last().saveStatusSlot).toBeNull()
    expect(last().leaseSlot).toBeNull()
  })

  it('read-only + no body: the row placeholder as plain text, no editor', () => {
    renderWithClient(<RowBody view={view({ can: { edit: false } })} variant="page" canEdit />)
    expect(screen.getByTestId('row-body-placeholder')).toHaveTextContent(th.editor.rowPlaceholder)
    expect(screen.queryByTestId('editor-stub')).toBeNull()
  })

  it('read-only with content: a read-only editor', () => {
    renderWithClient(
      <RowBody view={withPage([{ type: 'paragraph', content: 'x' }])} variant="page" canEdit={false} />,
    )
    expect(last().canEdit).toBe(false)
  })

  it('focusRef.focus() focuses the editor', () => {
    const ref = createRef<{ focus(): void }>()
    renderWithClient(<RowBody view={view()} variant="page" canEdit focusRef={ref} />)
    ref.current!.focus()
    expect(focusSpy).toHaveBeenCalledOnce()
  })
})
