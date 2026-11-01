// M6.1 S2.5 — TaskBody (FR-680/681/688/691, M6.1-D8/D11/D26): the editor props of a lazy task body, ensure →
// qk.taskBody, saves keep the cache in step, hasBody callback (debounced, changes only), variants, header slots,
// the read-only placeholder and focusRef. The editor itself is covered by PageEditor.lazy.test.tsx.
import { act, screen, waitFor } from '@testing-library/react'
import type { Ref } from 'react'
import { createRef } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { PageEditorShellProps } from '@/components/editor/PageEditor'
import { th } from '@/i18n/th'
import type { TaskBodyView } from '@/lib/contracts/task-pages'
import { DEFAULT_UPLOAD_LIMITS } from '@/lib/files/upload-rules'
import { qk } from '@/lib/query-keys'
import { ensureTaskBody } from '@/server/actions/task-pages'
import { makeTestQueryClient, renderWithClient } from './render.test.helper'
import { HAS_BODY_DEBOUNCE_MS, TaskBody } from './TaskBody'

vi.mock('@/server/actions/task-pages', () => ({ ensureTaskBody: vi.fn() }))
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

const TASK = '3f2504e0-4f89-41d3-9a0c-0305e82c3301'
const PAGE = '7c9e6679-7425-40de-944b-e07fc1f90ae7'
const view = (over: Partial<TaskBodyView> = {}): TaskBodyView => ({
  taskId: TASK,
  projectId: 'p1',
  page: null,
  can: { edit: true },
  uploadLimits: DEFAULT_UPLOAD_LIMITS,
  ...over,
})
const withPage = (content: unknown[], isBlank = false): TaskBodyView =>
  view({ page: { id: PAGE, version: 3, content, fullWidth: false, isBlank } })
const last = () => editorProps.at(-1)!

