// M9 S2.5 (C52) — repo.assignments.listActiveForUserLive: live assignments of one user on live tasks of live,
// non-archived projects (golden).
import { and, eq } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import { seedGolden } from '../../../scripts/lib/fixtures'
import { goldenUser } from '../../../tests/authz/_support/golden'
import { db } from '../db/client'
import { projects, taskAssignments, tasks } from '../db/schema'
import { listActiveForUserLive } from './task-assignments'

const taskNamesOf = async (rows: { taskId: string }[]) => {
  const out: string[] = []
  for (const r of rows) out.push((await db.select().from(tasks).where(eq(tasks.id, r.taskId)))[0]!.name)
  return out.sort()
}

describe('listActiveForUserLive', () => {
  it('Ivy → 2 rows; archive CRM → 1; soft-delete UAT assignment → 0; a soft-deleted task is absent', async () => {
    await seedGolden(db)
    const ivy = await goldenUser('Ivy')
    const rows = await listActiveForUserLive(db, ivy.id)
    expect(await taskNamesOf(rows)).toEqual(['ตั้งค่า automation', 'ทำ UAT + คู่มือหน้าร้าน'].sort())
    for (const r of rows) expect(Object.keys(r).sort()).toEqual(['id', 'projectId', 'taskId', 'version'])
    await db.update(projects).set({ archivedAt: new Date() }).where(eq(projects.name, 'CRM Migration'))
    const one = await listActiveForUserLive(db, ivy.id)
    expect(await taskNamesOf(one)).toEqual(['ทำ UAT + คู่มือหน้าร้าน'])
    await db
      .update(taskAssignments)
      .set({ deletedAt: new Date() })
      .where(and(eq(taskAssignments.id, one[0]!.id)))
    expect(await listActiveForUserLive(db, ivy.id)).toEqual([])
    // soft-deleted task: Mint's Mobile task
    const mint = await goldenUser('Mint')
    await db.update(tasks).set({ deletedAt: new Date() }).where(eq(tasks.name, 'พัฒนา front-end'))
    expect(await taskNamesOf(await listActiveForUserLive(db, mint.id))).toEqual(['Rollout สาขา'])
  })
})
