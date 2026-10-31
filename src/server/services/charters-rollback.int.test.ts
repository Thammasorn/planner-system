// M4 S1.9 — the charter shares createProject's transaction: a failing createCharter leaves nothing behind (X25).
import { count, eq } from 'drizzle-orm'
import { describe, expect, it, vi } from 'vitest'
import { createProject } from '../actions/projects'
import { asUser } from '../../../tests/helpers/as-user'
import { auditTotal } from '../../../tests/helpers/audit'
import { createWorld } from '../../../tests/helpers/world'
import { db } from '../db/client'
import { projectMembers, projects, taskStatuses } from '../db/schema'

vi.mock('@/server/services/charters', async (orig) => ({
  ...(await orig<typeof import('@/server/services/charters')>()),
  createCharter: vi.fn().mockRejectedValue(new Error('boom')),
}))

describe('createProject rollback', () => {
  it('createCharter throws → no project, status, LEAD or audit row', async () => {
    const w = await createWorld()
    asUser(w.manager)
    const auditsBefore = await auditTotal()
    const [{ n: projectsBefore }] = (await db.select({ n: count() }).from(projects)) as [{ n: number }]
    const res = await createProject({ name: 'จะล้มเหลว', leadUserId: w.lead.id })
    expect(res).toMatchObject({ ok: false, code: 'INTERNAL' })
    const [{ n: projectsAfter }] = (await db.select({ n: count() }).from(projects)) as [{ n: number }]
    expect(projectsAfter).toBe(projectsBefore)
    expect(await db.select().from(projects).where(eq(projects.name, 'จะล้มเหลว'))).toEqual([])
    const leads = await db.select().from(projectMembers).where(eq(projectMembers.userId, w.lead.id))
    expect(leads).toHaveLength(2) // P and A only (world)
    const [{ n: statuses }] = (await db.select({ n: count() }).from(taskStatuses)) as [{ n: number }]
    expect(statuses).toBe(0)
    expect(await auditTotal()).toBe(auditsBefore)
  })
})
