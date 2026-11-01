// M6.1 S2.1/S2.2 — PageEditor with a lazy page id (FR-681, FR-688, M6.1-D8): no row and no lease until the first
// focus; ensure once; what was typed meanwhile is saved; the BlockNote instance survives the id; a failed ensure
// toasts and stays editable; read-only never ensures. BlockNoteView is replaced by a plain element (jsdom has no
// layout); the editor itself is the real headless BlockNote instance.
import { act, fireEvent, screen } from '@testing-library/react'
import { toast } from 'sonner'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ActionResult } from '@/lib/action-result'
import type { LeaseState, SavePageResult } from '@/lib/contracts/pages'
import { DEFAULT_UPLOAD_LIMITS } from '@/lib/files/upload-rules'
import { savePageContent } from '@/server/actions/pages'
import PageEditor, { type PageEditorShellProps } from './PageEditor'
import { renderWithClient } from './render.test.helper'
import type { AppEditor } from './schema'

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }))
vi.mock('@/server/actions/pages', () => ({ savePageContent: vi.fn(), createPage: vi.fn() }))

interface ViewProps {
  editor: AppEditor
  editable: boolean
  onChange: () => void
}
const views: ViewProps[] = []
vi.mock('@blocknote/mantine', () => ({
  BlockNoteView: (p: ViewProps) => {
    views.push(p)
    return (
      <div data-testid="bn-view" tabIndex={0} contentEditable={p.editable} suppressContentEditableWarning />
    )
  },
}))

const save = vi.mocked(savePageContent)
const PAGE = '7c9e6679-7425-40de-944b-e07fc1f90ae7'
const TASK = '3f2504e0-4f89-41d3-9a0c-0305e82c3301'
const lease = (version: number, mine = true): LeaseState => ({
  mine,
  holder: mine ? { userId: 'me', name: 'Me' } : { userId: 'cindy', name: 'Cindy' },
  expiresAt: null,
  version,
})
const okRes = (version: number): ActionResult<SavePageResult> => ({
  ok: true,
  version,
  lease: lease(version),
})

const fetchMock = vi.fn<typeof fetch>()
const urlOf = (u: RequestInfo | URL): string =>
  typeof u === 'string' ? u : u instanceof URL ? u.href : u.url
const calls = () => fetchMock.mock.calls.map(([u, init]) => `${init?.method ?? 'GET'} ${urlOf(u)}`)

