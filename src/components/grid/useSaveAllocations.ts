'use client'
// src/components/grid/useSaveAllocations.ts — grid saves (SPEC §7.4, PLAN §3.10, X65, M6-D3/D13/D14, M7-D4/D6/D26;
// based on plan/research/snippets/r4/client/components/grid/useSaveAllocations.ts).
// - enqueue applies the writes to every cached chunk at once (< 50 ms, the domain's planWeek incl. BR-22/23/24),
//   coalesces them and (re)starts a 400 ms debounce; `immediate` (undo / redo) flushes first and sends its own batch.
// - A batch carries one onDayWeekConflict ('SCALE' | 'COLLAPSE' | none): the queue flushes before it takes writes with
//   another choice, and before a change of the other granularity for a week it already holds (M7-D6).
// - One scoped mutation queue per context; baseVersion is read from the version registry at send time.
// - Success: versions remembered, server weeks patched into every chunk (no refetch), warnings toasted, other views
//   invalidated (invalidateAfterGridSave). Failure: rollback when alone (else resync), retry toast; VERSION_CONFLICT:
//   server state + conflict epoch bump + toast; NEEDS_CHOICE (stale cache): the BR-24 dialog (onNeedsChoice) decides
//   and the batch is re-sent; VALIDATION with issues: those weeks revert + toast, the rest is re-sent.
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import type { ISODate } from '@/domain/types'
import { weekStart } from '@/domain/dates'
import { th } from '@/i18n/th'
import { ActionFailure, unwrap } from '@/lib/action-result'
import type {
  GridResponse,
  NeedsChoicePayload,
  OnDayWeekConflict,
  SaveAllocationsInput,
  SaveAllocationsItem,
  SaveAllocationsOk,
  SaveItemResult,
  SaveValidationIssue,
  SaveWarningCode,
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
  onDayWeekConflict?: OnDayWeekConflict
  sent?: SaveAllocationsItem[]
  resolve: (v: SaveAllocationsOk | null) => void
  promise: Promise<SaveAllocationsOk | null>
}

export interface EnqueueOptions {
  onDayWeekConflict?: OnDayWeekConflict
  immediate?: boolean
}

export interface SaveApi {
  enqueue(writes: readonly CellWrite[], o?: EnqueueOptions): Promise<SaveAllocationsOk | null>
  flush(): Promise<void>
  retry(): void
  state: SaveState
}

export interface SaveOptions {
  /** VERSION_CONFLICT hit these assignments (M7-D26: an open BR-24 dialog drops their pairs). */
  onConflict?: (ids: string[]) => void
  /** NEEDS_CHOICE (server fallback, M7-D4): the BR-24 choice for these pairs, or null (Cancel). */
  onNeedsChoice?: (payload: NeedsChoicePayload, writes: readonly CellWrite[]) => Promise<OnDayWeekConflict | null>
}

let opSeq = 0
const nextOpId = () => `op-${++opSeq}`
let batchSeq = 0

const weekOf = (w: CellWrite): ISODate => (w.granularity === 'WEEK' ? w.period : weekStart(w.period))
const snapKey = (taId: string, week: ISODate) => `${taId}|${week}`

