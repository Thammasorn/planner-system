'use client'
// src/components/grid/useSaveAllocations.ts — grid saves (SPEC §7.4, PLAN §3.10, X65, M6-D3/D13/D14; based on
// plan/research/snippets/r4/client/components/grid/useSaveAllocations.ts).
// - enqueue applies the writes to every cached chunk at once (< 50 ms), coalesces them and (re)starts a 400 ms debounce;
//   `immediate` (undo / redo) flushes first and sends its own batch with onDayWeekConflict 'COLLAPSE'.
// - One scoped mutation queue per context; baseVersion is read from the version registry at send time.
// - Success: versions remembered, server weeks patched into every chunk (no refetch), warnings toasted, other views
//   invalidated (invalidateAfterGridSave). Failure: rollback when alone (else resync), retry toast; VERSION_CONFLICT:
//   server state + conflict epoch bump + toast; DAY_WEEK validation: those weeks revert + toast.
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import type { ISODate } from '@/domain/types'
import { weekStart } from '@/domain/dates'
import { th } from '@/i18n/th'
import { ActionFailure, unwrap } from '@/lib/action-result'
import type {
  GridResponse,
  SaveAllocationsInput,
  SaveAllocationsItem,
  SaveAllocationsOk,
  SaveItemResult,
  SaveValidationIssue,
} from '@/lib/contracts/grid'
import {
  applyConflicts,
  applyServerResults,
  applyWritesOptimistically,
  cachedCell,
  rowTotalDeltas,
} from '@/lib/grid/cache-ops'
import { coalesce, toItems, type CellWrite } from '@/lib/grid/queue'
import { invalidateAfterGridSave } from '@/lib/grid/save-invalidate'
import { snapshotOf, snapshotWrites, type WeekSnapshot } from '@/lib/grid/undo'
import { bumpConflictEpoch, knownVersion, rememberVersion } from '@/lib/grid/versions'
import { qk, type GridCtx } from '@/lib/query-keys'
import { saveAllocations } from '@/server/actions/allocations'

export type SaveState = 'idle' | 'pending' | 'saving' | 'error'

export const SAVE_DEBOUNCE_MS = 400

interface Batch {
  id: number
  writes: CellWrite[]
  /** first-seen snapshot per (assignment, week) — the rollback target */
  before: Map<string, WeekSnapshot>
  onDayWeekConflict?: 'COLLAPSE'
  sent?: SaveAllocationsItem[]
  resolve: (v: SaveAllocationsOk | null) => void
  promise: Promise<SaveAllocationsOk | null>
}

export interface SaveApi {
  enqueue(
    writes: readonly CellWrite[],
    o?: { onDayWeekConflict?: 'COLLAPSE'; immediate?: boolean },
  ): Promise<SaveAllocationsOk | null>
  flush(): Promise<void>
  retry(): void
  state: SaveState
}

let opSeq = 0
const nextOpId = () => `op-${++opSeq}`
let batchSeq = 0

const weekOf = (w: CellWrite): ISODate => (w.granularity === 'WEEK' ? w.period : weekStart(w.period))
const snapKey = (taId: string, week: ISODate) => `${taId}|${week}`

function newBatch(
  writes: CellWrite[],
  before: Map<string, WeekSnapshot>,
  onDayWeekConflict?: 'COLLAPSE',
): Batch {
  let resolve!: (v: SaveAllocationsOk | null) => void
  const promise = new Promise<SaveAllocationsOk | null>((r) => (resolve = r))
  return {
    id: ++batchSeq,
    writes,
    before,
    ...(onDayWeekConflict ? { onDayWeekConflict } : {}),
    resolve,
    promise,
  }
}

function startsWith(key: readonly unknown[], prefix: readonly unknown[]): boolean {
  return prefix.every((p, i) => key[i] === p)
}

