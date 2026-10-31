// M4 S1.6 — M4-D18 same-origin guard for mutating route handlers.
import { describe, expect, it, vi } from 'vitest'
import { ForbiddenError } from '../errors'
import { assertSameOrigin } from './same-origin'

const req = (headers: Record<string, string>, url = 'http://localhost:3000/api/files'): Request =>
  new Request(url, { method: 'POST', headers })

describe('assertSameOrigin', () => {
  it('no Origin → ok', () => {
    expect(() => assertSameOrigin(req({}))).not.toThrow()
  })

  it('same host → ok', () => {
    expect(() => assertSameOrigin(req({ origin: 'http://localhost:3000' }))).not.toThrow()
  })

  it('other origin, other port or "null" → ForbiddenError', () => {
    expect(() => assertSameOrigin(req({ origin: 'https://evil.example' }))).toThrow(ForbiddenError)
    expect(() => assertSameOrigin(req({ origin: 'http://localhost:4000' }))).toThrow(ForbiddenError)
    expect(() => assertSameOrigin(req({ origin: 'null' }))).toThrow(ForbiddenError)
  })

  it('respects x-forwarded-host and the trusted origins', () => {
    vi.stubEnv('BETTER_AUTH_URL', 'https://planner.example')
    vi.stubEnv('TRUSTED_ORIGINS', 'https://alt.example, https://other.example')
    const internal = 'http://app:3000/api/files'
    expect(() =>
      assertSameOrigin(req({ origin: 'https://proxy.example', 'x-forwarded-host': 'proxy.example' }, internal)),
    ).not.toThrow()
    expect(() => assertSameOrigin(req({ origin: 'https://planner.example' }, internal))).not.toThrow()
    expect(() => assertSameOrigin(req({ origin: 'https://other.example' }, internal))).not.toThrow()
    expect(() => assertSameOrigin(req({ origin: 'https://evil.example' }, internal))).toThrow(ForbiddenError)
  })
})