function newBatch(
  writes: CellWrite[],
  before: Map<string, WeekSnapshot>,
  onDayWeekConflict?: OnDayWeekConflict,
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

/** M7-D6: does `writes` touch a week the batch already holds with the other granularity? */
function mixesGranularity(batch: readonly CellWrite[], writes: readonly CellWrite[]): boolean {
  const held = new Map<string, CellWrite['granularity']>()
  for (const w of batch) held.set(snapKey(w.taskAssignmentId, weekOf(w)), w.granularity)
  return writes.some((w) => {
    const g = held.get(snapKey(w.taskAssignmentId, weekOf(w)))
    return g !== undefined && g !== w.granularity
  })
}

const WARNING_TEXT: Readonly<Record<Exclude<SaveWarningCode, 'SPILLED_OVER_DAY_LIMIT'>, string>> = {
  WORK_ON_NON_WORKING_DAY: th.grid.warn.nonWorkingDay,
  WEEK_NO_CAPACITY: th.grid.warn.weekNoCapacity,
  ALLOCATED_ON_TIME_OFF: th.grid.toast.warning.ALLOCATED_ON_TIME_OFF,
}

/** Save warnings → toasts: SPILLED_OVER_DAY_LIMIT its own (M7-D8); the rest one deduplicated toast. */
export function toastWarnings(codes: Iterable<SaveWarningCode>): void {
  const set = new Set(codes)
  if (set.delete('SPILLED_OVER_DAY_LIMIT')) toast.warning(th.grid.day.splitClampedToast)
  const texts = [...new Set([...set].map((c) => WARNING_TEXT[c as keyof typeof WARNING_TEXT]))]
  if (texts.length > 0) toast.warning(texts.join(' · '))
}

function validationText(issues: readonly SaveValidationIssue[], fallback: string): string {
  const reasons = new Set(issues.map((i) => i.reason))
  if (reasons.has('UNREPRESENTABLE')) return th.grid.day.unrepresentable
  if (reasons.has('MIXED_WEEK_AND_DAY')) return th.grid.errors.mixedWeekAndDay
  if (reasons.has('MAX')) return issues.some((i) => i.reason === 'MAX' && weekStart(i.period) !== i.period)
    ? th.grid.errors.maxDay
    : th.grid.toast.maxWeek
  return fallback
}

export function useSaveAllocations(ctx: GridCtx, o: SaveOptions = {}): SaveApi {
  const qc = useQueryClient()
  const prefix = useMemo(() => qk.gridAll(ctx), [ctx])
  const mutationKey = useMemo(() => ['saveAllocations', ctx.id], [ctx.id])
  const pending = useRef<Batch | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const outstanding = useRef(new Map<number, Batch>())
  const failed = useRef<Batch | null>(null)
  const opts = useRef(o)
  useEffect(() => {
    opts.current = o
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
    (writes: readonly CellWrite[], choice?: OnDayWeekConflict) => {
      if (writes.length === 0) return
      const deltas = rowTotalDeltas(chunks(), writes, choice)
      qc.setQueriesData<GridResponse>({ queryKey: prefix }, (old) =>
        old ? applyWritesOptimistically(old, writes, deltas, choice) : old,
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

  /** Batches the server has not confirmed yet (sent or pending), in send order. */
  const unconfirmed = useCallback((after?: number): Batch[] => {
    const out = [...outstanding.current.values()]
      .sort((a, b2) => a.id - b2.id)
      .filter((b) => after === undefined || b.id > after)
    if (pending.current) out.push(pending.current)
    return out
  }, [])

  const reapply = useCallback(
    (after?: number) => {
      for (const b of unconfirmed(after)) applyOptimistic(b.writes, b.onDayWeekConflict)
    },
    [applyOptimistic, unconfirmed],
  )

  const rollback = useCallback(
    (snaps: Iterable<WeekSnapshot>) => {
      // complete snapshots replay exactly with COLLAPSE (never a BR-24 choice, §7.5)
      applyOptimistic([...snaps].flatMap(snapshotWrites), 'COLLAPSE')
      reapply() // keep later edits on top
    },
    [applyOptimistic, reapply],
  )

  // a refetch that lands while edits are unconfirmed must not wipe them: re-apply them on fresh data
  useEffect(
    () =>
      qc.getQueryCache().subscribe((ev) => {
        if (ev.type !== 'updated' || ev.action.type !== 'success' || ev.action.manual) return
        const key = ev.query.queryKey as readonly unknown[]
        if (!startsWith(key, prefix)) return
        const batches = unconfirmed()
        if (batches.length === 0) return
        qc.setQueryData<GridResponse>(key, (old) =>
          old
            ? batches.reduce((r, b) => applyWritesOptimistically(r, b.writes, undefined, b.onDayWeekConflict), old)
            : old,
        )
      }),
    [qc, prefix, unconfirmed],
  )

  const requeue = useRef<(writes: CellWrite[], before: Map<string, WeekSnapshot>, choice?: OnDayWeekConflict) => void>(
    () => {},
  )
  const resend = useRef<(b: Batch) => void>(() => {})

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
      reapply(b.id)
      toastWarnings(ok.warnings.map((w) => w.code))
      invalidateAfterGridSave(qc, ctx)
      b.resolve(ok)
      sync()
    },
    onError: (err, b) => {
      outstanding.current.delete(b.id)
      // NEEDS_CHOICE is M7's code (S0.4); compared as a string until the ErrorCode union lists it
      const code: string = err instanceof ActionFailure ? err.code : ''
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
        if (rest.length > 0) requeue.current(rest, b.before, b.onDayWeekConflict)
        toast.warning(th.grid.toast.conflict)
        opts.current.onConflict?.([...ids])
      } else if (err instanceof ActionFailure && code === 'NEEDS_CHOICE') {
        const payload = err.extra as unknown as NeedsChoicePayload
        const pairs = Array.isArray(payload.pairs) ? payload.pairs : []
        const ask = opts.current.onNeedsChoice
        const decide = ask
          ? ask({ week: payload.week, weeks: Array.isArray(payload.weeks) ? payload.weeks : [], pairs }, b.writes)
          : Promise.resolve(null)
        void decide.then((choice) => {
          if (choice) {
            resend.current(newBatch(b.writes, b.before, choice))
            return
          }
          const bad = new Set(pairs.map((p) => snapKey(p.taskAssignmentId, p.week)))
          rollback([...b.before].filter(([k]) => bad.has(k)).map(([, s]) => s))
          const rest = b.writes.filter((w) => !bad.has(snapKey(w.taskAssignmentId, weekOf(w))))
          if (rest.length > 0) resend.current(newBatch(rest, b.before, b.onDayWeekConflict))
        })
      } else if (
        err instanceof ActionFailure &&
        err.code === 'VALIDATION' &&
        Array.isArray(err.extra.issues) &&
        err.extra.issues.length > 0
      ) {
        const issues = err.extra.issues as SaveValidationIssue[]
        const bad = new Set(issues.map((i) => snapKey(i.taskAssignmentId, weekStart(i.period))))
        rollback([...b.before].filter(([k]) => bad.has(k)).map(([, s]) => s))
        const rest = b.writes.filter((w) => !bad.has(snapKey(w.taskAssignmentId, weekOf(w))))
        if (rest.length > 0) requeue.current(rest, b.before, b.onDayWeekConflict)
        toast.error(validationText(issues, err.message))
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
  useEffect(() => {
    resend.current = (b) => {
      applyOptimistic(b.writes, b.onDayWeekConflict)
      void send(b)
    }
  }, [applyOptimistic, send])

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
    (writes: readonly CellWrite[], before?: Map<string, WeekSnapshot>, choice?: OnDayWeekConflict) => {
      const cur = pending.current
      // M7-D4 / M7-D6: never merge different choices or both granularities of one week into one batch
      if (cur && (cur.onDayWeekConflict !== choice || mixesGranularity(cur.writes, writes))) flushPending()
      const b = pending.current ?? (pending.current = newBatch([], new Map(), choice))
      if (before) for (const [k, s] of before) if (!b.before.has(k)) b.before.set(k, s)
      captureBefore(writes, b.before)
      pending.current = { ...b, writes: coalesce(b.writes, writes) }
      schedule()
      sync()
      return b.promise
    },
    [captureBefore, flushPending, schedule, sync],
  )

  useEffect(() => {
    requeue.current = (writes, before, choice) => void addPending(writes, before, choice)
  }, [addPending])

  const enqueue = useCallback<SaveApi['enqueue']>(
    (writes, eo) => {
      if (writes.length === 0) return Promise.resolve(null)
      if (eo?.immediate) {
        flushPending()
        const before = new Map<string, WeekSnapshot>()
        captureBefore(writes, before)
        applyOptimistic(writes, eo.onDayWeekConflict)
        return send(newBatch([...writes], before, eo.onDayWeekConflict))
      }
      const p = addPending(writes, undefined, eo?.onDayWeekConflict)
      applyOptimistic(writes, eo?.onDayWeekConflict)
      return p
    },
    [addPending, applyOptimistic, captureBefore, flushPending, send],
  )

  const retry = useCallback(() => {
    const b = failed.current
    if (!b) return
    failed.current = null
    applyOptimistic(b.writes, b.onDayWeekConflict)
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
