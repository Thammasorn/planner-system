// S2.7 — edit lease polling, held / displaced / takeover flows, view-only polling, release (FR-540…542, M4-D3).
import { act, render, renderHook, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { toast } from 'sonner'
import { th } from '@/i18n/th'
import type { LeaseState } from '@/lib/contracts/pages'
import { LeaseBanner } from './LeaseBanner'
import { type EditLeaseOptions, LEASE_HEARTBEAT_MS, useEditLease } from './useEditLease'

const urlOf = (u: RequestInfo | URL): string =>
  typeof u === 'string' ? u : u instanceof URL ? u.href : u.url

const PAGE = '7c9e6679-7425-40de-944b-e07fc1f90ae7'
const mine = (version = 1): LeaseState => ({
  mine: true,
  holder: { userId: 'me', name: 'Me' },
  expiresAt: null,
  version,
})
const theirs = (name = 'Cindy', version = 1): LeaseState => ({
  mine: false,
  holder: { userId: 'u-cindy', name },
  expiresAt: null,
  version,
})
const json = (body: unknown) =>
  new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } })

const fetchMock = vi.fn<typeof fetch>()
const calls = () => fetchMock.mock.calls.map(([u, init]) => `${init?.method ?? 'GET'} ${urlOf(u)}`)
/** Queue lease answers for POST/GET; DELETE answers 204. */
function answer(...leases: LeaseState[]) {
  fetchMock.mockImplementation((_u, init) => {
    if (init?.method === 'DELETE') return Promise.resolve(new Response(null, { status: 204 }))
    const next = leases.length > 1 ? leases.shift()! : leases[0]!
    return Promise.resolve(json(next))
  })
}

function setup(over: Partial<EditLeaseOptions> = {}) {
  const order: string[] = []
  const o: EditLeaseOptions = {
    pageId: PAGE,
    canEdit: true,
    getVersion: () => 2,
    isDirty: () => false,
    flush: vi.fn(async () => void order.push('flush')),
    onRemoteVersion: vi.fn(async (v: number) => void order.push(`remote:${v}`)),
    ...over,
  }
  const hook = renderHook((p: EditLeaseOptions) => useEditLease(p), { initialProps: o })
  return { o, hook, order }
}
const settle = () => act(async () => void (await vi.advanceTimersByTimeAsync(0)))

