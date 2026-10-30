import { describe, expect, it } from 'vitest'
import { buildCsp, generateNonce, securityHeaders, type CspOptions } from '@/lib/csp'

const ALL_OPTIONS: CspOptions[] = [
  { dev: false, https: false },
  { dev: true, https: false },
  { dev: false, https: true },
  { dev: true, https: true },
]

describe('csp', () => {
  it('production policy', () => {
    expect(buildCsp('abc', { dev: false, https: false })).toBe(
      "default-src 'self'; script-src 'self' 'nonce-abc'; style-src 'self' 'unsafe-inline'; img-src 'self' blob: data:; font-src 'self'; connect-src 'self'; media-src 'self' blob:; worker-src 'self' blob:; frame-src 'none'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'; manifest-src 'self'",
    )
  })

  it('dev adds unsafe-eval and websockets', () => {
    const csp = buildCsp('abc', { dev: true, https: false })
    expect(csp).toContain("script-src 'self' 'nonce-abc' 'unsafe-eval'")
    expect(csp).toContain("connect-src 'self' ws: wss:")
    expect(buildCsp('abc', { dev: false, https: false })).not.toContain('unsafe-eval')
  })

  it('https adds upgrade-insecure-requests', () => {
    expect(buildCsp('abc', { dev: false, https: true }).endsWith('; upgrade-insecure-requests')).toBe(true)
    expect(buildCsp('abc', { dev: false, https: false })).not.toContain('upgrade-insecure-requests')
  })

  it('never uses strict-dynamic or a style nonce', () => {
    for (const opts of ALL_OPTIONS) {
      const csp = buildCsp('abc', opts)
      expect(csp).not.toContain('strict-dynamic')
      const styleSrc = csp.split('; ').find((d) => d.startsWith('style-src'))
      expect(styleSrc).toBe("style-src 'self' 'unsafe-inline'")
      expect(styleSrc).not.toContain('nonce-')
    }
  })

  it('nonces are fresh base64', () => {
    const nonces = Array.from({ length: 100 }, () => generateNonce())
    expect(new Set(nonces).size).toBe(100)
    for (const nonce of nonces) {
      expect(nonce).toMatch(/^[A-Za-z0-9+/]+=*$/)
      expect(nonce.length).toBeGreaterThanOrEqual(24)
    }
  })

  it('security headers', () => {
    const plain = new Map(securityHeaders({ dev: false, https: false }))
    expect(plain.get('X-Content-Type-Options')).toBe('nosniff')
    expect(plain.get('Referrer-Policy')).toBe('strict-origin-when-cross-origin')
    expect(plain.get('Permissions-Policy')).toBe('camera=(), microphone=(), geolocation=()')
    expect(plain.get('X-Frame-Options')).toBe('DENY')
    expect(plain.has('Strict-Transport-Security')).toBe(false)

    const https = new Map(securityHeaders({ dev: false, https: true }))
    expect(https.get('Strict-Transport-Security')).toBe('max-age=31536000')
  })
})
