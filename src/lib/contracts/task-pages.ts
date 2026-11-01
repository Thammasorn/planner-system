// src/lib/contracts/task-pages.ts — isomorphic, type-only DTOs of task bodies and the task page (SPEC §4.6.4, §7.7;
// plan/m06.1 S0.4, M6.1-D6/D7).
import type { UploadLimits } from '@/lib/files/upload-rules'

/** The TASK page row of a task (FR-681). `isBlank` = isBlankPage (no text, no media). */
export interface TaskBodyPage {
  id: string
  version: number
  content: unknown[]
  fullWidth: boolean
  isBlank: boolean
}

/** `GET /api/tasks/[id]/body` (M6.1-D7): `page: null` until the body is first edited (FR-681). */
export interface TaskBodyView {
  taskId: string
  projectId: string
  page: TaskBodyPage | null
  /** edit = the viewer may edit the task (archived project → false, X42). */
  can: { edit: boolean }
  uploadLimits: UploadLimits
}

/** Everything `/t/[taskId]` needs for its first paint (RSC loader `getTaskPageView`, M6.1-D7). */
export interface TaskPageView {
  task: { id: string; name: string; projectId: string }
  project: { id: string; name: string; color: string; archived: boolean }
  /** Root → parent (same project, so no masking concern). */
  ancestors: { id: string; name: string }[]
  body: TaskBodyView
}

/** `ensureTaskBody` result (M6.1-D6): `created` = this call inserted the row (and wrote the `page · create` audit). */
export interface EnsureTaskBodyResult {
  pageId: string
  version: number
  created: boolean
}
