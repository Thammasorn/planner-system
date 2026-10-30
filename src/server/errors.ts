// src/server/errors.ts — the error vocabulary of actions and routes (PLAN.md §3.4.1, M1-D23).
// No 'server-only' (M1-D4): services and scripts import it outside the react-server condition.
import { th } from '@/i18n/th'
import { z } from '@/lib/z'
import { ERROR_STATUS, type ActionError, type ErrorCode } from '@/lib/action-result'

export type { ErrorCode } from '@/lib/action-result'

type Extra = { fieldErrors?: Record<string, string[]> } & Record<string, unknown>

/** Base class: `code` → HTTP status via ERROR_STATUS; `message` is always Thai (th.errors[code] by default). */
export class AppError extends Error {
  readonly code: ErrorCode
  readonly extra: Extra

  constructor(code: ErrorCode, message?: string, extra: Extra = {}) {
    super(message ?? th.errors[code])
    this.name = 'AppError'
    this.code = code
    this.extra = extra
  }

  get status(): number {
    return ERROR_STATUS[this.code]
  }
}

export class UnauthenticatedError extends AppError {
  constructor() {
    super('UNAUTHENTICATED')
  }
}

export class MustChangePasswordError extends AppError {
  constructor() {
    super('MUST_CHANGE_PASSWORD')
  }
}

/** Missing **or not visible** — never reveals existence (CLAUDE.md › สิทธิ์). */
export class NotFoundError extends AppError {
  constructor() {
    super('NOT_FOUND')
  }
}

/** Visible but not allowed for this role. */
export class ForbiddenError extends AppError {
  constructor(message?: string) {
    super('FORBIDDEN', message)
  }
}

export class ValidationError extends AppError {
  /** fieldErrors = z.flattenError(err).fieldErrors (string[] per key). */
  static fromZod(err: z.ZodError): ValidationError {
    const fieldErrors: Record<string, string[]> = {}
    for (const [key, messages] of Object.entries<string[] | undefined>(z.flattenError(err).fieldErrors)) {
      if (messages?.length) fieldErrors[key] = messages
    }
    return new ValidationError(fieldErrors)
  }

  constructor(fieldErrors: Record<string, string[]>, message?: string) {
    super('VALIDATION', message, { fieldErrors })
  }
}

export type ConflictCode =
  'CONFLICT' | 'VERSION_CONFLICT' | 'OVERLAP' | 'LAST_MANAGER' | 'SELF_DEACTIVATE' | 'IN_USE'

export class ConflictError extends AppError {
  constructor(code: ConflictCode, message?: string, extra?: Extra) {
    super(code, message, extra)
  }
}

/** FR-106 lockout (429). */
export class RateLimitedError extends AppError {
  constructor() {
    super('LOGIN_LOCKED', th.auth.errors.LOGIN_LOCKED)
  }
}

/** Stub bodies of contracts not implemented yet (S0 → S2). The action wrapper turns it into INTERNAL. */
export function notImplemented(step: string): Error {
  return new Error('NOT_IMPLEMENTED: ' + step)
}

type PgLike = { code?: unknown; constraint_name?: unknown; constraint?: unknown }

function hasCode(v: unknown): v is PgLike & { code: string } {
  return v !== null && typeof v === 'object' && 'code' in v && typeof v.code === 'string'
}

function pgOf(e: unknown): PgLike | null {
  if (e === null || typeof e !== 'object') return null
  const cause = 'cause' in e ? e.cause : undefined
  if (hasCode(cause)) return cause
  return hasCode(e) ? e : null
}

/**
 * Postgres error info for services that branch on constraint names. Reads `e.cause` first (DrizzleQueryError wraps
 * the postgres.js PostgresError), then `e` itself.
 */
export function pgErrorInfo(e: unknown): { code?: string; constraint?: string } {
  const pg = pgOf(e)
  if (!pg) return {}
  const out: { code?: string; constraint?: string } = {}
  if (typeof pg.code === 'string') out.code = pg.code
  const constraint = pg.constraint_name ?? pg.constraint
  if (typeof constraint === 'string') out.constraint = constraint
  return out
}

/**
 * Maps Postgres errors in one place (X86). Never logs or copies `.message` (params may hold hashes).
 * 23505 → CONFLICT · 23503 → IN_USE · 23P01 → OVERLAP · 23514 → VALIDATION · P0001 → INTERNAL · otherwise null.
 * (M6 adds a constraint-specific branch before OVERLAP: 23P01 on allocations_one_resolution_per_week → INTERNAL.)
 */
export function mapDbError(e: unknown): AppError | null {
  switch (pgErrorInfo(e).code) {
    case '23505':
      return new ConflictError('CONFLICT')
    case '23503':
      return new ConflictError('IN_USE')
    case '23P01':
      return new ConflictError('OVERLAP')
    case '23514':
      return new ValidationError({})
    case 'P0001':
      return new AppError('INTERNAL')
    default:
      return null
  }
}

/** Serialises any thrown value into an ActionError. Unknown errors are logged as {name, code} only → INTERNAL. */
export function toActionError(e: unknown): ActionError {
  const app = e instanceof AppError ? e : mapDbError(e)
  if (app) {
    if (app.code === 'INTERNAL') logInternal(e)
    const { fieldErrors, ...rest } = app.extra
    return {
      ...rest,
      ok: false,
      code: app.code,
      message: app.message,
      ...(fieldErrors ? { fieldErrors } : {}),
    }
  }
  logInternal(e)
  return { ok: false, code: 'INTERNAL', message: th.errors.INTERNAL }
}

/** Logs without messages or params: only the error class name and the Postgres code (if any). */
export function logInternal(e: unknown): void {
  const name = e instanceof Error ? e.name : typeof e
  const { code } = pgErrorInfo(e)
  const marker = e instanceof Error && e.message.startsWith('NOT_IMPLEMENTED: ') ? e.message : undefined
  console.error('[action] internal error', { name, ...(code ? { code } : {}), ...(marker ? { marker } : {}) })
}
