// src/lib/action-result.ts — isomorphic result types of the `action()` wrapper (SPEC §7.3, PLAN.md §3.4.2).
// Imported by client components; no server imports here.

/** Every error code an action or route can return. HTTP status per code in ERROR_STATUS (M1-D23). */
export type ErrorCode =
  | 'UNAUTHENTICATED'
  | 'MUST_CHANGE_PASSWORD'
  | 'NOT_FOUND'
  | 'FORBIDDEN'
  | 'VALIDATION'
  | 'CONFLICT'
  | 'VERSION_CONFLICT'
  | 'OVERLAP'
  | 'LAST_MANAGER'
  | 'SELF_DEACTIVATE'
  | 'IN_USE'
  | 'LOGIN_LOCKED'
  | 'INVALID_CREDENTIALS'
  | 'ACCOUNT_DEACTIVATED'
  | 'INVALID_PASSWORD'
  | 'INTERNAL'

export const ERROR_STATUS: Record<ErrorCode, number> = {
  UNAUTHENTICATED: 401,
  MUST_CHANGE_PASSWORD: 403,
  NOT_FOUND: 404,
  FORBIDDEN: 403,
  VALIDATION: 400,
  CONFLICT: 409,
  VERSION_CONFLICT: 409,
  OVERLAP: 409,
  LAST_MANAGER: 409,
  SELF_DEACTIVATE: 409,
  IN_USE: 409,
  LOGIN_LOCKED: 429,
  INVALID_CREDENTIALS: 401,
  ACCOUNT_DEACTIVATED: 403,
  INVALID_PASSWORD: 400,
  INTERNAL: 500,
}

/** `{ ok: false }` result. Extra fields (VERSION_CONFLICT `current`, NEEDS_CHOICE `{ week, weeks, pairs }`, …) ride along. */
export type ActionError = {
  ok: false
  code: ErrorCode
  message: string
  fieldErrors?: Record<string, string[]>
} & Record<string, unknown>

export type ActionResult<T extends object> = ({ ok: true } & T) | ActionError

/**
 * Payload type for actions that return nothing: an object type without keys. (`{}` is banned by
 * no-empty-object-type; `Record<string, never>` would turn `ok` into `never` inside `{ ok: true } & T`.)
 */
export type Ok = { [K in never]: never }

const BASE_KEYS = new Set(['ok', 'code', 'message', 'fieldErrors'])

/** Thrown by `unwrap` so TanStack `onError` / undo handlers can react; `message` is the Thai message. */
export class ActionFailure extends Error {
  readonly code: ErrorCode
  readonly fieldErrors?: Record<string, string[]>
  /** Every other field of the ActionError (e.g. VERSION_CONFLICT `current`, NEEDS_CHOICE `{ week, weeks, pairs }`) — X86. */
  readonly extra: Readonly<Record<string, unknown>>

  constructor(fail: ActionError) {
    super(fail.message)
    this.name = 'ActionFailure'
    this.code = fail.code
    if (fail.fieldErrors) this.fieldErrors = fail.fieldErrors
    this.extra = Object.fromEntries(Object.entries(fail).filter(([k]) => !BASE_KEYS.has(k)))
  }
}

function unwrapResult<T extends object>(res: ActionResult<T>): { ok: true } & T {
  if (!res.ok) throw new ActionFailure(res)
  return res
}

/**
 * Turns `{ ok: false }` into a thrown ActionFailure; returns the ok result unchanged. Accepts the action's
 * promise too (`undo: () => unwrap(restorePosition(row)).then(() => {})`), returning a promise that rejects.
 */
export function unwrap<T extends object>(res: ActionResult<T>): { ok: true } & T
export function unwrap<T extends object>(res: Promise<ActionResult<T>>): Promise<{ ok: true } & T>
export function unwrap<T extends object>(
  res: ActionResult<T> | Promise<ActionResult<T>>,
): ({ ok: true } & T) | Promise<{ ok: true } & T> {
  return res instanceof Promise ? res.then(unwrapResult) : unwrapResult(res)
}
