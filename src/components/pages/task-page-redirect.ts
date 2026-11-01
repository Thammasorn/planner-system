// src/components/pages/task-page-redirect.ts — `/p/<id>` of a TASK page is the body of a task: after authz the route
// redirects to the task page instead of rendering the document screen (M6.1-D5, FR-682). Isomorphic, pure.
import type { PageDTO } from '@/lib/contracts/pages'

/** `/t/<taskId>` for a TASK page, else null (DOC pages render PageScreen). */
export function taskPageRedirect(page: Pick<PageDTO, 'kind' | 'taskId'>): string | null {
  return page.kind === 'TASK' && page.taskId ? `/t/${page.taskId}` : null
}
