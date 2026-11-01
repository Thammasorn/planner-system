import { act, renderHook, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { th } from '@/i18n/th'
import { ActionFailure } from '@/lib/action-result'
import type { GridAssigneeRow, GridResponse, SaveAllocationsInput } from '@/lib/contracts/grid'
import { posChunks } from '@/lib/grid/fixtures.test.data'
import type { CellWrite } from '@/lib/grid/queue'
import { conflictEpoch, knownVersion, resetVersions } from '@/lib/grid/versions'
import { qk } from '@/lib/query-keys'
import { newQueryClient, Providers } from './render.test.helper'
import { SAVE_DEBOUNCE_MS, useSaveAllocations } from './useSaveAllocations'

const m = vi.hoisted(() => ({ saveAllocations: vi.fn() }))
vi.mock('@/server/actions/allocations', () => ({ saveAllocations: m.saveAllocations }))

const ctx = { kind: 'project', id: 'p-pos' } as const
const w = (period: string, cd: number | null, id = 'a-cindy-pos'): CellWrite => ({
  taskAssignmentId: id,
  granularity: 'WEEK',
  period,
  cd,
})
const okFor = (input: SaveAllocationsInput, version = 2) => ({
  ok: true as const,
  results: input.items.map((i) => ({
    taskAssignmentId: i.taskAssignmentId,
    version,
    weeks: Object.fromEntries(
      i.changes.map((c) => [
        c.period,
        c.cd ? { cd: c.cd, resolution: 'WEEK' as const } : { cd: 0, resolution: null },
      ]),
    ),
    rowTotal: { total: 1, committed: 1 },
  })),
  warnings: [],
})

function setup() {
  const qc = newQueryClient()
  const [a, b] = posChunks()
  const keyA = qk.gridChunk(ctx, { from: '2026-08-31', expand: [], zoom: 'WEEK', includeOthers: false })
  const keyB = qk.gridChunk(ctx, { from: '2026-10-26', expand: [], zoom: 'WEEK', includeOthers: false })
  qc.setQueryData(keyA, a)
  qc.setQueryData(keyB, b)
  const wrapper = ({ children }: { children: ReactNode }) => <Providers qc={qc}>{children}</Providers>
  const hook = renderHook(() => useSaveAllocations(ctx), { wrapper })
  const cell = (period: string, id = 'a-cindy-pos') =>
    qc
      .getQueryData<GridResponse>(keyA)!
      .rows.find((r): r is GridAssigneeRow => r.kind === 'assignee' && r.taskAssignmentId === id)!.cells[
      `W:${period}`
    ]
  return { qc, hook, cell }
}

beforeEach(() => {
  resetVersions()
  m.saveAllocations.mockReset()
})
afterEach(() => vi.useRealTimers())

describe('useSaveAllocations (§7.4, S3.6)', () => {
  it('applies writes at once and batches two enqueues within 400 ms into one call', async () => {
    vi.useFakeTimers()
    m.saveAllocations.mockImplementation((input: SaveAllocationsInput) => Promise.resolve(okFor(input)))
    const { hook, cell } = setup()
    act(() => void hook.result.current.enqueue([w('2026-10-05', 300)]))
    expect(cell('2026-10-05')?.cd).toBe(300)
    expect(hook.result.current.state).toBe('pending')
    await act(async () => {
      await vi.advanceTimersByTimeAsync(200)
    })
    act(() => void hook.result.current.enqueue([w('2026-10-12', 300)]))
    await act(async () => {
      await vi.advanceTimersByTimeAsync(SAVE_DEBOUNCE_MS - 1)
    })
    expect(m.saveAllocations).not.toHaveBeenCalled()
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5)
    })
    expect(m.saveAllocations).toHaveBeenCalledTimes(1)
    const input = m.saveAllocations.mock.calls[0]![0] as SaveAllocationsInput
    expect(input.items).toEqual([
      {
        taskAssignmentId: 'a-cindy-pos',
        baseVersion: 1,
        changes: [
          { granularity: 'WEEK', period: '2026-10-05', cd: 300 },
          { granularity: 'WEEK', period: '2026-10-12', cd: 300 },
        ],
      },
    ])
    expect(input.clientOpId).toMatch(/^op-\d+$/)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10)
    })
    expect(hook.result.current.state).toBe('idle')
    expect(knownVersion('a-cindy-pos')).toBe(2)
  })

  it('flush (grid blur) sends at once', async () => {
    m.saveAllocations.mockImplementation((input: SaveAllocationsInput) => Promise.resolve(okFor(input)))
    const { hook } = setup()
    act(() => void hook.result.current.enqueue([w('2026-10-05', 300)]))
    await act(async () => {
      await hook.result.current.flush()
    })
    expect(m.saveAllocations).toHaveBeenCalledTimes(1)
    expect(hook.result.current.state).toBe('idle')
  })

  describe('flush triggers without waiting for the 400 ms debounce (§7.4)', () => {
    const pendingEdit = () => {
      vi.useFakeTimers()
      m.saveAllocations.mockImplementation((input: SaveAllocationsInput) => Promise.resolve(okFor(input)))
      const s = setup()
      act(() => void s.hook.result.current.enqueue([w('2026-10-05', 300)]))
      expect(s.hook.result.current.state).toBe('pending')
      expect(m.saveAllocations).not.toHaveBeenCalled()
      return s
    }
    /** settles promises only: a 0 ms advance never reaches the debounce timer */
    const settle = () =>
      act(async () => {
        await vi.advanceTimersByTimeAsync(0)
      })
    const sentOnce = () => {
      expect(m.saveAllocations).toHaveBeenCalledTimes(1)
      const input = m.saveAllocations.mock.calls[0]![0] as SaveAllocationsInput
      expect(input.items[0]!.changes).toEqual([{ granularity: 'WEEK', period: '2026-10-05', cd: 300 }])
    }

    it('pagehide', async () => {
      pendingEdit()
      act(() => void window.dispatchEvent(new Event('pagehide')))
      await settle()
      sentOnce()
    })

    it('visibilitychange → hidden (not while visible)', async () => {
      pendingEdit()
      const spy = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible')
      try {
        act(() => void document.dispatchEvent(new Event('visibilitychange')))
        await settle()
        expect(m.saveAllocations).not.toHaveBeenCalled()
        spy.mockReturnValue('hidden')
        act(() => void document.dispatchEvent(new Event('visibilitychange')))
        await settle()
        sentOnce()
      } finally {
        spy.mockRestore()
      }
    })

    it('unmount (route change)', async () => {
      const { hook } = pendingEdit()
      hook.unmount()
      await settle()
      sentOnce()
    })

    it('a flushed edit is not sent again when the debounce would have fired', async () => {
      pendingEdit()
      act(() => void window.dispatchEvent(new Event('pagehide')))
      await act(async () => {
        await vi.advanceTimersByTimeAsync(SAVE_DEBOUNCE_MS * 2)
      })
      sentOnce()
    })
  })

  it('a failing save restores the snapshot when alone and offers retry', async () => {
    m.saveAllocations.mockRejectedValueOnce(new Error('network'))
    const { hook, cell } = setup()
    act(() => void hook.result.current.enqueue([w('2026-08-31', 400)]))
    expect(cell('2026-08-31')?.cd).toBe(400)
    await act(async () => {
      await hook.result.current.flush()
    })
    expect(cell('2026-08-31')?.cd).toBe(500)
    expect(hook.result.current.state).toBe('error')
    expect(await screen.findByText(th.grid.toast.saveFailed)).toBeInTheDocument()
    m.saveAllocations.mockImplementation((input: SaveAllocationsInput) => Promise.resolve(okFor(input, 3)))
    await act(async () => {
      hook.result.current.retry()
      await hook.result.current.flush()
    })
    expect(m.saveAllocations).toHaveBeenCalledTimes(2)
    expect(cell('2026-08-31')?.cd).toBe(400)
    expect(hook.result.current.state).toBe('idle')
  })

  it('queued saves keep their order and read the version at send time (scope)', async () => {
    let release!: () => void
    const calls: SaveAllocationsInput[] = []
    m.saveAllocations.mockImplementation((input: SaveAllocationsInput) => {
      calls.push(input)
      if (calls.length === 1) return new Promise((r) => (release = () => r(okFor(input, 2))))
      return Promise.resolve(okFor(input, 3))
    })
    const { hook } = setup()
    let first!: Promise<unknown>
    let second!: Promise<unknown>
    act(() => {
      first = hook.result.current.enqueue([w('2026-08-31', 100)], { immediate: true })
      second = hook.result.current.enqueue([w('2026-09-07', 200)], { immediate: true })
    })
    await act(async () => {
      await Promise.resolve()
    })
    expect(calls).toHaveLength(1)
    await act(async () => {
      release()
      await first
      await second
    })
    expect(calls).toHaveLength(2)
    expect(calls[0]!.items[0]!.changes[0]!.period).toBe('2026-08-31')
    expect(calls[1]!.items[0]!.baseVersion).toBe(2)
    expect(calls[1]!.onDayWeekConflict).toBeUndefined()
  })

  it('VERSION_CONFLICT applies the server state, bumps the epoch and warns', async () => {
    m.saveAllocations.mockResolvedValueOnce({
      ok: false,
      code: 'VERSION_CONFLICT',
      message: 'x',
      current: [
        {
          taskAssignmentId: 'a-cindy-pos',
          version: 5,
          weeks: { '2026-08-31': { cd: 100, resolution: 'WEEK' } },
          rowTotal: { total: 1475, committed: 1475 },
        },
      ],
    })
    const { hook, cell } = setup()
    act(() => void hook.result.current.enqueue([w('2026-08-31', 200)]))
    await act(async () => {
      await hook.result.current.flush()
    })
    expect(cell('2026-08-31')?.cd).toBe(100)
    expect(knownVersion('a-cindy-pos')).toBe(5)
    expect(conflictEpoch('a-cindy-pos')).toBe(1)
    expect(await screen.findByText(th.grid.toast.conflict)).toBeInTheDocument()
  })

  it('VALIDATION issues (UNREPRESENTABLE) revert those weeks only and re-send the rest (M7)', async () => {
    m.saveAllocations
      .mockResolvedValueOnce({
        ok: false,
        code: 'VALIDATION',
        message: th.grid.errors.invalidBatch,
        issues: [{ taskAssignmentId: 'a-cindy-pos', period: '2026-09-07', reason: 'UNREPRESENTABLE' }],
      })
      .mockImplementation((input: SaveAllocationsInput) => Promise.resolve(okFor(input)))
    const { hook, cell } = setup()
    act(() => void hook.result.current.enqueue([w('2026-09-07', 100), w('2026-09-14', 100)]))
    await act(async () => {
      await hook.result.current.flush()
    })
    expect(cell('2026-09-07')?.cd).toBe(500)
    expect(cell('2026-09-14')?.cd).toBe(100)
    expect(await screen.findByText(th.grid.day.unrepresentable)).toBeInTheDocument()
    await act(async () => {
      await hook.result.current.flush()
    })
    const resent = m.saveAllocations.mock.calls[1]![0] as SaveAllocationsInput
    expect(resent.items[0]!.changes).toEqual([{ granularity: 'WEEK', period: '2026-09-14', cd: 100 }])
  })

  it('a batch never mixes onDayWeekConflict values: the queue flushes first (M7-D4)', async () => {
    m.saveAllocations.mockImplementation((input: SaveAllocationsInput) => Promise.resolve(okFor(input)))
    const { hook } = setup()
    act(() => {
      void hook.result.current.enqueue([w('2026-10-05', 300)])
      void hook.result.current.enqueue([w('2026-10-12', 200)], { onDayWeekConflict: 'SCALE' })
    })
    await act(async () => {
      await hook.result.current.flush()
    })
    const calls = m.saveAllocations.mock.calls.map((c) => c[0] as SaveAllocationsInput)
    expect(calls).toHaveLength(2)
    expect(calls[0]!.onDayWeekConflict).toBeUndefined()
    expect(calls[1]!.onDayWeekConflict).toBe('SCALE')
  })

  it('a day change for a week with a queued WEEK change flushes first (M7-D6)', async () => {
    m.saveAllocations.mockImplementation((input: SaveAllocationsInput) => Promise.resolve(okFor(input)))
    const { hook } = setup()
    act(() => {
      void hook.result.current.enqueue([w('2026-10-05', 300)])
      void hook.result.current.enqueue([
        { taskAssignmentId: 'a-cindy-pos', granularity: 'DAY', period: '2026-10-07', cd: 100 },
      ])
    })
    await act(async () => {
      await hook.result.current.flush()
    })
    expect(m.saveAllocations).toHaveBeenCalledTimes(2)
  })

  it('NEEDS_CHOICE (stale cache) asks onNeedsChoice and re-sends the batch with the choice', async () => {
    m.saveAllocations
      .mockResolvedValueOnce({
        ok: false,
        code: 'NEEDS_CHOICE',
        message: 'x',
        week: '2026-09-07',
        weeks: ['2026-09-07'],
        pairs: [{ taskAssignmentId: 'a-cindy-pos', week: '2026-09-07' }],
      })
      .mockImplementation((input: SaveAllocationsInput) => Promise.resolve(okFor(input)))
    const qc = newQueryClient()
    const [a, b] = posChunks()
    qc.setQueryData(qk.gridChunk(ctx, { from: '2026-08-31', expand: [], zoom: 'WEEK', includeOthers: false }), a)
    qc.setQueryData(qk.gridChunk(ctx, { from: '2026-10-26', expand: [], zoom: 'WEEK', includeOthers: false }), b)
    const onNeedsChoice = vi.fn(() => Promise.resolve('COLLAPSE' as const))
    const wrapper = ({ children }: { children: ReactNode }) => <Providers qc={qc}>{children}</Providers>
    const hook = renderHook(() => useSaveAllocations(ctx, { onNeedsChoice }), { wrapper })
    act(() => void hook.result.current.enqueue([w('2026-09-07', 100)]))
    await act(async () => {
      await hook.result.current.flush()
    })
    await act(async () => {
      await Promise.resolve()
      await hook.result.current.flush()
    })
    expect(onNeedsChoice).toHaveBeenCalledTimes(1)
    const resent = m.saveAllocations.mock.calls[1]![0] as SaveAllocationsInput
    expect(resent.onDayWeekConflict).toBe('COLLAPSE')
    expect(resent.items[0]!.changes).toEqual([{ granularity: 'WEEK', period: '2026-09-07', cd: 100 }])
  })

  it('SPILLED_OVER_DAY_LIMIT toasts the split-clamped text (M7-D8)', async () => {
    m.saveAllocations.mockImplementation((input: SaveAllocationsInput) =>
      Promise.resolve({
        ...okFor(input),
        warnings: [{ code: 'SPILLED_OVER_DAY_LIMIT', taskAssignmentId: 'a-cindy-pos', week: '2026-10-05' }],
      }),
    )
    const { hook } = setup()
    act(() => void hook.result.current.enqueue([w('2026-10-05', 300)]))
    await act(async () => {
      await hook.result.current.flush()
    })
    expect(await screen.findByText(th.grid.day.splitClampedToast)).toBeInTheDocument()
  })

  it('ActionFailure is what unwrap throws (sanity)', () => {
    expect(
      new ActionFailure({ ok: false, code: 'VERSION_CONFLICT', message: 'x', current: [] }).extra,
    ).toEqual({ current: [] })
  })
})
