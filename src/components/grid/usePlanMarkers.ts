'use client'
// src/components/grid/usePlanMarkers.ts — the project's plan markers (SPEC FR-819/820, §7.10, M7.1-D11/D13/D15, X04,
// X82, X83). One query qk.planMarkers(projectId) (getJson, staleTime 30 s) shared by grid, calendar and chart; mutations
// patch it optimistically, roll back + toast on failure and invalidate it on settle. Undo (M1 useUndo):
// create → undo = delete (redo = restore that batch); update → undo = update(previous) (last write wins, M7.1-D13);
// delete → undo = restore(batch) with the 8 s "เลิกทำ" toast th.planMarkers.deleted (X04). Edits push entries
// without a toast.
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback, useMemo, useRef } from 'react'
import { toast } from 'sonner'
import { useUndo } from '@/components/undo/useUndo'
import type { ISODate } from '@/domain/types'
import { th } from '@/i18n/th'
import { unwrap } from '@/lib/action-result'
import { getJson } from '@/lib/api'
import type { PlanMarkerColor, PlanMarkerDTO, PlanMarkersResponse } from '@/lib/contracts/plan-markers'
import { invalidatePlanMarkers } from '@/lib/invalidate'
import { qk } from '@/lib/query-keys'
import { tempId } from '@/lib/temp-id'
import {
  createPlanMarker,
  deletePlanMarker,
  restorePlanMarkerBatch,
  updatePlanMarker,
} from '@/server/actions/plan-markers'

export const PLAN_MARKERS_STALE_MS = 30_000

export type MarkerPatch = Partial<Pick<PlanMarkerDTO, 'date' | 'color' | 'label'>>

export interface PlanMarkersApi {
  markers: PlanMarkerDTO[]
  isLoading: boolean
  /** creates at once (optimistic) and returns the temp id; `resolve` maps it to the server id once saved */
  create: (v: { date: ISODate; color?: PlanMarkerColor; label?: string | null }) => string
  update: (markerId: string, patch: MarkerPatch) => void
  remove: (markerId: string) => void
  /** the server id of a marker created here (temp ids resolve once the create landed) */
  resolve: (markerId: string) => string
  /** the marker with this id (temp or server), if live */
  find: (markerId: string) => PlanMarkerDTO | undefined
}

function errorText(err: unknown): string {
  return err instanceof Error && err.message !== '' ? err.message : th.grid.toast.saveFailed
}

/** Empty label → null (M7.1-D14: the server trims and maps '' to null too). */
export function normalizeLabel(label: string | null | undefined): string | null {
  const t = (label ?? '').trim()
  return t === '' ? null : t
}

function byDate(a: PlanMarkerDTO, b: PlanMarkerDTO): number {
  return a.date < b.date ? -1 : a.date > b.date ? 1 : 0
}

