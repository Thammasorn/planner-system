// tests/authz/types.ts — the table-driven authorization matrix contract (PLAN.md §4.4, X91).
import type { ActionResult } from '@/lib/action-result'
import type { AuditEntity } from '@/server/audit'
import type { ALLOCATION_AUDIT_ENTITY } from '@/server/services/allocations'
import type { TestUser } from '../helpers/factories'
import type { World, WorldPart } from '../helpers/world'

/** Audit entities the matrix may expect. M6 rows expect `ALLOCATION_AUDIT_ENTITY` ('allocation', M6-D29/X93), which
 *  M6 S2 adds to `AuditEntity` itself; the explicit union keeps the rows typed against the canonical constant. */
export type MatrixAuditEntity = AuditEntity | typeof ALLOCATION_AUDIT_ENTITY

/** M manager · L lead · Me member · W outsider (in M1 L/Me/W are three plain workers). */
export type Role = 'M' | 'L' | 'Me' | 'W'
export type Outcome = 'allow' | '404' | '403' | '400' | '401' | '409' | '413' | '415' | '429'

export interface AuthzRow<C = unknown> {
  id: string
  spec: string
  /** action rows: the exported action name ('createEmployee'); route rows: '<METHOD> /api/<path>' ('POST /api/files',
   *  'GET /api/sidebar'); loader rows: 'services.<area>.<fn>'. M1's T-META-01 checks action names only; M2's AZ-2 adds routes. */
  action: string
  mutates: boolean
  /** required for mutating rows unless explicitly false (X44 exceptions). projectId: omitted → the audit row's
   *  project_id must be null; a function → must equal its result; 'any' → not checked (rows that create a project). */
  audit?: { entity: MatrixAuditEntity; projectId?: ((w: World, ctx: C) => string | null) | 'any' } | false
  /** action allowed while mustChangePassword */
  allowMustChange?: boolean
  /** world parts the row needs (X91); default [] */
  with?: readonly WorldPart[]
  expect: Record<Role, Outcome>
  setup?: (w: World, actor: TestUser) => Promise<C>
  /** Action rows return the action result, route rows the Response; loader rows (M2) return an Outcome computed with
   *  `loaderOutcome()` (tests/authz/_support/loader.ts → outcomeOfCall behind the page session gate). */
  run: (w: World, ctx: C, actor: TestUser) => Promise<ActionResult<object> | Response | Outcome>
}

/**
 * Registers a row whose setup returns a typed context: the matrix passes `ctx` straight from `setup` to `run`, so
 * erasing C for the shared `AuthzRow[]` registry is safe (a function parameter cannot widen to `unknown` implicitly).
 */
export function defineRow<C>(row: AuthzRow<C>): AuthzRow {
  return row as unknown as AuthzRow
}
