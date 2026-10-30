import { readFileSync } from 'node:fs'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ENV_KEYS, getEnv, parseEnv, resetEnvCache } from '@/server/env'

const DEV_URL = 'postgres://planner:planner@localhost:54329/planner'

afterEach(() => {
  resetEnvCache()
})

describe('env', () => {
  it('applies defaults', () => {
    expect(parseEnv({ DATABASE_URL: DEV_URL })).toEqual({
      NODE_ENV: 'development',
      SECURE_COOKIES: false,
      DB_POOL_MAX: 10,
      DATABASE_URL: DEV_URL,
    })
  })

  it('parses booleans strictly', () => {
    expect(parseEnv({ DATABASE_URL: DEV_URL, SECURE_COOKIES: 'true' }).SECURE_COOKIES).toBe(true)
    expect(parseEnv({ DATABASE_URL: DEV_URL, SECURE_COOKIES: 'false' }).SECURE_COOKIES).toBe(false)
    expect(() => parseEnv({ DATABASE_URL: DEV_URL, SECURE_COOKIES: 'yes' })).toThrow(/SECURE_COOKIES/)
  })

  it('requires a postgres URL', () => {
    expect(() => parseEnv({})).toThrow(/DATABASE_URL/)
    expect(() => parseEnv({ DATABASE_URL: 'http://x' })).toThrow(/DATABASE_URL/)
    expect(parseEnv({ DATABASE_URL: 'postgresql://a@b/c' }).DATABASE_URL).toBe('postgresql://a@b/c')
  })

  it('bounds the pool', () => {
    expect(() => parseEnv({ DATABASE_URL: DEV_URL, DB_POOL_MAX: '0' })).toThrow(/DB_POOL_MAX/)
    expect(() => parseEnv({ DATABASE_URL: DEV_URL, DB_POOL_MAX: '51' })).toThrow(/DB_POOL_MAX/)
    expect(parseEnv({ DATABASE_URL: DEV_URL, DB_POOL_MAX: '20' }).DB_POOL_MAX).toBe(20)
  })

  it('never echoes values', () => {
    let message = ''
    try {
      parseEnv({ DATABASE_URL: 'http://secret-pw@x' })
    } catch (error: unknown) {
      message = error instanceof Error ? error.message : String(error)
    }
    expect(message).toMatch(/DATABASE_URL/)
    expect(message).not.toContain('secret-pw')
  })

  it('is lazy and cached', () => {
    resetEnvCache()
    vi.stubEnv('DATABASE_URL', DEV_URL)
    const first = getEnv()
    expect(getEnv()).toBe(first)
    expect(first.DATABASE_URL).toBe(DEV_URL)

    vi.stubEnv('DATABASE_URL', 'postgres://other@localhost:5432/other')
    expect(getEnv()).toBe(first) // cached: env changes are not seen until reset
    resetEnvCache()
    const second = getEnv()
    expect(second).not.toBe(first)
    expect(second.DATABASE_URL).toBe('postgres://other@localhost:5432/other')
  })

  it('.env.example documents every key', () => {
    const text = readFileSync(path.resolve(process.cwd(), '.env.example'), 'utf8')
    const documented = new Set([...text.matchAll(/^#?\s*([A-Z][A-Z0-9_]*)=/gm)].map((m) => m[1]))
    // NODE_ENV is set by Next/Node itself (dev → development, next start → production), never by the operator.
    const operatorKeys = ENV_KEYS.filter((key) => key !== 'NODE_ENV')
    for (const key of operatorKeys) expect(documented, key).toContain(key)
  })
})
