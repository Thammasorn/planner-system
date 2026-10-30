// src/lib/csp.ts — isomorphic (proxy, layout, tests): Web APIs only (`btoa`, `crypto`), never `Buffer`.

/** Request header the proxy uses to hand the per-request CSP nonce to the root layout (PLAN.md §3.12). */
export const NONCE_HEADER = 'x-nonce'

export interface CspOptions {
  /** NODE_ENV === 'development': adds 'unsafe-eval' to script-src and ws:/wss: to connect-src. */
  dev: boolean
  /** SECURE_COOKIES === 'true': adds upgrade-insecure-requests and HSTS. */
  https: boolean
}

/** Base64 nonce, fresh per request (128 random bits inside a UUID string). */
export function generateNonce(): string {
  return btoa(crypto.randomUUID())
}

/** The Content-Security-Policy value (M0-D10). */
export function buildCsp(nonce: string, opts: CspOptions): string {
  return [
    `default-src 'self'`,
    `script-src 'self' 'nonce-${nonce}'${opts.dev ? ` 'unsafe-eval'` : ''}`, // no 'strict-dynamic' (next#98015)
    `style-src 'self' 'unsafe-inline'`, // Emotion, sonner (and Mantine in M4) inject <style> without a nonce
    `img-src 'self' blob: data:`,
    `font-src 'self'`,
    `connect-src 'self'${opts.dev ? ' ws: wss:' : ''}`,
    `media-src 'self' blob:`,
    `worker-src 'self' blob:`,
    `frame-src 'none'`,
    `object-src 'none'`,
    `base-uri 'self'`,
    `form-action 'self'`,
    `frame-ancestors 'none'`,
    `manifest-src 'self'`,
    ...(opts.https ? ['upgrade-insecure-requests'] : []), // would break plain-HTTP LAN installs
  ].join('; ')
}

/** Static security headers for page responses (M0-D10). HSTS only behind HTTPS. */
export function securityHeaders(opts: CspOptions): ReadonlyArray<readonly [name: string, value: string]> {
  return [
    ['X-Content-Type-Options', 'nosniff'],
    ['Referrer-Policy', 'strict-origin-when-cross-origin'],
    ['Permissions-Policy', 'camera=(), microphone=(), geolocation=()'],
    ['X-Frame-Options', 'DENY'],
    ...(opts.https ? ([['Strict-Transport-Security', 'max-age=31536000']] as const) : []),
  ]
}