export function usePlanMarkers(projectId: string, o: { enabled?: boolean } = {}): PlanMarkersApi {
  const qc = useQueryClient()
  const undo = useUndo()
  const key = useMemo(() => qk.planMarkers(projectId), [projectId])
  const q = useQuery({
    queryKey: key,
    queryFn: ({ signal }) => getJson<PlanMarkersResponse>(`/api/projects/${projectId}/plan-markers`, { signal }),
    staleTime: PLAN_MARKERS_STALE_MS,
    enabled: o.enabled ?? true,
  })
  // a defensive read: any other payload (tests, an old cache entry) is "no markers"
  const data = q.data
  const markers = useMemo(() => (Array.isArray(data?.markers) ? [...data.markers].sort(byDate) : []), [data])

  const ids = useRef(new Map<string, string>())
  const pending = useRef(new Map<string, Promise<string | null>>())
  const resolve = useCallback((id: string) => ids.current.get(id) ?? id, [])

  const patch = useCallback(
    (fn: (list: PlanMarkerDTO[]) => PlanMarkerDTO[]) =>
      qc.setQueryData<PlanMarkersResponse>(key, (d) => ({ markers: fn(Array.isArray(d?.markers) ? d.markers : []) })),
    [qc, key],
  )
  const settle = useCallback(() => invalidatePlanMarkers(qc, projectId), [qc, projectId])
  const fail = useCallback(
    (err: unknown, snapshot: PlanMarkersResponse | undefined) => {
      qc.setQueryData(key, snapshot)
      toast.error(errorText(err))
      void settle()
    },
    [qc, key, settle],
  )

  /** Restore a deleted batch (undo of delete / redo of create); the restored rows come back with their old ids. */
  const restore = useCallback(
    async (batch: string) => {
      const r = await unwrap(restorePlanMarkerBatch({ batch }))
      patch((list) => [...list.filter((m) => !r.markers.some((x) => x.id === m.id)), ...r.markers])
      await settle()
    },
    [patch, settle],
  )
  const deleteNow = useCallback(
    async (id: string): Promise<string> => {
      patch((list) => list.filter((m) => m.id !== id))
      const r = await unwrap(deletePlanMarker({ markerId: id }))
      await settle()
      return r.batch
    },
    [patch, settle],
  )

  const create = useCallback<PlanMarkersApi['create']>(
    (v) => {
      const tmp = tempId()
      const label = normalizeLabel(v.label)
      const color = v.color ?? 'RED'
      const snapshot = qc.getQueryData<PlanMarkersResponse>(key)
      patch((list) => [
        ...list,
        { id: tmp, projectId, date: v.date, color, label, createdBy: '', updatedAt: '' },
      ])
      const p = unwrap(createPlanMarker({ projectId, date: v.date, color, label }))
        .then((r) => {
          ids.current.set(tmp, r.marker.id)
          patch((list) => list.map((m) => (m.id === tmp ? r.marker : m)))
          const id = r.marker.id
          let batch: string | null = null
          undo.push({
            label: th.planMarkers.add,
            undo: async () => {
              batch = await deleteNow(id)
            },
            redo: async () => {
              if (batch) await restore(batch)
            },
          })
          void settle()
          return id
        })
        .catch((err: unknown) => {
          fail(err, snapshot)
          return null
        })
        .finally(() => pending.current.delete(tmp))
      pending.current.set(tmp, p)
      return tmp
    },
    [qc, key, projectId, patch, undo, deleteNow, restore, settle, fail],
  )

  /** Waits for a pending create of `id` (edits right after "+ เพิ่มเส้นกำกับ…"). */
  const serverId = useCallback(async (id: string): Promise<string | null> => {
    const p = pending.current.get(id)
    if (p) return p
    return ids.current.get(id) ?? id
  }, [])

  const update = useCallback<PlanMarkersApi['update']>(
    (markerId, change) => {
      const next: MarkerPatch = { ...change }
      if ('label' in next) next.label = normalizeLabel(next.label)
      const snapshot = qc.getQueryData<PlanMarkersResponse>(key)
      patch((list) => list.map((m) => (m.id === markerId || m.id === resolve(markerId) ? { ...m, ...next } : m)))
      void serverId(markerId).then(async (id) => {
        if (id === null) return
        try {
          const r = await unwrap(updatePlanMarker({ markerId: id, ...next }))
          patch((list) => list.map((m) => (m.id === id ? r.marker : m)))
          const previous = r.previous
          undo.push({
            label: th.planMarkers.edit,
            undo: async () => {
              const u = await unwrap(updatePlanMarker({ markerId: id, ...previous }))
              patch((list) => list.map((m) => (m.id === id ? u.marker : m)))
              await settle()
            },
            redo: async () => {
              const u = await unwrap(updatePlanMarker({ markerId: id, ...next }))
              patch((list) => list.map((m) => (m.id === id ? u.marker : m)))
              await settle()
            },
          })
          void settle()
        } catch (err) {
          fail(err, snapshot)
        }
      })
    },
    [qc, key, patch, resolve, serverId, undo, settle, fail],
  )

  const remove = useCallback<PlanMarkersApi['remove']>(
    (markerId) => {
      const snapshot = qc.getQueryData<PlanMarkersResponse>(key)
      patch((list) => list.filter((m) => m.id !== markerId && m.id !== resolve(markerId)))
      void serverId(markerId).then(async (id) => {
        if (id === null) return
        try {
          let batch = await deleteNow(id)
          undo.push(
            {
              label: th.planMarkers.delete,
              undo: async () => restore(batch),
              redo: async () => {
                batch = await deleteNow(id)
              },
            },
            { toast: th.planMarkers.deleted },
          )
        } catch (err) {
          fail(err, snapshot)
        }
      })
    },
    [qc, key, patch, resolve, serverId, deleteNow, undo, restore, fail],
  )

  const find = useCallback(
    (id: string) => markers.find((m) => m.id === id || m.id === resolve(id)),
    [markers, resolve],
  )

  return { markers, isLoading: q.isLoading, create, update, remove, resolve, find }
}
