// src/server/audit.ts — audit log writer (SPEC FR-1201, PLAN.md §3.4.6, X44, M1-D5).
// Services call it as their last statement inside the caller's transaction; scripts pass actor = null.
// No 'server-only' (M1-D4). Usage: `import * as audit from '@/server/audit'` → `await audit.log(tx, actor, { … })`.
import { auditLog } from './db/schema'
import type { DbOrTx } from './db/types'

/** Grows to exactly the X93 list: M2 client, project, project_member · M3 task, task_assignment, task_status,
 *  task_blocker · M4 page, file · M5 holiday, leave_type, time_off · M6 allocation · M8 milestone. */
export type AuditEntity =
  | 'user'
  | 'position'
  | 'client'
  | 'project'
  | 'project_member'
  | 'task'
  | 'task_assignment'
  | 'task_status'
  | 'task_blocker'
  | 'page'
  | 'file'
  | 'holiday'
  | 'leave_type'
  | 'time_off'
export type AuditAction = 'create' | 'update' | 'delete' | 'restore'

export interface AuditInput {
  entity: AuditEntity
  entityId: string
  action: AuditAction
  /** Omitted/null for global entities (users, positions). */
  projectId?: string | null
  /** Thai, from th.audit.* builders. */
  summary: string
  before?: Record<string, unknown> | null
  after?: Record<string, unknown> | null
}

/** Keys that must never reach audit_log (defence in depth; matched case-insensitively at any depth). */
export const FORBIDDEN_KEYS = ['password', 'passwordHash', 'hash', 'token', 'sessionToken'] as const
const FORBIDDEN = new Set<string>(FORBIDDEN_KEYS.map((k) => k.toLowerCase()))

function findForbiddenKey(value: unknown, depth = 0): string | null {
  if (depth > 8 || value === null || typeof value !== 'object') return null
  if (Array.isArray(value)) {
    for (const item of value) {
      const hit = findForbiddenKey(item, depth + 1)
      if (hit) return hit
    }
    return null
  }
  for (const [key, child] of Object.entries(value)) {
    if (FORBIDDEN.has(key.toLowerCase())) return key
    const hit = findForbiddenKey(child, depth + 1)
    if (hit) return hit
  }
  return null
}

export async function log(tx: DbOrTx, actor: { id: string } | null, input: AuditInput): Promise<void> {
  const bad = findForbiddenKey(input.before) ?? findForbiddenKey(input.after)
  if (bad) throw new Error(`audit.log: forbidden key "${bad}" in before/after`)
  await tx.insert(auditLog).values({
    actorId: actor?.id ?? null,
    entity: input.entity,
    entityId: input.entityId,
    action: input.action,
    projectId: input.projectId ?? null,
    summary: input.summary,
    before: input.before ?? null,
    after: input.after ?? null,
  })
}
