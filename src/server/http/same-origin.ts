// src/server/http/same-origin.ts — M4-D18: mutating route handlers (POST /api/files, POST|DELETE /api/pages/[id]/lock,
// PUT /api/pages/[id]/content) reject a present Origin header that is not this server. Server actions keep Next's
// built-in origin check. Accepted: the request host, the first x-forwarded-host (as M1's Better Auth setup behind
// the reverse proxy sees it) and the BETTER_AUTH_URL / TRUSTED_ORIGINS origins (M1 trustedOrigins).
import { ForbiddenError } from '../errors'

const csv = (v: string | undefined): string[] =>
  (v ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)

function hostOf(u: string): string | null {
  try {
    return new URL(u).host.toLowerCase()
  } catch {
    return null
  }
}

/** No Origin → ok (same-origin GET-like navigations, curl); a foreign or unparsable Origin → ForbiddenError. */
export function assertSameOrigin(req: Request): void {
  const origin = req.headers.get('origin')
  if (origin === null) return
  const host = hostOf(origin)
  if (host === null) throw new ForbiddenError()
  const allowed = new Set<string>()
  const own = hostOf(req.url)
  if (own) allowed.add(own)
  const forwarded = req.headers.get('x-forwarded-host')?.split(',')[0]?.trim().toLowerCase()
  if (forwarded) allowed.add(forwarded)
  for (const o of [process.env.BETTER_AUTH_URL ?? '', ...csv(process.env.TRUSTED_ORIGINS)]) {
    const h = o ? hostOf(o) : null
    if (h) allowed.add(h)
  }
  if (!allowed.has(host)) throw new ForbiddenError()
}
