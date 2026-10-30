import { NextRequest } from 'next/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { config, proxy } from '@/proxy'
import { resetEnvCache } from '@/server/env'

const DEV_URL = 'postgres://planner:planner@localhost:54329/planner'

beforeEach(() => {
  vi.stubEnv('DATABASE_URL', DEV_URL)
  vi.stubEnv('SECURE_COOKIES', 'false')
  resetEnvCache()
})
afterEach(() => {
  resetEnvCache()
})

describe('proxy', () => {
  it('sets the CSP on the response and hands the nonce to the render', () => {
    const res = proxy(new NextRequest('http://localhost:3100/home'))
    const nonce = res.headers.get('x-middleware-request-x-nonce') // Next's request-override header
    expect(nonce).toMatch(/^[A-Za-z0-9+/]+=*$/)
    const csp = res.headers.get('content-security-policy')
    expect(csp).toContain(`'nonce-${nonce ?? 'missing'}'`)
    // The same policy is forwarded to the render so Next stamps the nonce on its own scripts.
    expect(res.headers.get('x-middleware-request-content-security-policy')).toBe(csp)
    // Fresh per request.
    const other = proxy(new NextRequest('http://localhost:3100/home'))
    expect(other.headers.get('x-middleware-request-x-nonce')).not.toBe(nonce)
  })

  it('adds the static security headers', () => {
    const res = proxy(new NextRequest('http://localhost:3100/home'))
    expect(res.headers.get('x-content-type-options')).toBe('nosniff')
    expect(res.headers.get('referrer-policy')).toBe('strict-origin-when-cross-origin')
    expect(res.headers.get('permissions-policy')).toBe('camera=(), microphone=(), geolocation=()')
    expect(res.headers.get('x-frame-options')).toBe('DENY')
    expect(res.headers.get('strict-transport-security')).toBeNull()
    expect(res.headers.get('content-security-policy')).not.toContain('upgrade-insecure-requests')

    vi.stubEnv('SECURE_COOKIES', 'true')
    resetEnvCache()
    const secure = proxy(new NextRequest('https://planner.company.local/home'))
    expect(secure.headers.get('strict-transport-security')).toBe('max-age=31536000')
    expect(secure.headers.get('content-security-policy')?.endsWith('upgrade-insecure-requests')).toBe(true)
  })

  it('matcher skips /api, Next assets and the favicon', () => {
    const [entry] = config.matcher
    const re = new RegExp('^' + (entry?.source ?? '') + '$')
    for (const path of ['/', '/home', '/settings/employees']) expect(re.test(path), path).toBe(true)
    for (const path of [
      '/api/health',
      '/api/files',
      '/_next/static/chunks/a.js',
      '/_next/image',
      '/favicon.ico',
    ]) {
      expect(re.test(path), path).toBe(false)
    }
  })
})