describe('TaskBody', () => {
  beforeEach(() => {
    editorProps.length = 0
    focusSpy.mockClear()
    vi.mocked(ensureTaskBody).mockReset()
    slots.status = null
    slots.lease = null
  })
  afterEach(() => vi.useRealTimers())

  it('no row yet: a TASK editor with pageId null, lease on focus, stable editorKey and version 1', () => {
    renderWithClient(<TaskBody view={view()} variant="compact" canEdit />)
    const p = last()
    expect(p).toMatchObject({
      pageId: null,
      kind: 'TASK',
      editorKey: `task:${TASK}`,
      leaseAcquire: 'focus',
      variant: 'compact',
      version: 1,
      canEdit: true,
      initialContent: [],
    })
    expect(p.ensurePageId).toBeTypeOf('function')
    expect(screen.getByTestId('task-body')).toHaveAttribute('data-variant', 'compact')
    expect(screen.getByRole('region', { name: th.taskPage.bodyLabel })).toBeInTheDocument()
  })

  it('ensurePageId → ensureTaskBody({ taskId }) once per call, the id lands in qk.taskBody, the editor keeps its key', async () => {
    vi.mocked(ensureTaskBody).mockResolvedValue({ ok: true, pageId: PAGE, version: 1, created: true })
    const { qc } = renderWithClient(<TaskBody view={view()} variant="compact" canEdit />)
    let id = ''
    await act(async () => {
      id = await last().ensurePageId!()
    })
    expect(id).toBe(PAGE)
    expect(ensureTaskBody).toHaveBeenCalledWith({ taskId: TASK })
    expect(qc.getQueryData<TaskBodyView>(qk.taskBody(TASK))?.page).toMatchObject({ id: PAGE, version: 1 })
    await waitFor(() => expect(last().pageId).toBe(PAGE))
    expect(last().editorKey).toBe(`task:${TASK}`)
  })

  it('a failed ensure rejects with the server message (the editor toasts it)', async () => {
    vi.mocked(ensureTaskBody).mockResolvedValue({ ok: false, code: 'FORBIDDEN', message: 'ห้าม' })
    renderWithClient(<TaskBody view={view()} variant="compact" canEdit />)
    await expect(last().ensurePageId!()).rejects.toThrow('ห้าม')
  })

  it('an existing body passes its id, content and version', () => {
    const content = [{ type: 'paragraph', content: 'รายละเอียด' }]
    renderWithClient(<TaskBody view={withPage(content)} variant="page" canEdit />)
    expect(last()).toMatchObject({ pageId: PAGE, version: 3, initialContent: content, variant: 'page' })
  })

  it('saves keep qk.taskBody in step (content, version, isBlank)', () => {
    const qc = makeTestQueryClient()
    renderWithClient(<TaskBody view={withPage([], true)} variant="compact" canEdit />, qc)
    const content = [{ type: 'paragraph', content: 'ใหม่' }]
    act(() => last().onSaved!({ content, version: 4 }))
    expect(qc.getQueryData<TaskBodyView>(qk.taskBody(TASK))?.page).toMatchObject({
      content,
      version: 4,
      isBlank: false,
    })
  })

  it('onHasBodyChange: debounced 500 ms, only on change (text, image-only, back to blank)', () => {
    vi.useFakeTimers()
    const onHasBodyChange = vi.fn()
    renderWithClient(<TaskBody view={view()} variant="compact" canEdit onHasBodyChange={onHasBodyChange} />)
    const change = (doc: unknown[]) => act(() => last().onDocumentChange!(doc))
    change([{ type: 'paragraph', content: 'ก' }])
    change([{ type: 'paragraph', content: 'กข' }])
    act(() => void vi.advanceTimersByTime(HAS_BODY_DEBOUNCE_MS - 1))
    expect(onHasBodyChange).not.toHaveBeenCalled()
    act(() => void vi.advanceTimersByTime(1))
    expect(onHasBodyChange).toHaveBeenCalledExactlyOnceWith(true)
    change([{ type: 'image', props: { url: `/api/files/${PAGE}` } }])
    act(() => void vi.advanceTimersByTime(HAS_BODY_DEBOUNCE_MS))
    expect(onHasBodyChange).toHaveBeenCalledTimes(1) // still has a body
    change([{ type: 'paragraph' }])
    act(() => void vi.advanceTimersByTime(HAS_BODY_DEBOUNCE_MS))
    expect(onHasBodyChange).toHaveBeenLastCalledWith(false)
  })

  it('variant page portals into the header slots; compact (panel) stays inline', () => {
    slots.status = document.createElement('div')
    slots.lease = document.createElement('div')
    const { unmount } = renderWithClient(<TaskBody view={view()} variant="page" canEdit />)
    expect(last().saveStatusSlot).toBe(slots.status)
    expect(last().leaseSlot).toBe(slots.lease)
    unmount()
    renderWithClient(<TaskBody view={view()} variant="compact" canEdit />)
    expect(last().saveStatusSlot).toBeNull()
    expect(last().leaseSlot).toBeNull()
  })

  it('read-only + no body: the placeholder as plain muted text, no editor (FR-681)', () => {
    renderWithClient(<TaskBody view={view({ can: { edit: false } })} variant="page" canEdit />)
    expect(screen.getByTestId('task-body-placeholder')).toHaveTextContent(th.editor.taskPlaceholder)
    expect(screen.queryByTestId('editor-stub')).toBeNull()
  })

  it('read-only with content: a read-only editor (never ensures)', () => {
    renderWithClient(
      <TaskBody view={withPage([{ type: 'paragraph', content: 'x' }])} variant="page" canEdit={false} />,
    )
    expect(last().canEdit).toBe(false)
  })

  it('focusRef.focus() focuses the editor', () => {
    const ref = createRef<{ focus(): void }>()
    renderWithClient(<TaskBody view={view()} variant="page" canEdit focusRef={ref} />)
    ref.current!.focus()
    expect(focusSpy).toHaveBeenCalledOnce()
  })
})
