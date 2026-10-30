import postgres from 'postgres'
import { afterAll, beforeEach, inject, vi } from 'vitest'
import { asNobody } from '../helpers/as-user'
import { truncateAll } from '../helpers/db'
import { resetTestRequest, testCache } from '../helpers/request'

// Auth env for src/server/auth.ts (read at its import) and getEnv(). Test-only values; never used outside Vitest.
process.env.BETTER_AUTH_SECRET ??= 'test-secret-0123456789abcdef0123456789'
process.env.BETTER_AUTH_URL ??= 'http://localhost:3100'
process.env.SECURE_COOKIES ??= 'false'

// Next APIs that throw outside a request (PLAN.md §4.2). Mocks are plain functions, never vi.fn implementations
// that `restoreMocks` could reset (R-M1-12). Factories import helpers lazily (vi.mock is hoisted).
vi.mock('next/cache', async () => (await import('../helpers/request')).testCache)
vi.mock('next/headers', async () => {
  const req = await import('../helpers/request')
  return {
    headers: async () => req.currentTestHeaders(),
    cookies: async () => req.testCookieJar(),
  }
})
// The session comes from asUser()/asNobody() (tests/helpers/as-user.ts); everything else in the module is real.
vi.mock('@/server/session', async (importOriginal) => {
  const orig = await importOriginal<typeof import('@/server/session')>()
  const { currentTestUser } = await import('../helpers/as-user')
  return {
    ...orig,
    getSessionUser: async () => currentTestUser(),
    requirePageUser: async (o?: { allowMustChange?: boolean }) => {
      const u = currentTestUser()
      if (!u) throw new Error('TEST_REDIRECT:/login')
      if (u.mustChangePassword && !o?.allowMustChange) throw new Error('TEST_REDIRECT:/account/password')
      return u
    },
    requireManagerPage: async () => {
      const u = currentTestUser()
      if (!u) throw new Error('TEST_REDIRECT:/login')
      if (u.mustChangePassword) throw new Error('TEST_REDIRECT:/account/password')
      if (u.role !== 'manager') throw new Error('TEST_NOT_FOUND')
      return u
    },
  }
})

const adminUrl = inject('adminUrl')
const dbName = `planner_t_${inject('runId')}_w${process.env.VITEST_POOL_ID ?? '1'}`
const admin = postgres(adminUrl, { max: 1, onnotice: () => {} })
await admin.unsafe(`drop database if exists ${dbName} with (force)`)
await admin.unsafe(`create database ${dbName} template ${inject('templateDb')}`)
await admin.end()
const workerUrl = adminUrl.replace(/\/[^/?]+(\?|$)/, `/${dbName}$1`)
process.env.DATABASE_URL = workerUrl // read lazily by src/server/env.ts on first use

const sql = postgres(workerUrl, { max: 1, onnotice: () => {} })
beforeEach(async () => {
  await truncateAll(sql)
  asNobody()
  resetTestRequest()
  testCache.refresh.mockClear()
  testCache.updateTag.mockClear()
  testCache.revalidatePath.mockClear()
  testCache.revalidateTag.mockClear()
})
afterAll(async () => {
  await sql.end()
})
