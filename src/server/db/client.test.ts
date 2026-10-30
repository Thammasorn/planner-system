import { afterEach, describe, expect, it, vi } from 'vitest'
import { resetEnvCache } from '@/server/env'

afterEach(() => {
  resetEnvCache()
})

describe('db client (lazy)', () => {
  it('imports without DATABASE_URL', async () => {
    vi.stubEnv('DATABASE_URL', undefined)
    resetEnvCache()
    await expect(import('@/server/db/client')).resolves.toHaveProperty('getDb')
  })

  it('throws a clear error on first use without DATABASE_URL', async () => {
    vi.stubEnv('DATABASE_URL', undefined)
    resetEnvCache()
    const { closeDb, getDb } = await import('@/server/db/client')
    await closeDb() // no pool from an earlier test in this worker
    expect(() => getDb()).toThrow(/DATABASE_URL/)
  })
})
