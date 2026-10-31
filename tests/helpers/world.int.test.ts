import { count, eq } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import { db } from '@/server/db/client'
import { projectMembers } from '@/server/db/schema'
import { createWorld, expandParts } from './world'

describe('world fixture (X91)', () => {
  it('expandParts([]) is empty; createWorld() gives 4 users with the roles of PLAN §4.3', async () => {
    expect(expandParts([]).size).toBe(0)
    expect([...expandParts(['tasks', 'tasks'])]).toEqual(['tasks'])
    const w = await createWorld()
    expect(w.manager.role).toBe('manager')
    expect([w.lead.role, w.member.role, w.outsider.role]).toEqual(['worker', 'worker', 'worker'])
    expect(new Set([w.manager.id, w.lead.id, w.member.id, w.outsider.id]).size).toBe(4)
    expect(w.manager.sessionToken).not.toBe('')
    expect(w.users).toEqual({})
  })

  it('M2: clients C1..C3 and projects P, Q, A with 5 memberships', async () => {
    const w = await createWorld()
    const [total] = await db.select({ n: count() }).from(projectMembers)
    expect(total?.n).toBe(5)
    const roles = async (projectId: string) =>
      (await db.select().from(projectMembers).where(eq(projectMembers.projectId, projectId)))
        .map((m) => `${m.userId}:${m.role}`)
        .sort()
    expect(await roles(w.P.id)).toEqual([`${w.lead.id}:LEAD`, `${w.member.id}:MEMBER`].sort())
    expect(await roles(w.Q.id)).toEqual([`${w.outsider.id}:MEMBER`])
    expect(await roles(w.A.id)).toEqual([`${w.lead.id}:LEAD`, `${w.member.id}:MEMBER`].sort())
    expect(w.A.archivedAt).not.toBeNull()
    expect(w.P.archivedAt).toBeNull()
    expect(w.C3.archivedAt).not.toBeNull()
    expect(w.P.clientId).toBe(w.C1.id)
    expect(w.Q.clientId).toBe(w.C2.id)
    expect(w.A.clientId).toBe(w.C1.id)
    expect(w.P.createdBy).toBe(w.manager.id)
    expect([w.P.name, w.Q.name, w.A.name]).toEqual(['World P', 'World Q', 'World A'])
  })

  it('parts without a builder throw', async () => {
    await expect(createWorld({ with: ['tasks'] })).rejects.toThrow('world part tasks has no builder yet')
  })
})
