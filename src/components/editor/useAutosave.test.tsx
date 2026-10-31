// S2.6 — autosave timing, dirty check, version handling, conflict/deleted blocks, retries, leave-page paths.
import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ActionResult } from '@/lib/action-result'
import type { LeaseState, SavePageResult } from '@/lib/contracts/pages'
import { savePageContent } from '@/server/actions/pages'
import { type AutosaveEditor, useAutosave } from './useAutosave'

vi.mock('@/server/actions/pages', () => ({ savePageContent: vi.fn() }))
const save = vi.mocked(savePageContent)

const PAGE = '7c9e6679-7425-40de-944b-e07fc1f90ae7'
const lease = (version: number): LeaseState => ({ mine: true, holder: null, expiresAt: null, version })
const okRes = (version: number): ActionResult<SavePageResult> => ({
  ok: true,
  version,
  lease: lease(version),
})
const fail = (
  code: 'VERSION_CONFLICT' | 'NOT_FOUND' | 'FORBIDDEN' | 'INTERNAL',
): ActionResult<SavePageResult> => ({
  ok: false,
  code,
  message: code,
})

type FakeEditor = { document: unknown[]; onFocusChange: () => () => void }
function fakeEditor(): FakeEditor {
  return { document: [{ id: 'a', type: 'paragraph', content: [] }], onFocusChange: () => () => {} }
}
const type = (e: FakeEditor, text: string) => {
  e.document = [{ id: 'a', type: 'paragraph', content: [{ type: 'text', text, styles: {} }] }]
}

function setup(over: { enabled?: boolean } = {}) {
  const editor = fakeEditor()
  const onLease = vi.fn()
  const hook = renderHook(() =>
    useAutosave({
      editor: editor as unknown as AutosaveEditor,
      pageId: PAGE,
      version: 1,
      enabled: over.enabled ?? true,
      onLease,
    }),
  )
  return { editor, onLease, hook }
}
const tick = (ms: number) => act(async () => void (await vi.advanceTimersByTimeAsync(ms)))

