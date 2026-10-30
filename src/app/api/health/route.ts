// src/app/api/health/route.ts — public readiness probe (M0-D11, M0-D24). Exempt from authz: reads no app data.
import { sql } from 'drizzle-orm'
import { getDb } from '@/server/db/client'

export const dynamic = 'force-dynamic' // never evaluated by `next build` (no DB at build time)

// The route() wrapper (M1) takes these over for every other handler.
const HEADERS = { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } as const

/** Driver error code (e.g. ECONNREFUSED, 28P01); Drizzle wraps driver errors in DrizzleQueryError.cause. */
function errorCode(error: unknown): string {
  for (let current: unknown = error, depth = 0; depth < 3; depth++) {
    if (typeof current !== 'object' || current === null) break
    const code = 'code' in current ? current.code : undefined
    if (typeof code === 'string' || typeof code === 'number') return String(code)
    current = 'cause' in current ? current.cause : undefined
  }
  return 'unknown'
}

/** Public readiness probe (Docker healthcheck, Playwright webServer.url). Reads no application data. */
export async function GET(): Promise<Response> {
  try {
    await getDb().execute(sql`select 1`)
    return Response.json({ ok: true }, { headers: HEADERS })
  } catch (error: unknown) {
    // Only the code: the message of a wrapped error may carry query params, never the connection string.
    console.error(`[health] database ping failed (${errorCode(error)})`)
    return Response.json({ ok: false }, { status: 503, headers: HEADERS })
  }
}
