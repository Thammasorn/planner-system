'use client'
// src/hooks/useWorkload.ts — TanStack queries of the M9 workload / people / load views (plan/m09 S4.1, M9-D2/D4/D5/
// D9/D11/D16/D19/D20/D22). Every key lives under ['workload'] (or ['calendar'] for a person's leave), so
// invalidateLoad / invalidateCalendar refresh them (X18). Window maths uses ISO strings only (no Date).
import { useCallback, useMemo, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { addWeeks, weekStart } from '@/domain/dates'
import type { ISODate } from '@/domain/types'
import { getJson } from '@/lib/api'
import type {
  ClientLoadResponse,
  PeopleDirectoryResponse,
  PersonTimeOffResponse,
  ProjectLoadResponse,
  WorkloadBadgeResponse,
  WorkloadCellDetail,
  WorkloadParams,
  WorkloadResponse,
} from '@/lib/contracts/workload'
import { qk } from '@/lib/query-keys'
import { workloadQuerySchema } from '@/lib/schemas/workload'
import { useToday } from './useToday'

/** Weeks in the default window and the ◀/▶ step (M9-D4). */
export const WORKLOAD_WEEKS = 12
export const WORKLOAD_STEP = 4

const LIVE = { staleTime: 60_000, refetchOnWindowFocus: true } as const

/** The request / URL form of the params; the default window is omitted from the URL (`defaults`). */
export function workloadSearchParams(
  p: WorkloadParams,
  defaults?: { from: ISODate; to: ISODate },
): URLSearchParams {
  const sp = new URLSearchParams()
  if (!defaults || p.from !== defaults.from || p.to !== defaults.to) {
    sp.set('from', p.from)
    sp.set('to', p.to)
  }
  if (p.positionId) sp.set('positionId', p.positionId)
  if (p.projectId) sp.set('projectId', p.projectId)
  if (p.onlyOver) sp.set('onlyOver', '1')
  return sp
}

export function defaultWorkloadWindow(today: ISODate): { from: ISODate; to: ISODate } {
  const from = weekStart(today)
  return { from, to: addWeeks(from, WORKLOAD_WEEKS) }
}

/** URL → params (invalid values fall back to the defaults, like the route's 400 never reaching the UI). */
export function parseWorkloadParams(sp: URLSearchParams, today: ISODate): WorkloadParams {
  const def = defaultWorkloadWindow(today)
  const raw: Record<string, string> = {}
  for (const k of ['from', 'to', 'positionId', 'projectId', 'onlyOver']) {
    const v = sp.get(k)
    if (v !== null && v !== '') raw[k] = v
  }
  const r = workloadQuerySchema.safeParse(raw)
  if (!r.success) return { ...def, positionId: null, projectId: null, onlyOver: false }
  return {
    from: r.data.from ?? def.from,
    to: r.data.to ?? def.to,
    positionId: r.data.positionId ?? null,
    projectId: r.data.projectId ?? null,
    onlyOver: r.data.onlyOver,
  }
}

/** GET /api/workload (M9-D2): previous data stays while the window moves (no flash, M9-D4). */
export function useWorkloadTable(p: WorkloadParams) {
  return useQuery({
    queryKey: qk.workload(p),
    queryFn: ({ signal }) =>
      getJson<WorkloadResponse>(`/api/workload?${workloadSearchParams(p).toString()}`, { signal }),
    placeholderData: keepPreviousData,
    ...LIVE,
  })
}

/** GET /api/workload/cell (M9-D9); enabled once a cell is chosen. */
export function useWorkloadCell(userId: string | null, week: ISODate | null) {
  return useQuery({
    queryKey: qk.workloadCell(userId ?? '', week ?? ''),
    queryFn: ({ signal }) =>
      getJson<WorkloadCellDetail>(
        `/api/workload/cell?${new URLSearchParams({ userId: userId ?? '', week: week ?? '' }).toString()}`,
        { signal },
      ),
    enabled: userId !== null && week !== null,
    ...LIVE,
  })
}

/** The sidebar ●N (M9-D11, X31): the server-rendered value first, then one refetch on mount (initialDataUpdatedAt 0). */
export function useWorkloadBadge(initial: number) {
  return useQuery({
    queryKey: qk.workloadBadge(),
    queryFn: ({ signal }) => getJson<WorkloadBadgeResponse>('/api/workload/badge', { signal }),
    initialData: { overCount: initial, from: '', to: '' } satisfies WorkloadBadgeResponse,
    initialDataUpdatedAt: 0,
    ...LIVE,
  })
}

/** GET /api/people (M9-D14). */
export function usePeopleDirectory() {
  return useQuery({
    queryKey: qk.peopleDirectory(),
    queryFn: ({ signal }) => getJson<PeopleDirectoryResponse>('/api/people', { signal }),
    ...LIVE,
  })
}

/** GET /api/people/[userId]/time-off (M9-D16). */
export function usePersonTimeOff(userId: string) {
  return useQuery({
    queryKey: qk.personTimeOff(userId),
    queryFn: ({ signal }) =>
      getJson<PersonTimeOffResponse>(`/api/people/${encodeURIComponent(userId)}/time-off`, { signal }),
    ...LIVE,
  })
}

/** GET /api/projects/[id]/load (M9-D19). */
export function useProjectLoad(projectId: string) {
  return useQuery({
    queryKey: qk.projectLoad(projectId),
    queryFn: ({ signal }) =>
      getJson<ProjectLoadResponse>(`/api/projects/${encodeURIComponent(projectId)}/load`, { signal }),
    ...LIVE,
  })
}

/** GET /api/clients/[id]/load (M9-D20). */
export function useClientLoad(clientId: string) {
  return useQuery({
    queryKey: qk.clientLoad(clientId),
    queryFn: ({ signal }) =>
      getJson<ClientLoadResponse>(`/api/clients/${encodeURIComponent(clientId)}/load`, { signal }),
    ...LIVE,
  })
}

/** /workload filters + window in the URL (M9-D5, as M3-D33): read once on mount, mirrored with history.replaceState
 *  (no navigation, no server render). Default values are omitted from the URL. */
export function useWorkloadUrlState(): [WorkloadParams, (patch: Partial<WorkloadParams>) => void] {
  const today = useToday()
  const sp = useSearchParams()
  const [params, setParams] = useState<WorkloadParams>(() =>
    parseWorkloadParams(new URLSearchParams(sp.toString()), today),
  )
  const defaults = useMemo(() => defaultWorkloadWindow(today), [today])
  const patch = useCallback(
    (p: Partial<WorkloadParams>) => {
      const next = { ...params, ...p }
      setParams(next)
      const qs = workloadSearchParams(next, defaults).toString()
      window.history.replaceState(
        null,
        '',
        `${window.location.pathname}${qs ? `?${qs}` : ''}${window.location.hash}`,
      )
    },
    [params, defaults],
  )
  return [params, patch]
}
