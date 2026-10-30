import { eq } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import { makeUser } from '../../tests/helpers/factories'
import * as audit from './audit'
import { db } from './db/client'
import { auditLog } from './db/schema'

describe('audit.log (X44)', () => {
  it('T-AUD-01 writes one row with actor_id, entity, summary; actor=null → actor_id NULL', async () => {
    const u = await makeUser()
    await db.transaction((tx) =>
      audit.log(tx, u, {
        entity: 'position',
        entityId: 'p1',
        action: 'create',
        summary: 'created',
        after: { name: 'QA' },
      }),
    )
    await audit.log(db, null, { entity: 'user', entityId: u.id, action: 'update', summary: 'by script' })
    const rows = await db.select().from(auditLog).orderBy(auditLog.id)
    expect(rows).toHaveLength(2)
    expect(rows[0]).toMatchObject({
      actorId: u.id,
      entity: 'position',
      entityId: 'p1',
      action: 'create',
      projectId: null,
      summary: 'created',
      before: null,
      after: { name: 'QA' },
    })
    expect(rows[1]).toMatchObject({ actorId: null, entity: 'user', summary: 'by script' })
  })

  it("T-AUD-02 after: { password: 'x' } throws before inserting", async () => {
    await expect(
      audit.log(db, null, {
        entity: 'user',
        entityId: 'u',
        action: 'update',
        summary: 's',
        after: { password: 'x' },
      }),
    ).rejects.toThrow(/forbidden key/)
    await expect(
      audit.log(db, null, {
        entity: 'user',
        entityId: 'u',
        action: 'update',
        summary: 's',
        before: { nested: { Token: 't' } },
      }),
    ).rejects.toThrow(/forbidden key/)
    expect(await db.select().from(auditLog).where(eq(auditLog.entityId, 'u'))).toHaveLength(0)
  })
})
