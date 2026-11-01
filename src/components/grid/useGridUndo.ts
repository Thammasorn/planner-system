'use client'
// src/components/grid/useGridUndo.ts — one undo entry per grid gesture (SPEC §7.5, AC-805, M6-D13). Each entry holds
// week snapshots before/after; undo/redo flush the queue, then (unless a VERSION_CONFLICT made the entry stale) send
// the snapshot as its own batch with onDayWeekConflict 'COLLAPSE' using the latest known versions. Grid value edits
// push no toast (Cmd+Z only). Uses M1's shared per-tab stack (50 steps).
import { useQueryClient } from '@tanstack/react-query'
import { useCallback, useMemo } from 'react'
import { toast } from 'sonner'
import { useUndo } from '@/components/undo/useUndo'
import type { ISODate } from '@/domain/types'
import { th } from '@/i18n/th'
import type { GridResponse, SaveAllocationsOk } from '@/lib/contracts/grid'
import { cachedCell } from '@/lib/grid/cache-ops'
import type { CellWrite } from '@/lib/grid/queue'
import {
  gestureSnapshots,
  isStale,
  snapshotFromState,
  snapshotWrites,
  type GridUndoEntry,
  type WeekSnapshot,
} from '@/lib/grid/undo'
import { conflictEpoch } from '@/lib/grid/versions'
import { qk, type GridCtx } from '@/lib/query-keys'
import type { SaveApi } from './useSaveAllocations'

function refreshed(snaps: WeekSnapshot[], ok: SaveAllocationsOk | null): WeekSnapshot[] {
  if (!ok) return snaps
  return snaps.map((s) => {
    const state = ok.results.find((r) => r.taskAssignmentId === s.taskAssignmentId)?.weeks[s.week]
    return state ? snapshotFromState(state, s.taskAssignmentId, s.week) : s
  })
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

  /** Snapshots (before the optimistic write), enqueue, one undo entry. Returns the save promise. */
  const gesture = useCallback(
    (label: string, writes: readonly CellWrite[]) => {
      if (writes.length === 0) return Promise.resolve(null)
      const { before, after } = gestureSnapshots(writes, cellAt)
      const entry: GridUndoEntry = {
        label,
        before,
        after,
        epochs: new Map(before.map((s) => [s.taskAssignmentId, conflictEpoch(s.taskAssignmentId)])),
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
        entry[which] = refreshed(entry[which], ok)
      }
      const p = save.enqueue(writes)
      undoApi.push({ label, undo: () => run('before'), redo: () => run('after') })
      return p
    },
    [cellAt, save, undoApi],
  )

  return { gesture, undo: undoApi.undo, redo: undoApi.redo }
}
