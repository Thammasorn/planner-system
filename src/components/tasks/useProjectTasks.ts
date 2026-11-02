'use client'
import { useQuery } from '@tanstack/react-query'
import { getJson } from '@/lib/api'
import type { ProjectTasksResponse } from '@/lib/contracts/tasks'
import { qk } from '@/lib/query-keys'

/** GET /api/projects/[id]/tasks — flat live tasks + statuses + blocker edges (M3-D37). Shared by list, board, panel.
 *  `enabled: false` skips the fetch (M9: the person grid's context id is a user id, not a project). */
export function useProjectTasks(projectId: string, opts: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: qk.projectTasks(projectId),
    queryFn: ({ signal }) => getJson<ProjectTasksResponse>(`/api/projects/${projectId}/tasks`, { signal }),
    enabled: opts.enabled ?? true,
  })
}
