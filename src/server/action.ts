// src/server/action.ts — the server-action wrapper (SPEC §7.3 ACT-1, PLAN.md §3.4.2).
// Order: session gate → must-change gate → zod parse → handler (authz first, then service in one tx) → result.
// Errors never cross the wire as throws: AppError / Postgres errors → ActionError; Next's redirect()/notFound()
// are rethrown (unstable_rethrow) so they keep working.
import { unstable_rethrow } from 'next/navigation'
import type { z } from 'zod'
import type { ActionResult } from '@/lib/action-result'
import { MustChangePasswordError, toActionError, UnauthenticatedError, ValidationError } from './errors'
import { getSessionUser, type SessionUser } from './session'

export interface ActionCtx {
  user: SessionUser
}

export interface ActionOptions {
  /** FR-104: only logout, changeOwnPassword and signOutEverywhere (M1-D6). */
  allowWhenMustChangePassword?: boolean
}

function parseOrThrow<S extends z.ZodType>(schema: S, input: unknown): z.output<S> {
  const parsed = schema.safeParse(input)
  if (!parsed.success) throw ValidationError.fromZod(parsed.error)
  return parsed.data
}

/** Authenticated action. The handler must call an `authz.*` function before touching data (AZ-2). */
export function action<S extends z.ZodType, T extends object>(
  schema: S,
  handler: (input: z.output<S>, ctx: ActionCtx) => Promise<T>,
  opts?: ActionOptions,
): (input: z.input<S>) => Promise<ActionResult<T>> {
  return async (input: z.input<S>): Promise<ActionResult<T>> => {
    try {
      const user = await getSessionUser()
      if (!user) throw new UnauthenticatedError()
      if (user.mustChangePassword && !opts?.allowWhenMustChangePassword) throw new MustChangePasswordError()
      const data = parseOrThrow(schema, input)
      const result = await handler(data, { user })
      return { ...result, ok: true as const }
    } catch (e) {
      unstable_rethrow(e)
      return toActionError(e)
    }
  }
}

/** Action without the session gate (login only, M1-D6); the handler receives the user when there is one. */
export function publicAction<S extends z.ZodType, T extends object>(
  schema: S,
  handler: (input: z.output<S>, ctx: { user: SessionUser | null }) => Promise<T>,
): (input: z.input<S>) => Promise<ActionResult<T>> {
  return async (input: z.input<S>): Promise<ActionResult<T>> => {
    try {
      const user = await getSessionUser()
      const data = parseOrThrow(schema, input)
      const result = await handler(data, { user })
      return { ...result, ok: true as const }
    } catch (e) {
      unstable_rethrow(e)
      return toActionError(e)
    }
  }
}
