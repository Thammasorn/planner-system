'use client'
// GET /api/projects/[id]/plan-markers — the project's live markers, one query shared by grid, calendar and chart
// (SPEC §7.10, M7.1-D15: staleTime 30 s, no chunking). Marker mutations invalidate qk.planMarkers only (X82).
import { useQuery } from '@tanstack/react-query'
import { getJson } from '@/lib/api'
import type { PlanMarkersResponse } from '@/lib/contracts/plan-markers'
import { qk } from '@/lib/query-keys'

export const PLAN_MARKERS_STALE_MS = 30_000

export function usePlanMarkers(projectId: string) {
  return useQuery({
    queryKey: qk.planMarkers(projectId),
    queryFn: ({ signal }) => getJson<PlanMarkersResponse>(`/api/projects/${projectId}/plan-markers`, { signal }),
    staleTime: PLAN_MARKERS_STALE_MS,
  })
}
