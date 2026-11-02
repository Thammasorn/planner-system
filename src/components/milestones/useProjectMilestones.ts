'use client'
// src/components/milestones/useProjectMilestones.ts — the milestone reads (plan/m08 S4.1, X83 getJson, M8-D17/D18).
import { useQuery } from '@tanstack/react-query'
import { getJson } from '@/lib/api'
import type { MilestoneTargetsResponse, ProjectMilestonesResponse } from '@/lib/contracts/milestones'
import { qk } from '@/lib/query-keys'

/** GET /api/projects/[id]/milestones (overview section, /tasks milestone filter). `projectId` null → disabled. */
export function useProjectMilestones(projectId: string | null) {
  return useQuery({
    queryKey: qk.projectMilestones(projectId ?? ''),
    queryFn: ({ signal }) =>
      getJson<ProjectMilestonesResponse>(`/api/projects/${projectId}/milestones`, { signal }),
    enabled: projectId !== null && projectId !== '',
  })
}

/** GET /api/milestones/targets — projects where the viewer may create a milestone (palette command, dialog). */
export function useMilestoneTargets(enabled: boolean) {
  return useQuery({
    queryKey: qk.milestoneTargets(),
    queryFn: ({ signal }) => getJson<MilestoneTargetsResponse>('/api/milestones/targets', { signal }),
    enabled,
    staleTime: 60_000,
  })
}