export function useSaveAllocations(ctx: GridCtx, o: { onConflict?: (ids: string[]) => void } = {}): SaveApi {
  const qc = useQueryClient()
  const prefix = useMemo(() => qk.gridAll(ctx), [ctx])
  const mutationKey = useMemo(() => ['saveAllocations', ctx.id], [ctx.id])
  const pending = useRef<Batch | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const outstanding = useRef(new Map<number, Batch>())
  const failed = useRef<Batch | null>(null)
  const onConflict = useRef(o.onConflict)
  useEffect(() => {
    onConflict.current = o.onConflict
  })
  const [state, setState] = useState<SaveState>('idle')

  const sync = useCallback(() => {
    setState(
      outstanding.current.size > 0
        ? 'saving'
        : pending.current
          ? 'pending'
          : failed.current
            ? 'error'
            : 'idle',
    )
  }, [])

  const chunks = useCallback(
    () => qc.getQueriesData<GridResponse>({ queryKey: prefix }).map(([, d]) => d),
    [qc, prefix],
  )

  const applyOptimistic = useCallback(
    (writes: readonly CellWrite[]) => {
      if (writes.length === 0) return
      const deltas = rowTotalDeltas(chunks(), writes)
      qc.setQueriesData<GridResponse>({ queryKey: prefix }, (old) =>
        old ? applyWritesOptimistically(old, writes, deltas) : old,
      )
    },
    [qc, prefix, chunks],
  )

  const captureBefore = useCallback(
    (writes: readonly CellWrite[], into: Map<string, WeekSnapshot>) => {
      const cs = chunks()
      for (const w of writes) {
        const week = weekOf(w)
        const k = snapKey(w.taskAssignmentId, week)
        if (!into.has(k))
          into.set(k, snapshotOf(cachedCell(cs, w.taskAssignmentId, week), w.taskAssignmentId, week))
      }
    },
    [chunks],
  )

  /** Writes that the server has not confirmed yet (sent or pending), in send order. */
  const unconfirmed = useCallback((after?: number): CellWrite[] => {
    const out: CellWrite[] = []
    for (const b of [...outstanding.current.values()].sort((a, b2) => a.id - b2.id)) {
      if (after === undefined || b.id > after) out.push(...b.writes)
    }
    if (pending.current) out.push(...pending.current.writes)
    return out
  }, [])

  const rollback = useCallback(
    (snaps: Iterable<WeekSnapshot>) => {
      applyOptimistic([...snaps].flatMap(snapshotWrites))
      applyOptimistic(unconfirmed()) // keep later edits on top
    },
    [applyOptimistic, unconfirmed],
  )

  // a refetch that lands while edits are unconfirmed must not wipe them: re-apply them on fresh data
  useEffect(
    () =>
      qc.getQueryCache().subscribe((ev) => {
        if (ev.type !== 'updated' || ev.action.type !== 'success' || ev.action.manual) return
        const key = ev.query.queryKey as readonly unknown[]
        if (!startsWith(key, prefix)) return
        const writes = unconfirmed()
        if (writes.length === 0) return
        qc.setQueryData<GridResponse>(key, (old) => (old ? applyWritesOptimistically(old, writes) : old))
      }),
    [qc, prefix, unconfirmed],
  )

  const requeue = useRef<(writes: CellWrite[], before: Map<string, WeekSnapshot>) => void>(() => {})

  const mutation = useMutation<SaveAllocationsOk, Error, Batch>({
    mutationKey,
    scope: { id: `grid-save:${ctx.id}` },
    mutationFn: async (b) => {
      const items = toItems(b.writes, knownVersion) // versions read at send time (scope serialises batches)
      b.sent = items
      const input: SaveAllocationsInput = {
        items,
        clientOpId: nextOpId(),
        ...(b.onDayWeekConflict ? { onDayWeekConflict: b.onDayWeekConflict } : {}),
      }
      return unwrap(await saveAllocations(input))
    },
    onSuccess: (ok, b) => {
      for (const r of ok.results) rememberVersion(r.taskAssignmentId, r.version)
      outstanding.current.delete(b.id)
      qc.setQueriesData<GridResponse>({ queryKey: prefix }, (old) =>
        old ? applyServerResults(old, ok) : old,
      )
      applyOptimistic(unconfirmed(b.id))
      const codes = new Set(ok.warnings.map((w) => w.code))
      for (const code of codes) toast.warning(th.grid.toast.warning[code])
      invalidateAfterGridSave(qc, ctx)
      b.resolve(ok)
      sync()
    },
    onError: (err, b) => {
      outstanding.current.delete(b.id)
      if (err instanceof ActionFailure && err.code === 'VERSION_CONFLICT') {
        const current = (Array.isArray(err.extra.current) ? err.extra.current : []) as SaveItemResult[]
        const sentVersion = new Map((b.sent ?? []).map((i) => [i.taskAssignmentId, i.baseVersion]))
        let conflicted = current.filter((c) => c.version !== sentVersion.get(c.taskAssignmentId))
        if (conflicted.length === 0) conflicted = current
        const ids = new Set(conflicted.map((c) => c.taskAssignmentId))
        for (const c of current) rememberVersion(c.taskAssignmentId, c.version)
        for (const id of ids) bumpConflictEpoch(id)
        if (pending.current)
          pending.current.writes = pending.current.writes.filter((w) => !ids.has(w.taskAssignmentId))
        qc.setQueriesData<GridResponse>({ queryKey: prefix }, (old) =>
          old ? applyConflicts(old, conflicted) : old,
        )
        void qc.invalidateQueries({ queryKey: prefix })
        const rest = b.writes.filter((w) => !ids.has(w.taskAssignmentId))
        if (rest.length > 0) requeue.current(rest, b.before)
        toast.warning(th.grid.toast.conflict)
        onConflict.current?.([...ids])
      } else if (
        err instanceof ActionFailure &&
        err.code === 'VALIDATION' &&
        Array.isArray(err.extra.issues) &&
        (err.extra.issues as SaveValidationIssue[]).some((i) => i.reason === 'DAY_WEEK')
      ) {
        const bad = new Set(
          (err.extra.issues as SaveValidationIssue[])
            .filter((i) => i.reason === 'DAY_WEEK')
            .map((i) => snapKey(i.taskAssignmentId, weekStart(i.period))),
        )
        rollback([...b.before].filter(([k]) => bad.has(k)).map(([, s]) => s))
        const rest = b.writes.filter((w) => !bad.has(snapKey(w.taskAssignmentId, weekOf(w))))
        if (rest.length > 0) requeue.current(rest, b.before)
        toast(th.grid.toast.dayWeekReadOnly)
      } else {
        // isMutating still counts the failing mutation inside onError (r4 §6)
        if (qc.isMutating({ mutationKey }) <= 1) rollback(b.before.values())
        else void qc.invalidateQueries({ queryKey: prefix })
        const retryable = !(err instanceof ActionFailure) || err.code === 'INTERNAL'
        if (retryable) {
          const prev = failed.current
          const before = new Map(prev?.before ?? [])
          for (const [k, s] of b.before) if (!before.has(k)) before.set(k, s)
          failed.current = newBatch(coalesce(prev?.writes ?? [], b.writes), before, b.onDayWeekConflict)
          failed.current.resolve(null)
          toast.error(th.grid.toast.saveFailed, {
            action: { label: th.grid.toast.retry, onClick: () => retryRef.current() },
          })
        } else toast.error(err.message)
      }
      b.resolve(null)
      sync()
    },
  })
  const mutateAsync = mutation.mutateAsync

  const send = useCallback(
    (b: Batch) => {
      outstanding.current.set(b.id, b)
      sync()
      mutateAsync(b).catch(() => {}) // settled in onSuccess / onError
      return b.promise
    },
    [mutateAsync, sync],
  )

  const flushPending = useCallback(() => {
    if (timer.current !== null) {
      clearTimeout(timer.current)
      timer.current = null
    }
    const b = pending.current
    pending.current = null
    if (b && b.writes.length > 0) void send(b)
    else if (b) b.resolve(null)
    sync()
  }, [send, sync])

  const flush = useCallback(async () => {
    flushPending()
    await Promise.all([...outstanding.current.values()].map((b) => b.promise))
  }, [flushPending])

  const schedule = useCallback(() => {
    if (timer.current !== null) clearTimeout(timer.current)
    timer.current = setTimeout(flushPending, SAVE_DEBOUNCE_MS)
  }, [flushPending])

  const addPending = useCallback(
    (writes: readonly CellWrite[], before?: Map<string, WeekSnapshot>) => {
      const b = pending.current ?? (pending.current = newBatch([], new Map()))
      if (before) for (const [k, s] of before) if (!b.before.has(k)) b.before.set(k, s)
      captureBefore(writes, b.before)
      pending.current = { ...b, writes: coalesce(b.writes, writes) }
      schedule()
      sync()
      return b.promise
    },
    [captureBefore, schedule, sync],
  )

  useEffect(() => {
    requeue.current = (writes, before) => void addPending(writes, before)
  }, [addPending])

  const enqueue = useCallback<SaveApi['enqueue']>(
    (writes, opts) => {
      if (writes.length === 0) return Promise.resolve(null)
      if (opts?.immediate) {
        flushPending()
        const before = new Map<string, WeekSnapshot>()
        captureBefore(writes, before)
        applyOptimistic(writes)
        return send(newBatch([...writes], before, opts.onDayWeekConflict))
      }
      const p = addPending(writes)
      applyOptimistic(writes)
      return p
    },
    [addPending, applyOptimistic, captureBefore, flushPending, send],
  )

  const retry = useCallback(() => {
    const b = failed.current
    if (!b) return
    failed.current = null
    applyOptimistic(b.writes)
    void send(newBatch(b.writes, b.before, b.onDayWeekConflict))
  }, [applyOptimistic, send])
  const retryRef = useRef(retry)
  useEffect(() => {
    retryRef.current = retry
  }, [retry])

  // flush when the tab hides or the page goes away, and on unmount (route change)
  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState === 'hidden') flushPending()
    }
    window.addEventListener('pagehide', flushPending)
    document.addEventListener('visibilitychange', onHide)
    return () => {
      window.removeEventListener('pagehide', flushPending)
      document.removeEventListener('visibilitychange', onHide)
      flushPending()
    }
  }, [flushPending])

  return useMemo(() => ({ enqueue, flush, retry, state }), [enqueue, flush, retry, state])
}
