// src/server/route.ts — the route-handler wrapper (PLAN.md §3.4.3). Same session + must-change gates as action();
// parses `opts.query` from the search params (400 on failure); objects → JSON with
// `Cache-Control: private, no-store`; AppError → { code, message, fieldErrors? } + its HTTP status.
// Id params are parsed inside the handler; a malformed id is a 404 (X86).
import { unstable_rethrow } from 'next/navigation'
import type { z } from 'zod'
import { ERROR_STATUS } from '@/lib/action-result'
import { MustChangePasswordError, toActionError, UnauthenticatedError, ValidationError } from './errors'
import { getSessionUser, type SessionUser } from './session'

export const JSON_HEADERS = {
  'Cache-Control': 'private, no-store',
  'X-Content-Type-Options': 'nosniff',
} as const

type Params = Record<string, string | string[]>
type QueryOf<Q> = Q extends z.ZodType ? z.output<Q> : undefined

export interface RouteCtx<P extends Params, Q, U> {
  user: U
  params: P
  url: URL
  /** Parsed `opts.query` (undefined without a query schema). */
  query: QueryOf<Q>
}

export interface RouteOptions<Q extends z.ZodType | undefined> {
  query?: Q
  allowWhenMustChangePassword?: boolean
}

export type RouteHandler<P extends Params> = (req: Request, ctx: { params: Promise<P> }) => Promise<Response>

export function jsonResponse(body: unknown, status = 200): Response {
  return Response.json(body, { status, headers: JSON_HEADERS })
}

export function route<P extends Params = Record<string, never>, Q extends z.ZodType | undefined = undefined>(
  handler: (req: Request, ctx: RouteCtx<P, Q, SessionUser>) => Promise<Response | object>,
  opts?: RouteOptions<Q> & { public?: false },
): RouteHandler<P>
export function route<P extends Params = Record<string, never>, Q extends z.ZodType | undefined = undefined>(
  handler: (req: Request, ctx: RouteCtx<P, Q, SessionUser | null>) => Promise<Response | object>,
  opts: RouteOptions<Q> & { public: true },
): RouteHandler<P>
export function route<P extends Params, Q extends z.ZodType | undefined>(
  handler: (req: Request, ctx: RouteCtx<P, Q, SessionUser>) => Promise<Response | object>,
  opts?: RouteOptions<Q> & { public?: boolean },
): RouteHandler<P> {
  return async (req, ctx) => {
    try {
      const user = await getSessionUser()
      if (!opts?.public) {
        if (!user) throw new UnauthenticatedError()
        if (user.mustChangePassword && !opts?.allowWhenMustChangePassword) throw new MustChangePasswordError()
      }
      const url = new URL(req.url)
      let query: unknown = undefined
      if (opts?.query) {
        const parsed = opts.query.safeParse(Object.fromEntries(url.searchParams))
        if (!parsed.success) throw ValidationError.fromZod(parsed.error)
        query = parsed.data
      }
      const params = await ctx.params
      // `user` is non-null here unless opts.public, whose overload types the handler's user as `SessionUser | null`.
      const out = await handler(req, { user: user as SessionUser, params, url, query: query as QueryOf<Q> })
      return out instanceof Response ? out : jsonResponse(out)
    } catch (e) {
      unstable_rethrow(e)
      const { ok: _ok, ...body } = toActionError(e)
      return jsonResponse(body, ERROR_STATUS[body.code])
    }
  }
}
