'use client'
// src/components/grid/useGridUndo.ts — one undo entry per grid gesture (SPEC §7.5, AC-805, M6-D13, M7-D18, X65). Each
// entry holds complete week snapshots before/after; undo/redo flush the queue, then (unless a VERSION_CONFLICT made the
// entry stale) send the snapshot as its own batch with onDayWeekConflict 'COLLAPSE' using the latest known versions —
// so undo never opens the BR-24 dialog. Grid value edits push no toast (Cmd+Z only); BR-23 collapse pushes the 8 s
// "เลิกทำ" toast. Uses M1's shared per-tab stack (50 steps).
// M7: a gesture may send several batches (plain writes at once, the BR-24 pairs after the dialog with the chosen
// onDayWeekConflict) and still records ONE entry; `after` is read from the optimistic cache (the domain's planWeek) and
// replaced by the server's weeks when the saves succeed (M7-D18).
import { useQueryClient } from '@tanstack/react-query'
import { useCallback, useMemo } from 'react'
import { toast } from 'sonner'
import { useUndo } from '@/components/undo/useUndo'
import { weekStart } from '@/domain/dates'
import type { ISODate } from '@/domain/types'
import { th } from '@/i18n/th'
import type { GridResponse, OnDayWeekConflict, SaveAllocationsOk } from '@/lib/contracts/grid'
import { cachedCell } from '@/lib/grid/cache-ops'
import type { CellWrite } from '@/lib/grid/queue'
import {
  isStale,
  snapshotFromState,
  snapshotOf,
  snapshotWrites,
  type GridUndoEntry,
  type WeekSnapshot,
} from '@/lib/grid/undo'
import { conflictEpoch } from '@/lib/grid/versions'
import { qk, type GridCtx } from '@/lib/query-keys'
import type { SaveApi } from './useSaveAllocations'

function refreshed(snaps: WeekSnapshot[], oks: readonly (SaveAllocationsOk | null)[]): WeekSnapshot[] {
  return snaps.map((s) => {
    for (const ok of oks) {
      const state = ok?.results.find((r) => r.taskAssignmentId === s.taskAssignmentId)?.weeks[s.week]
      if (state) return snapshotFromState(state, s.taskAssignmentId, s.week)
    }
    return s
  })
}

const weekOf = (w: CellWrite): ISODate => (w.granularity === 'WEEK' ? w.period : weekStart(w.period))
const keyOf = (taId: string, week: ISODate) => `${taId}|${week}`

/** A gesture in progress: snapshots taken before its first write, batches sent, one entry on finish. */
export interface GestureHandle {
  send(writes: readonly CellWrite[], onDayWeekConflict?: OnDayWeekConflict): void
  /** Pushes the undo entry (none when nothing was sent); resolves when every batch settled. */
  finish(label: string, o?: { toast?: string }): Promise<SaveAllocationsOk | null>
}

export function useGridUndo(ctx: GridCtx, save: SaveApi) {
  const qc = useQueryClient()
  const undoApi = useUndo()
  const prefix = useMemo(() => qk.gridAll(ctx), [ctx])

  const cellAt = useCallback(
    (taskAssignmentId: string, week: ISODate) =>
      cachedCell(
        qc.getQueriesData<GridResponse>({ queryKey: prefix }).map(([, d]) => d),
        taskAssignmentId,
        week,
      ),
    [qc, prefix],
  )

  /** Starts a gesture over `touched` (every write it may send); snapshots come from the cache before any write. */
  const start = useCallback(
    (touched: readonly CellWrite[]): GestureHandle => {
      const before = new Map<string, WeekSnapshot>()
      for (const w of touched) {
        const week = weekOf(w)
        const k = keyOf(w.taskAssignmentId, week)
        if (!before.has(k)) before.set(k, snapshotOf(cellAt(w.taskAssignmentId, week), w.taskAssignmentId, week))
      }
      const sentKeys = new Set<string>()
      const sends: Promise<SaveAllocationsOk | null>[] = []
      return {
        send(writes, choice) {
          if (writes.length === 0) return
          for (const w of writes) sentKeys.add(keyOf(w.taskAssignmentId, weekOf(w)))
          sends.push(save.enqueue(writes, choice ? { onDayWeekConflict: choice } : undefined))
        },
        finish(label, o) {
          if (sends.length === 0) return Promise.resolve(null)
          const beforeSnaps = [...before].filter(([k]) => sentKeys.has(k)).map(([, s]) => s)
          const entry: GridUndoEntry = {
            label,
            before: beforeSnaps,
            // the optimistic overlay already applied the domain's result (BR-22 split, BR-24 choice)
            after: beforeSnaps.map((s) => snapshotOf(cellAt(s.taskAssignmentId, s.week), s.taskAssignmentId, s.week)),
            epochs: new Map(beforeSnaps.map((s) => [s.taskAssignmentId, conflictEpoch(s.taskAssignmentId)])),
          }
          const run = async (which: 'before' | 'after') => {
            await save.flush()
            if (isStale(entry, conflictEpoch)) {
              toast(th.grid.toast.undoStale)
              return
            }
            const ok = await save.enqueue(entry[which].flatMap(snapshotWrites), {
              immediate: true,
              onDayWeekConflict: 'COLLAPSE',
            })
            entry[which] = refreshed(entry[which], [ok])
          }
          undoApi.push(
            { label, undo: () => run('before'), redo: () => run('after') },
            o?.toast ? { toast: o.toast } : undefined,
          )
          const all = Promise.all(sends)
          void all.then((oks) => {
            entry.after = refreshed(entry.after, oks) // M7-D18: exact redo after spill
          })
          return all.then((oks) => oks.find((x) => x !== null) ?? null)
        },
      }
    },
    [cellAt, save, undoApi],
  )

  /** One gesture with one batch (M6 shape). Returns the save promise. */
  const gesture = useCallback(
    (label: string, writes: readonly CellWrite[], o?: { onDayWeekConflict?: OnDayWeekConflict; toast?: string }) => {
      if (writes.length === 0) return Promise.resolve(null)
      const g = start(writes)
      g.send(writes, o?.onDayWeekConflict)
      return g.finish(label, o?.toast ? { toast: o.toast } : undefined)
    },
    [start],
  )

  return { gesture, start, undo: undoApi.undo, redo: undoApi.redo }
}
