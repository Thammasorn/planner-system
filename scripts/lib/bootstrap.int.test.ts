// M3 X70 — bootstrap backfills the 5 default task statuses of projects created before M3 (idempotent).
import { count, eq } from 'drizzle-orm'
import { describe, expect, it, vi } from 'vitest'
import { db } from '@/server/db/client'
import { taskStatuses } from '@/server/db/schema'
import { makeProject, makeStatuses, makeUser } from '../../tests/helpers/factories'
import { runBootstrap } from './bootstrap'

const log = { info: vi.fn(), warn: vi.fn(), error: vi.fn() }
const statusCount = async (projectId: string) =>
  Number((await db.select({ n: count() }).from(taskStatuses).where(eq(taskStatuses.projectId, projectId)))[0]?.n ?? 0)

describe('bootstrap — M3 status backfill (X70)', () => {
  it('a project without statuses gets 5; one with statuses is untouched; a second run backfills nothing', async () => {
    const manager = await makeUser({ role: 'manager' })
    const old = await makeProject({ name: 'Old', createdBy: manager })
    const fresh = await makeProject({ name: 'Fresh', createdBy: manager })
    await makeStatuses({ project: fresh })
    const first = await runBootstrap(db, { NODE_ENV: 'development' }, log)
    expect(first.backfilledStatusProjects).toBe(1)
    expect(await statusCount(old.id)).toBe(5)
    expect(await statusCount(fresh.id)).toBe(5)
    expect((await runBootstrap(db, { NODE_ENV: 'development' }, log)).backfilledStatusProjects).toBe(0)
  })
})
