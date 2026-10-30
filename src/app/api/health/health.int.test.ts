import { afterEach, describe, expect, it, vi } from 'vitest'
import { GET } from '@/app/api/health/route'
import { closeDb } from '@/server/db/client'
import { resetEnvCache } from '@/server/env'

const UNREACHABLE = 'postgres://planner:planner@127.0.0.1:1/none'

afterEach(async () => {
  await closeDb()
  vi.unstubAllEnvs() // restores the worker DATABASE_URL set by tests/setup/db-worker.ts
  resetEnvCache()
})

function expectProbeHeaders(res: Response): void {
  expect(res.headers.get('cache-control')).toBe('no-store')
  expect(res.headers.get('x-content-type-options')).toBe('nosniff')
}

describe('GET /api/health', () => {
  it('200 { ok: true } when the DB answers', async () => {
    const res = await GET()
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true })
    expectProbeHeaders(res)
  })

  it('503 { ok: false } when the DB is unreachable', async () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {})
    await closeDb()
    vi.stubEnv('DATABASE_URL', UNREACHABLE)
    resetEnvCache()

    const res = await GET()
    expect(res.status).toBe(503)
    const body = await res.text()
    expect(JSON.parse(body)).toEqual({ ok: false })
    expect(body).not.toContain('127.0.0.1')
    expectProbeHeaders(res)
    for (const call of logged.mock.calls) expect(call.join(' ')).not.toContain(UNREACHABLE)
    expect(logged).toHaveBeenCalledWith('[health] database ping failed (ECONNREFUSED)')
  })

  it('needs no session', async () => {
    // Nothing mocked beyond the db-worker defaults (no cookies, no headers): public by design (M0-D11).
    const res = await GET()
    expect(res.status).toBe(200)
  })
})
