// src/proxy.ts — Node runtime (Next 16). Every page request: session validation + login/must-change redirects
// (AC-101, AC-103), sliding cookie renewal (FR-103: RSC renders cannot set cookies, so the proxy forwards Better
// Auth's Set-Cookie — r2 §2.6), then the per-request CSP nonce and security headers (M0).
// The proxy is an optimisation + cookie renewal: pages, actions and routes still check the session themselves.
import { NextResponse, type NextRequest } from 'next/server'
import { buildCsp, generateNonce, NONCE_HEADER, securityHeaders, type CspOptions } from '@/lib/csp'
import { safeNext } from '@/lib/safe-next'
import { auth } from '@/server/auth'
import { getEnv } from '@/server/env'

const PUBLIC_PATHS = ['/login']
const MUST_CHANGE_ALLOWED = ['/account/password']

export async function proxy(request: NextRequest): Promise<NextResponse> {
  const { pathname, search } = request.nextUrl
  const isPublic = PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`))
  let authHeaders: Headers | null = null
  if (!isPublic) {
    const { headers, response: session } = await auth.api.getSession({
      headers: request.headers,
      returnHeaders: true,
    })
    authHeaders = headers
    if (!session) return withAuthCookies(redirectWithNext(request, '/login', pathname + search), authHeaders)
    if (session.user.mustChangePassword === true && !MUST_CHANGE_ALLOWED.includes(pathname)) {
      return withAuthCookies(redirectWithNext(request, '/account/password', pathname + search), authHeaders)
    }
  }
  return withAuthCookies(nextWithSecurityHeaders(request), authHeaders)
}

/** M0's nonce + CSP + security headers, unchanged. */
function nextWithSecurityHeaders(request: NextRequest): NextResponse {
  const env = getEnv()
  const opts: CspOptions = { dev: env.NODE_ENV === 'development', https: env.SECURE_COOKIES }
  const nonce = generateNonce()
  const csp = buildCsp(nonce, opts)
  const requestHeaders = new Headers(request.headers)
  requestHeaders.set(NONCE_HEADER, nonce) // read by src/app/layout.tsx
  requestHeaders.set('Content-Security-Policy', csp) // Next parses the nonce from here during SSR
  const response = NextResponse.next({ request: { headers: requestHeaders } })
  response.headers.set('Content-Security-Policy', csp)
  for (const [name, value] of securityHeaders(opts)) response.headers.set(name, value)
  return response
}

/** FR-103 sliding renewal and cookie clearing for dead sessions: copy Better Auth's Set-Cookie headers. */
function withAuthCookies(res: NextResponse, h: Headers | null): NextResponse {
  for (const c of h?.getSetCookie() ?? []) res.headers.append('set-cookie', c)
  return res
}

/**
 * 307 to `to`, with `?next=<path>` only for a meaningful same-origin target ('/' and '/home' → plain redirect;
 * '/settings/employees' → '/login?next=%2Fsettings%2Femployees'). X32.
 */
function redirectWithNext(request: NextRequest, to: string, next: string): NextResponse {
  const url = new URL(to, request.url)
  if (next !== '/' && next !== '/home' && safeNext(next) === next) url.search = `?next=${encodeURIComponent(next)}`
  return NextResponse.redirect(url, 307)
}

export const config = {
  matcher: [
    {
      // /api excluded: route handlers set their own headers and uploads must not be buffered (PLAN.md §1.3).
      // next/font files live under /_next/static/media, so fonts are excluded too.
      source: '/((?!api|_next/static|_next/image|favicon.ico|robots.txt).*)',
      missing: [
        { type: 'header', key: 'next-router-prefetch' },
        { type: 'header', key: 'purpose', value: 'prefetch' },
      ],
    },
  ],
}
