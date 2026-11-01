// tests/authz/rows/_m6_1.ts — shared helpers for the M6.1 rows file (task-pages.ts), the task-body masking block
// (masking.int.test.ts › task bodies (M6.1)), the golden task-body visibility block and the race test
// (plan/m06.1-task-page-ui.md S6.1–S6.6, §7.2). No rows here. Expectations follow SPEC §3.2 PERM-27/28 (task body
// = the task's view / edit permission: M/L/Me allow, W 404), X41/X42 (invisible → 404, archived write → 403) and
// M6.1-D4 (page APIs addressed at a TASK page → 404 for everyone).
import { eq } from 'drizzle-orm'
import { GET as GET_TASK_BODY } from '@/app/api/tasks/[id]/body/route'
import type { ActionResult } from '@/lib/action-result'
import type { SetPageFullWidthResult } from '@/lib/contracts/pages'
import type { EnsureTaskBodyResult } from '@/lib/contracts/task-pages'
import { setPageFullWidth } from '@/server/actions/pages'
import { ensureTaskBody } from '@/server/actions/task-pages'
import { db } from '@/server/db/client'
import { pages, type PageRow } from '@/server/db/schema'
import type { World, WorldPart } from '../../helpers/world'
import { callRoute } from '../_support/http'
import type { Outcome, Role } from '../types'

export {
  ALL,
  ARCH_WRITE,
  auditFileA,
  auditFileP,
  auditPageA,
  auditPageP,
  auditPageWiki,
  each,
  MGR,
  PROJ,
} from './_m4'

/** World parts of every M6.1 row: task bodies imply tasks + pages (S0.15). */
export const TASKB = ['taskBodies'] as const satisfies readonly WorldPart[]

/** A visible TASK page whose input the server rejects (FR-680 subpage): 400 for the team, 404 for W (authz first). */
export const PROJ_400 = { M: '400', L: '400', Me: '400', W: '404' } as const satisfies Record<Role, Outcome>

/** M3 task audits (T-UPDATE-NOTES is refused by zod before any write). */
export const auditTaskP = { entity: 'task', projectId: (w: World) => w.P.id } as const

/** `GET /api/tasks/{id}/body` as the current asUser() session (M6.1-D7). */
export const bodyGet = (taskId: string): Promise<Response> =>
  callRoute(GET_TASK_BODY, `/api/tasks/${taskId}/body`, { id: taskId })

/** `ensureTaskBody({ taskId })` (M6.1-D6). */
export const ensure = (taskId: string): Promise<ActionResult<EnsureTaskBodyResult>> => ensureTaskBody({ taskId })

/** `setPageFullWidth` (M6.1-D15) for a DOC page or a task (body created when missing). */
export const fullWidth = (
  target: { pageId: string } | { taskId: string },
  value = true,
): Promise<ActionResult<SetPageFullWidthResult>> => setPageFullWidth({ ...target, fullWidth: value })

/** A `subpage` block (FR-680: never allowed in TASK content). */
export const subpageContent = (pageId: string): unknown[] => [
  { type: 'paragraph', content: 'ก่อนการ์ด' },
  { type: 'subpage', props: { pageId } },
]

/** Every live or deleted TASK page row of a task (0 or 1 by `pages_task_id_unique`). */
export async function taskPagesOf(taskId: string): Promise<PageRow[]> {
  return db.select().from(pages).where(eq(pages.taskId, taskId))
}

/** The page row by id (fails loudly when missing). */
export async function pageRow(pageId: string): Promise<PageRow> {
  const [row] = await db.select().from(pages).where(eq(pages.id, pageId))
  if (!row) throw new Error(`pageRow: no page ${pageId}`)
  return row
}
