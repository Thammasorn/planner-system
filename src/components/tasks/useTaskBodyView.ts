'use client'
import { useQuery } from '@tanstack/react-query'
import { getJson } from '@/lib/api'
import type { TaskBodyView } from '@/lib/contracts/task-pages'
import { qk } from '@/lib/query-keys'

/**
 * `GET /api/tasks/[id]/body` (M6.1-D7) under `qk.taskBody` — the panel loads it; the task page seeds it from the RSC view.
 * `enabled: false` while the id is not a known task (the panel's "ไม่พบงาน" state must not ask the server — a 404).
 */
export function useTaskBodyView(taskId: string, initial?: TaskBodyView, enabled = true) {
  return useQuery({
    queryKey: qk.taskBody(taskId),
    queryFn: ({ signal }) => getJson<TaskBodyView>(`/api/tasks/${taskId}/body`, { signal }),
    enabled,
    ...(initial ? { initialData: initial } : {}),
  })
}
