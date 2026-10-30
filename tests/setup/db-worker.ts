import postgres from 'postgres'
import { afterAll, beforeEach, inject, vi } from 'vitest'
import { truncateAll } from '../helpers/db'

// Next APIs that throw outside a request (PLAN.md §4.2). M1 adds the `@/server/session` mock here.
vi.mock('next/cache', () => ({
  refresh: vi.fn(),
  updateTag: vi.fn(),
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
}))
vi.mock('next/headers', () => ({
  cookies: vi.fn(async () => ({ get: () => undefined })),
  headers: vi.fn(async () => new Headers()),
}))

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
})
afterAll(async () => {
  await sql.end()
})