function deferred<T>() {
  let resolve!: (v: T) => void
  let reject!: (e: Error) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

function props(over: Partial<PageEditorShellProps> = {}): PageEditorShellProps {
  return {
    pageId: null,
    kind: 'TASK',
    editorKey: `task:${TASK}`,
    space: 'PROJECT',
    projectId: 'p1',
    depth: 0,
    initialContent: [],
    version: 1,
    canEdit: true,
    uploadLimits: DEFAULT_UPLOAD_LIMITS,
    reloadToken: 0,
    leaseAcquire: 'focus',
    variant: 'compact',
    ...over,
  }
}

const tick = (ms: number) => act(async () => void (await vi.advanceTimersByTimeAsync(ms)))
const lastView = () => views.at(-1)!
function typeText(text: string) {
  const editor = lastView().editor
  act(() => {
    editor.replaceBlocks([editor.document[0]!.id], [{ type: 'paragraph', content: text }])
    lastView().onChange()
  })
}
const focusBody = () => fireEvent.focusIn(screen.getByTestId('bn-view'))

describe('PageEditor — lazy page id (TASK body)', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    views.length = 0
    save.mockReset()
    save.mockResolvedValue(okRes(2))
    fetchMock.mockReset()
    fetchMock.mockImplementation((_u, init) =>
      Promise.resolve(
        init?.method === 'DELETE'
          ? new Response(null, { status: 204 })
          : new Response(JSON.stringify(lease(1)), {
              status: 200,
              headers: { 'content-type': 'application/json' },
            }),
      ),
    )
    vi.stubGlobal('fetch', fetchMock)
  })
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('no row, no lease request on open; editable with the TASK variant markers', async () => {
    const ensurePageId = vi.fn(() => Promise.resolve(PAGE))
    renderWithClient(<PageEditor {...props({ ensurePageId })} />)
    await tick(31_000)
    expect(ensurePageId).not.toHaveBeenCalled()
    expect(fetchMock).not.toHaveBeenCalled()
    const root = screen.getByTestId('page-editor')
    expect(root).toHaveAttribute('data-editable', 'true')
    expect(root).toHaveAttribute('data-kind', 'TASK')
    expect(root).toHaveAttribute('data-variant', 'compact')
    expect(root).toHaveAttribute('data-lease-mode', 'idle')
  })

  it('first focus → ensure exactly once (two quick focuses); typed text is saved after it resolves; same instance', async () => {
    const d = deferred<string>()
    const ensurePageId = vi.fn(() => d.promise)
    const r = renderWithClient(<PageEditor {...props({ ensurePageId })} />)
    focusBody()
    focusBody()
    expect(ensurePageId).toHaveBeenCalledTimes(1)
    typeText('รอ spec จากลูกค้า')
    await tick(800)
    expect(save).not.toHaveBeenCalled() // the id is not there yet
    expect(fetchMock).not.toHaveBeenCalled()
    await act(async () => {
      d.resolve(PAGE)
      await vi.advanceTimersByTimeAsync(0)
    })
    expect(save).toHaveBeenCalledTimes(1)
    const sent = save.mock.calls[0]![0]
    expect(sent.pageId).toBe(PAGE)
    expect(sent.baseVersion).toBe(1)
    expect(JSON.stringify(sent.content)).toContain('รอ spec จากลูกค้า')
    // then the lease (M6.1-D8 order: ensure → lease)
    await tick(0)
    expect(calls()).toContain(`POST /api/pages/${PAGE}/lock`)
    // TaskBody's setQueryData hands the id in through props — still the same BlockNote instance
    r.rerender(<PageEditor {...props({ ensurePageId, pageId: PAGE })} />)
    await tick(0)
    expect(new Set(views.map((v) => v.editor)).size).toBe(1)
    expect(ensurePageId).toHaveBeenCalledTimes(1)
  })

  it('a rejected ensure → error toast, still editable; the next focus tries again', async () => {
    const spy = vi.spyOn(toast, 'error')
    const ensurePageId = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(new Error('สร้างเนื้อหางานไม่สำเร็จ'))
      .mockResolvedValueOnce(PAGE)
    renderWithClient(<PageEditor {...props({ ensurePageId })} />)
    focusBody()
    await tick(0)
    expect(spy).toHaveBeenCalledWith('สร้างเนื้อหางานไม่สำเร็จ')
    expect(screen.getByTestId('page-editor')).toHaveAttribute('data-editable', 'true')
    focusBody()
    await tick(0)
    await tick(0)
    expect(ensurePageId).toHaveBeenCalledTimes(2)
    expect(calls()).toContain(`POST /api/pages/${PAGE}/lock`)
    spy.mockRestore()
  })

  it('read-only (canEdit false) never calls ensure and is not editable', async () => {
    const ensurePageId = vi.fn(() => Promise.resolve(PAGE))
    renderWithClient(<PageEditor {...props({ ensurePageId, canEdit: false })} />)
    focusBody()
    await tick(0)
    expect(ensurePageId).not.toHaveBeenCalled()
    expect(screen.getByTestId('page-editor')).toHaveAttribute('data-editable', 'false')
  })

  it('existing body: GET only on open; focus → POST (lease on first focus, FR-688)', async () => {
    renderWithClient(<PageEditor {...props({ pageId: PAGE })} />)
    await tick(0)
    expect(calls()).toEqual([`GET /api/pages/${PAGE}/lock`])
    focusBody()
    await tick(0)
    expect(calls()).toEqual([`GET /api/pages/${PAGE}/lock`, `POST /api/pages/${PAGE}/lock`])
    expect(screen.getByTestId('page-editor')).toHaveAttribute('data-lease-mode', 'editing')
  })

  it('held by Cindy: read-only, the header slot gets the badge, focus does not take the lease', async () => {
    fetchMock.mockImplementation(() =>
      Promise.resolve(
        new Response(JSON.stringify(lease(1, false)), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      ),
    )
    const slot = document.createElement('div')
    document.body.append(slot)
    renderWithClient(<PageEditor {...props({ pageId: PAGE, leaseSlot: slot, variant: 'page' })} />)
    await tick(0)
    expect(screen.getByTestId('page-editor')).toHaveAttribute('data-editable', 'false')
    expect(slot.querySelector('[data-testid="lease-badge"]')).toHaveTextContent('Cindy')
    expect(screen.queryByTestId('lease-banner')).toBeNull() // the badge replaces the inline banner
    focusBody()
    await tick(0)
    expect(calls().every((c) => c.startsWith('GET'))).toBe(true)
    slot.remove()
  })

  it('DOC pages keep M4: POST on mount, no ensure', async () => {
    renderWithClient(
      <PageEditor
        {...props({ pageId: PAGE, kind: 'DOC', editorKey: PAGE, leaseAcquire: 'mount', variant: 'page' })}
      />,
    )
    await tick(0)
    expect(calls()).toEqual([`POST /api/pages/${PAGE}/lock`])
  })
})
