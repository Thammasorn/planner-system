// src/proxy.ts — Node runtime (Next 16). M1 adds session validation + login/must-change redirects ABOVE the nonce code.
import { NextResponse, type NextRequest } from 'next/server'
import { buildCsp, generateNonce, NONCE_HEADER, securityHeaders, type CspOptions } from '@/lib/csp'
import { getEnv } from '@/server/env'

export function proxy(request: NextRequest): NextResponse {
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