describe('useAutosave', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    save.mockReset()
    save.mockResolvedValue(okRes(2))
  })
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('saves 800 ms after the last change with baseVersion 1', async () => {
    const { editor, hook, onLease } = setup()
    type(editor, 'x')
    act(() => hook.result.current.schedule())
    await tick(799)
    expect(save).not.toHaveBeenCalled()
    await tick(1)
    expect(save).toHaveBeenCalledTimes(1)
    expect(save.mock.calls[0]![0]).toEqual({ pageId: PAGE, baseVersion: 1, content: editor.document })
    expect(hook.result.current.status).toBe('saved')
    expect(onLease).toHaveBeenCalledWith(lease(2))
    expect(hook.result.current.getVersion()).toBe(2)
  })

  it('pending covers the debounce after an earlier save: "saved" + pending until the newer edit is saved', async () => {
    const { editor, hook } = setup()
    expect(hook.result.current.pending).toBe(false)
    type(editor, 'x')
    act(() => hook.result.current.schedule())
    expect(hook.result.current.pending).toBe(true)
    await tick(800)
    expect(hook.result.current).toMatchObject({ status: 'saved', pending: false })
    save.mockResolvedValue(okRes(3))
    type(editor, 'xy')
    act(() => hook.result.current.schedule())
    // the regression: status alone still says "saved" while the newer edit waits out its debounce
    expect(hook.result.current).toMatchObject({ status: 'saved', pending: true })
    await tick(799)
    expect(hook.result.current.pending).toBe(true)
    await tick(1)
    expect(hook.result.current).toMatchObject({ status: 'saved', pending: false })
  })

  it('pending stays set when a change arrives during the save, and clears once that change is saved', async () => {
    let release!: (r: ActionResult<SavePageResult>) => void
    save.mockReturnValueOnce(new Promise((r) => (release = r)))
    const { editor, hook } = setup()
    type(editor, 'x')
    act(() => hook.result.current.schedule())
    await tick(800)
    type(editor, 'xy')
    act(() => hook.result.current.schedule())
    await act(async () => {
      release(okRes(2))
      await vi.advanceTimersByTimeAsync(0)
    })
    expect(hook.result.current).toMatchObject({ status: 'saved', pending: true })
    await tick(800)
    expect(hook.result.current).toMatchObject({ status: 'saved', pending: false })
  })

  it('pending clears without a save when the change is undone; stays set across a failed save', async () => {
    const { editor, hook } = setup()
    const clean = editor.document
    type(editor, 'x')
    act(() => hook.result.current.schedule())
    editor.document = clean
    await tick(800)
    expect(save).not.toHaveBeenCalled()
    expect(hook.result.current.pending).toBe(false)

    save.mockResolvedValueOnce(fail('INTERNAL'))
    type(editor, 'y')
    act(() => hook.result.current.schedule())
    await tick(800)
    expect(hook.result.current).toMatchObject({ status: 'error', pending: true })
    await tick(5000)
    expect(hook.result.current).toMatchObject({ status: 'saved', pending: false })
  })

  it('does not save an unchanged document (editable toggles fire onChange)', async () => {
    const { hook } = setup()
    act(() => hook.result.current.schedule())
    await tick(2000)
    expect(save).not.toHaveBeenCalled()
    expect(hook.result.current.isDirty()).toBe(false)
  })

  it('sends the version returned by the previous save', async () => {
    const { editor, hook } = setup()
    type(editor, 'x')
    act(() => hook.result.current.schedule())
    await tick(800)
    save.mockResolvedValue(okRes(3))
    type(editor, 'xy')
    expect(hook.result.current.isDirty()).toBe(true)
    act(() => hook.result.current.schedule())
    await tick(800)
    expect(save.mock.calls[1]![0].baseVersion).toBe(2)
    expect(hook.result.current.isDirty()).toBe(false)
  })

  it('VERSION_CONFLICT blocks and never retries or overwrites', async () => {
    save.mockResolvedValue(fail('VERSION_CONFLICT'))
    const { editor, hook } = setup()
    type(editor, 'x')
    act(() => hook.result.current.schedule())
    await tick(800)
    expect(hook.result.current.blocked).toBe('conflict')
    await tick(10_000)
    type(editor, 'xyz')
    act(() => hook.result.current.schedule())
    await act(() => hook.result.current.flush())
    await tick(10_000)
    expect(save).toHaveBeenCalledTimes(1)
  })

  it('NOT_FOUND → deleted, FORBIDDEN → forbidden', async () => {
    save.mockResolvedValue(fail('NOT_FOUND'))
    const a = setup()
    type(a.editor, 'x')
    await act(() => a.hook.result.current.flush())
    expect(a.hook.result.current.blocked).toBe('deleted')

    save.mockResolvedValue(fail('FORBIDDEN'))
    const b = setup()
    type(b.editor, 'x')
    await act(() => b.hook.result.current.flush())
    expect(b.hook.result.current.blocked).toBe('forbidden')
  })

  it('other errors → status error, retried after 5 s', async () => {
    save.mockResolvedValueOnce(fail('INTERNAL'))
    const { editor, hook } = setup()
    type(editor, 'x')
    act(() => hook.result.current.schedule())
    await tick(800)
    expect(hook.result.current.status).toBe('error')
    expect(hook.result.current.blocked).toBe(false)
    await tick(4999)
    expect(save).toHaveBeenCalledTimes(1)
    await tick(1)
    expect(save).toHaveBeenCalledTimes(2)
    expect(hook.result.current.status).toBe('saved')
  })

  it('a thrown (network) error is retried too', async () => {
    save.mockRejectedValueOnce(new TypeError('offline'))
    const { editor, hook } = setup()
    type(editor, 'x')
    await act(() => hook.result.current.flush())
    expect(hook.result.current.status).toBe('error')
    await tick(5000)
    expect(save).toHaveBeenCalledTimes(2)
  })

  it('tab hidden → immediate save', async () => {
    const { editor } = setup()
    type(editor, 'x')
    const spy = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden')
    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'))
      await Promise.resolve()
    })
    expect(save).toHaveBeenCalledTimes(1)
    spy.mockRestore()
  })

  it('pagehide with a small dirty document → keepalive PUT', () => {
    const fetchMock = vi.fn<typeof fetch>(() => Promise.resolve(new Response(null, { status: 200 })))
    vi.stubGlobal('fetch', fetchMock)
    const { editor } = setup()
    type(editor, 'x'.repeat(1000))
    window.dispatchEvent(new Event('pagehide'))
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0]!
    expect(url).toBe(`/api/pages/${PAGE}/content`)
    expect(init).toMatchObject({ method: 'PUT', keepalive: true })
    expect(JSON.parse(init?.body as string)).toEqual({ baseVersion: 1, content: editor.document })
    const before = new Event('beforeunload', { cancelable: true })
    window.dispatchEvent(before)
    expect(before.defaultPrevented).toBe(false)
  })

  it('pagehide with a 70 KB document → no fetch; beforeunload prompts', () => {
    const fetchMock = vi.fn<typeof fetch>()
    vi.stubGlobal('fetch', fetchMock)
    const { editor } = setup()
    type(editor, 'x'.repeat(70_000))
    window.dispatchEvent(new Event('pagehide'))
    expect(fetchMock).not.toHaveBeenCalled()
    const before = new Event('beforeunload', { cancelable: true })
    window.dispatchEvent(before)
    expect(before.defaultPrevented).toBe(true)
  })

  it('nothing on leave when clean', () => {
    const fetchMock = vi.fn<typeof fetch>()
    vi.stubGlobal('fetch', fetchMock)
    setup()
    window.dispatchEvent(new Event('pagehide'))
    const before = new Event('beforeunload', { cancelable: true })
    window.dispatchEvent(before)
    expect(fetchMock).not.toHaveBeenCalled()
    expect(before.defaultPrevented).toBe(false)
  })

  it('unmount while dirty → one save', async () => {
    const { editor, hook } = setup()
    type(editor, 'x')
    act(() => hook.result.current.schedule())
    hook.unmount()
    await act(async () => void (await Promise.resolve()))
    expect(save).toHaveBeenCalledTimes(1)
    await tick(2000)
    expect(save).toHaveBeenCalledTimes(1)
  })

  it('disabled (read-only) → never saves', async () => {
    const { editor, hook } = setup({ enabled: false })
    type(editor, 'x')
    act(() => hook.result.current.schedule())
    await tick(2000)
    await act(() => hook.result.current.flush())
    expect(save).not.toHaveBeenCalled()
  })

  it('a change during a save is saved afterwards, one at a time', async () => {
    let release!: (r: ActionResult<SavePageResult>) => void
    save.mockReturnValueOnce(new Promise((r) => (release = r)))
    const { editor, hook } = setup()
    type(editor, 'x')
    act(() => hook.result.current.schedule())
    await tick(800)
    expect(save).toHaveBeenCalledTimes(1)
    type(editor, 'xy')
    act(() => hook.result.current.schedule())
    await tick(800)
    expect(save).toHaveBeenCalledTimes(1) // still in flight
    await act(async () => {
      release(okRes(2))
      await vi.advanceTimersByTimeAsync(0)
    })
    expect(save).toHaveBeenCalledTimes(2)
    expect(save.mock.calls[1]![0].baseVersion).toBe(2)
  })
})
