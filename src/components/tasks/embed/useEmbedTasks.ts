'use client'
// src/components/tasks/embed/useEmbedTasks.ts — GET /api/pages/:id/embed/tasks for the "มุมมองงาน" live block
// (FR-1301/1306, M10-D2/D10). Always fresh on mount / focus; a project answer seeds M3's qk.projectTasks so the block's
// list and board reuse M3's mutations, optimistic patches and undo unchanged.
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { getJson } from '@/lib/api'
import type { EmbedTasksResponse } from '@/lib/contracts/embed'
import { qk } from '@/lib/query-keys'

/** The block-level answer: the task data itself lives in qk.projectTasks(projectId). */
export type EmbedTasksTarget =
  { kind: 'wiki' } | { kind: 'project'; projectId: string; projectName: string; tasksHref: string }

export function useEmbedTasks(pageId: string) {
  const qc = useQueryClient()
  return useQuery({
    queryKey: qk.pageEmbedTasks(pageId),
    staleTime: 0,
    refetchOnWindowFocus: 'always',
    refetchOnMount: 'always',
    queryFn: async ({ signal }): Promise<EmbedTasksTarget> => {
      const r = await getJson<EmbedTasksResponse>(`/api/pages/${pageId}/embed/tasks`, { signal })
      if (r.kind === 'wiki') return { kind: 'wiki' }
      qc.setQueryData(qk.projectTasks(r.projectId), r.data) // M3 cache → mutations / optimism unchanged
      return { kind: 'project', projectId: r.projectId, projectName: r.projectName, tasksHref: r.tasksHref }
    },
  })
}
