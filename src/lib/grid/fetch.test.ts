import { afterEach, describe, expect, it, vi } from 'vitest'
import { fetchGridChunk, gridChunkUrl } from './fetch'

const ctx = { kind: 'project', id: 'p' } as const

describe('gridChunkUrl (X65, M7-D17)', () => {
  it('maps a week chunk to from/to (8 weeks)', () => {
    expect(gridChunkUrl(ctx, { from: '2026-09-28', expand: [], zoom: 'WEEK', includeOthers: false })).toBe(
      '/api/grid/project/p?from=2026-09-28&to=2026-11-23',
    )
  })
  it('adds includeOthers=1 only when on', () => {
    expect(gridChunkUrl(ctx, { from: '2026-09-28', expand: [], zoom: 'WEEK', includeOthers: true })).toBe(
      '/api/grid/project/p?from=2026-09-28&to=2026-11-23&includeOthers=1',
    )
  })
  it('is ready for M7 expand / zoom=day', () => {
    expect(
      gridChunkUrl(ctx, { from: '2026-09-28', expand: ['2026-10-05'], zoom: 'DAY', includeOthers: false }),
    ).toBe('/api/grid/project/p?from=2026-09-28&to=2026-11-23&expand=2026-10-05&zoom=day')
  })
  it('uses the context kind in the path', () => {
    expect(
      gridChunkUrl(
        { kind: 'person', id: 'u' },
        { from: '2026-09-28', expand: [], zoom: 'WEEK', includeOthers: false },
      ),
    ).toBe('/api/grid/person/u?from=2026-09-28&to=2026-11-23')
  })
})

describe('fetchGridChunk', () => {
  afterEach(() => vi.unstubAllGlobals())
  it('GETs the chunk URL with the signal and returns the JSON', async () => {
    const body = { periods: [] }
    const fetchMock = vi.fn(() => Promise.resolve(new Response(JSON.stringify(body), { status: 200 })))
    vi.stubGlobal('fetch', fetchMock)
    const ac = new AbortController()
    const res = await fetchGridChunk(
      ctx,
      { from: '2026-09-28', expand: [], zoom: 'WEEK', includeOthers: false },
      ac.signal,
    )
    expect(res).toEqual(body)
    const call = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(call[0]).toBe('/api/grid/project/p?from=2026-09-28&to=2026-11-23')
    expect(call[1].signal).toBe(ac.signal)
  })
  it('throws ApiError on non-2xx', async () => {
    vi.stubGlobal('fetch', () =>
      Promise.resolve(new Response(JSON.stringify({ code: 'NOT_FOUND', message: 'x' }), { status: 404 })),
    )
    await expect(
      fetchGridChunk(
        ctx,
        { from: '2026-09-28', expand: [], zoom: 'WEEK', includeOthers: false },
        new AbortController().signal,
      ),
    ).rejects.toMatchObject({ name: 'ApiError', status: 404, code: 'NOT_FOUND' })
  })
})
