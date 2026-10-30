import { readFileSync } from 'node:fs'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { csv, ENV_KEYS, getEnv, parseEnv, resetEnvCache } from '@/server/env'

const DEV_URL = 'postgres://planner:planner@localhost:54329/planner'
const SECRET = 'x'.repeat(32)
/** Minimal valid environment (M1: auth keys are required). */
const BASE = { DATABASE_URL: DEV_URL, BETTER_AUTH_SECRET: SECRET, BETTER_AUTH_URL: 'http://localhost:3000' }

afterEach(() => {
  resetEnvCache()
})

describe('env', () => {
  it('applies defaults', () => {
    expect(parseEnv(BASE)).toEqual({
      ...BASE,
      NODE_ENV: 'development',
      SECURE_COOKIES: false,
      DB_POOL_MAX: 10,
      TRUSTED_ORIGINS: '',
      TRUSTED_PROXIES: '',
    })
  })

  it('parses booleans strictly', () => {
    expect(parseEnv({ ...BASE, SECURE_COOKIES: 'true' }).SECURE_COOKIES).toBe(true)
    expect(parseEnv({ ...BASE, SECURE_COOKIES: 'false' }).SECURE_COOKIES).toBe(false)
    expect(() => parseEnv({ ...BASE, SECURE_COOKIES: 'yes' })).toThrow(/SECURE_COOKIES/)
  })

  it('requires a postgres URL', () => {
    expect(() => parseEnv({ ...BASE, DATABASE_URL: undefined })).toThrow(/DATABASE_URL/)
    expect(() => parseEnv({ ...BASE, DATABASE_URL: 'http://x' })).toThrow(/DATABASE_URL/)
    expect(parseEnv({ ...BASE, DATABASE_URL: 'postgresql://a@b/c' }).DATABASE_URL).toBe('postgresql://a@b/c')
  })

  it('bounds the pool', () => {
    expect(() => parseEnv({ ...BASE, DB_POOL_MAX: '0' })).toThrow(/DB_POOL_MAX/)
    expect(() => parseEnv({ ...BASE, DB_POOL_MAX: '51' })).toThrow(/DB_POOL_MAX/)
    expect(parseEnv({ ...BASE, DB_POOL_MAX: '20' }).DB_POOL_MAX).toBe(20)
  })

  it('never echoes values', () => {
    let message = ''
    try {
      parseEnv({ ...BASE, DATABASE_URL: 'http://secret-pw@x' })
    } catch (error: unknown) {
      message = error instanceof Error ? error.message : String(error)
    }
    expect(message).toMatch(/DATABASE_URL/)
    expect(message).not.toContain('secret-pw')
  })

  it('is lazy and cached', () => {
    resetEnvCache()
    vi.stubEnv('DATABASE_URL', DEV_URL)
    vi.stubEnv('BETTER_AUTH_SECRET', SECRET)
    vi.stubEnv('BETTER_AUTH_URL', 'http://localhost:3000')
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

  it("T-ENV-01 rejects a 31-char secret, accepts 32; SECURE_COOKIES defaults to 'false'; csv(' a, ,b ')=['a','b']", () => {
    expect(() => parseEnv({ ...BASE, BETTER_AUTH_SECRET: 'x'.repeat(31) })).toThrow(/BETTER_AUTH_SECRET/)
    expect(parseEnv({ ...BASE, BETTER_AUTH_SECRET: 'x'.repeat(32) }).BETTER_AUTH_SECRET).toHaveLength(32)
    expect(() => parseEnv({ ...BASE, BETTER_AUTH_URL: 'not a url' })).toThrow(/BETTER_AUTH_URL/)
    // Not required by getEnv() (DB client + proxy CSP); empty `KEY=` lines count as unset.
    expect(
      parseEnv({ DATABASE_URL: DEV_URL, BETTER_AUTH_SECRET: '', BETTER_AUTH_URL: '' }),
    ).not.toHaveProperty('BETTER_AUTH_SECRET')
    // M0 transforms SECURE_COOKIES to a boolean (consumed by src/proxy.ts); the default is the string 'false' → false.
    expect(parseEnv(BASE).SECURE_COOKIES).toBe(false)
    expect(csv(' a, ,b ')).toEqual(['a', 'b'])
    expect(csv(undefined)).toEqual([])
    expect(csv('')).toEqual([])
  })

  it('validates the test hooks strictly', () => {
    expect(parseEnv({ ...BASE, ALLOW_TEST_HOOKS: '1', APP_NOW: '2026-09-30T10:00:00+07:00' })).toMatchObject({
      ALLOW_TEST_HOOKS: '1',
      APP_NOW: '2026-09-30T10:00:00+07:00',
    })
    expect(() => parseEnv({ ...BASE, ALLOW_TEST_HOOKS: 'yes' })).toThrow(/ALLOW_TEST_HOOKS/)
    expect(() => parseEnv({ ...BASE, APP_NOW: '2026-09-30' })).toThrow(/APP_NOW/)
  })

  it('.env.example documents every key', () => {
    const text = readFileSync(path.resolve(process.cwd(), '.env.example'), 'utf8')
    const documented = new Set([...text.matchAll(/^#?\s*([A-Z][A-Z0-9_]*)=/gm)].map((m) => m[1]))
    // NODE_ENV is set by Next/Node itself (dev → development, next start → production), never by the operator.
    const operatorKeys = ENV_KEYS.filter((key) => key !== 'NODE_ENV')
    for (const key of operatorKeys) expect(documented, key).toContain(key)
  })
})