describe('useEditLease', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    fetchMock.mockReset()
    vi.stubGlobal('fetch', fetchMock)
  })
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('POST mine → editing; heartbeat every 30 s; extra POST when the tab is visible again', async () => {
    answer(mine(2))
    const { hook } = setup()
    expect(hook.result.current.mode).toBe('loading')
    await settle()
    expect(hook.result.current.mode).toBe('editing')
    expect(calls()).toEqual([`POST /api/pages/${PAGE}/lock`])
    // FR-541 pins the literal 30 s (not the exported constant, which would make this a tautology).
    expect(LEASE_HEARTBEAT_MS).toBe(30_000)
    await act(async () => void (await vi.advanceTimersByTimeAsync(29_999)))
    expect(calls()).toHaveLength(1)
    await act(async () => void (await vi.advanceTimersByTimeAsync(1)))
    expect(calls()).toHaveLength(2)
    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'))
      await vi.advanceTimersByTimeAsync(0)
    })
    expect(calls()).toEqual(Array(3).fill(`POST /api/pages/${PAGE}/lock`))
  })

  it('held by Cindy → held + banner; later mine with a newer version → fresh content before editing', async () => {
    answer(theirs('Cindy', 2), mine(3))
    const { hook, o, order } = setup()
    await settle()
    expect(hook.result.current.mode).toBe('held')
    render(
      <LeaseBanner
        mode={hook.result.current.mode}
        lease={hook.result.current.lease}
        onTakeover={() => {}}
        onRetry={() => {}}
      />,
    )
    expect(screen.getByTestId('lease-banner')).toHaveTextContent(th.editor.lease.heldBy('Cindy'))
    expect(screen.getByRole('button', { name: th.editor.lease.takeover })).toBeInTheDocument()
    await act(async () => void (await vi.advanceTimersByTimeAsync(LEASE_HEARTBEAT_MS)))
    expect(o.onRemoteVersion).toHaveBeenCalledWith(3)
    expect(order).toEqual(['remote:3'])
    expect(hook.result.current.mode).toBe('editing')
  })

  it('mine with the same version → no reload', async () => {
    answer(mine(2))
    const { o } = setup()
    await settle()
    expect(o.onRemoteVersion).not.toHaveBeenCalled()
  })

  it('editing, then not mine → flush first, then displaced', async () => {
    answer(mine(2), theirs('Ivy', 2))
    const { hook, o } = setup()
    await settle()
    expect(hook.result.current.mode).toBe('editing')
    await act(async () => void (await vi.advanceTimersByTimeAsync(LEASE_HEARTBEAT_MS)))
    expect(o.flush).toHaveBeenCalledOnce()
    expect(hook.result.current.mode).toBe('displaced')
    expect(hook.result.current.unsaved).toBe(false)
    render(
      <LeaseBanner
        mode="displaced"
        lease={hook.result.current.lease}
        unsaved={hook.result.current.unsaved}
        onTakeover={() => {}}
        onRetry={() => {}}
      />,
    )
    expect(screen.getByTestId('lease-banner')).toHaveTextContent(th.editor.lease.takenOverBy('Ivy'))
  })

  it('displaced while the flush failed (still dirty) → unsaved banner, never "saved"; a later save clears it', async () => {
    answer(mine(2), theirs('Ivy', 2))
    let dirty = true
    const flush = vi.fn(async () => {}) // useAutosave swallows a generic save error: resolves, still dirty
    const { hook } = setup({ isDirty: () => dirty, flush })
    await settle()
    await act(async () => void (await vi.advanceTimersByTimeAsync(LEASE_HEARTBEAT_MS)))
    expect(flush).toHaveBeenCalledOnce()
    expect(hook.result.current.mode).toBe('displaced')
    expect(hook.result.current.unsaved).toBe(true)
    const onRetrySave = vi.fn(() => void hook.result.current.retrySave())
    const view = render(
      <LeaseBanner
        mode="displaced"
        lease={hook.result.current.lease}
        unsaved={hook.result.current.unsaved}
        onTakeover={() => {}}
        onRetry={() => {}}
        onRetrySave={onRetrySave}
      />,
    )
    const banner = screen.getByTestId('lease-banner')
    expect(banner).toHaveTextContent(th.editor.lease.takenOverUnsaved('Ivy'))
    expect(banner).not.toHaveTextContent(th.editor.lease.takenOverBy('Ivy'))
    expect(banner).toHaveAttribute('data-unsaved', 'true')
    // retry still failing → still unsaved
    await act(async () => {
      screen.getByRole('button', { name: th.editor.lease.retrySave }).click()
      await vi.advanceTimersByTimeAsync(0)
    })
    expect(onRetrySave).toHaveBeenCalledOnce()
    expect(flush).toHaveBeenCalledTimes(2)
    expect(hook.result.current.unsaved).toBe(true)
    // the retry succeeds → clean
    dirty = false
    await act(() => hook.result.current.retrySave())
    expect(hook.result.current.unsaved).toBe(false)
    expect(hook.result.current.mode).toBe('displaced')
    view.unmount()
  })

  it('displaced + unsaved: an autosave retry reporting the lease clears `unsaved`', async () => {
    answer(mine(2), theirs('Ivy', 2))
    let dirty = true
    const { hook } = setup({ isDirty: () => dirty, flush: vi.fn(async () => {}) })
    await settle()
    await act(async () => void (await vi.advanceTimersByTimeAsync(LEASE_HEARTBEAT_MS)))
    expect(hook.result.current.unsaved).toBe(true)
    dirty = false // useAutosave's own 5 s retry saved, then calls onLease(res.lease)
    await act(async () => {
      hook.result.current.report(theirs('Ivy', 3))
      await vi.advanceTimersByTimeAsync(0)
    })
    expect(hook.result.current.unsaved).toBe(false)
    expect(hook.result.current.mode).toBe('displaced')
  })

  it('takeover → POST ?takeover=1, fresh content, then editing', async () => {
    answer(theirs('Cindy', 2), mine(4))
    const { hook, o } = setup()
    await settle()
    expect(hook.result.current.mode).toBe('held')
    await act(() => hook.result.current.takeover())
    expect(calls().at(-1)).toBe(`POST /api/pages/${PAGE}/lock?takeover=1`)
    expect(o.onRemoteVersion).toHaveBeenCalledWith(4)
    expect(hook.result.current.mode).toBe('editing')
  })

  it('cannot edit → only GET polls, viewOnly; a newer version reloads silently', async () => {
    answer(theirs('Cindy', 2), theirs('Cindy', 3))
    const { hook, o } = setup({ canEdit: false })
    await settle()
    expect(hook.result.current.mode).toBe('viewOnly')
    expect(o.onRemoteVersion).not.toHaveBeenCalled()
    await act(async () => void (await vi.advanceTimersByTimeAsync(LEASE_HEARTBEAT_MS)))
    expect(o.onRemoteVersion).toHaveBeenCalledWith(3)
    expect(calls().every((c) => c.startsWith('GET '))).toBe(true)
    render(
      <LeaseBanner
        mode="viewOnly"
        lease={hook.result.current.lease}
        onTakeover={() => {}}
        onRetry={() => {}}
      />,
    )
    expect(screen.getByTestId('lease-banner')).toHaveTextContent(th.editor.lease.heldBy('Cindy'))
    expect(screen.queryByRole('button')).toBeNull()
  })

  it('unmount while editing → DELETE with keepalive', async () => {
    answer(mine(2))
    const { hook } = setup()
    await settle()
    hook.unmount()
    const del = fetchMock.mock.calls.find(([, init]) => init?.method === 'DELETE')
    expect(del?.[0]).toBe(`/api/pages/${PAGE}/lock`)
    expect(del?.[1]).toMatchObject({ method: 'DELETE', keepalive: true })
  })

  it('pagehide while editing releases; not while held', async () => {
    answer(mine(2))
    setup()
    await settle()
    window.dispatchEvent(new Event('pagehide'))
    expect(calls()).toContain(`DELETE /api/pages/${PAGE}/lock`)

    fetchMock.mockClear()
    answer(theirs())
    const b = setup()
    await settle()
    expect(b.hook.result.current.mode).toBe('held')
    b.hook.unmount()
    expect(calls().some((c) => c.startsWith('DELETE'))).toBe(false)
  })

  it('a network error keeps the mode', async () => {
    answer(mine(2))
    const { hook } = setup()
    await settle()
    fetchMock.mockRejectedValue(new TypeError('offline'))
    await act(async () => void (await vi.advanceTimersByTimeAsync(LEASE_HEARTBEAT_MS)))
    expect(hook.result.current.mode).toBe('editing')
  })

  it('the first acquire failing → "lost" banner (never a silent read-only); "แก้ต่อ" asks again at once', async () => {
    fetchMock.mockRejectedValue(new TypeError('offline'))
    const { hook } = setup()
    await settle()
    expect(hook.result.current.mode).toBe('lost')
    const onRetry = vi.fn(() => void hook.result.current.retry())
    render(
      <LeaseBanner mode={hook.result.current.mode} lease={null} onTakeover={() => {}} onRetry={onRetry} />,
    )
    expect(screen.getByTestId('lease-banner')).toHaveTextContent(th.editor.lease.lost)
    answer(mine(2))
    await act(async () => {
      screen.getByRole('button', { name: th.editor.lease.reacquire }).click()
      await vi.advanceTimersByTimeAsync(0)
    })
    expect(onRetry).toHaveBeenCalledOnce()
    expect(hook.result.current.mode).toBe('editing')
  })

  it('a failed takeover → error toast, still held', async () => {
    const spy = vi.spyOn(toast, 'error')
    answer(theirs('Cindy', 2))
    const { hook, o } = setup()
    await settle()
    fetchMock.mockRejectedValue(new TypeError('offline'))
    await act(() => hook.result.current.takeover())
    expect(spy).toHaveBeenCalledWith(th.editor.lease.takeoverFailed)
    expect(hook.result.current.mode).toBe('held')
    expect(o.onRemoteVersion).not.toHaveBeenCalled()
    spy.mockRestore()
  })
})
