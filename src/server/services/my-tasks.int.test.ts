// M3 S2.10 — /my basic + sidebar count (FR-1009 basic, X22, M3-D8) on the golden seed.
import { and, eq, sql } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import { seedGolden } from '../../../scripts/lib/fixtures'
import { asUser } from '../../../tests/helpers/as-user'
import { makeTask } from '../../../tests/helpers/factories'
import { createWorld } from '../../../tests/helpers/world'
import { db } from '../db/client'
import { projects, taskAssignments, tasks, user } from '../db/schema'
import type { SessionUser } from '../session'
import { getSidebar } from './sidebar'
import { countMyOpenTasks, listMyTasks } from './my-tasks'

async function golden(nickname: string): Promise<SessionUser> {
  const [u] = await db.select().from(user).where(eq(user.nickname, nickname))
  return {
    id: u!.id,
    email: u!.email,
    name: u!.name,
    nickname: u!.nickname,
    role: u!.role === 'manager' ? 'manager' : 'worker',
    positionId: u!.positionId,
    color: u!.color,
    mustChangePassword: false,
    sessionId: 's',
    sessionToken: 't',
  }
}
const taskId = async (name: string) => (await db.select().from(tasks).where(eq(tasks.name, name)))[0]!.id

describe('listMyTasks', () => {
  it('Ivy: 2 groups in collator order, 1 task each, count 2, status carried; Manager: 0', async () => {
    await seedGolden(db)
    const ivy = await golden('Ivy')
    const r = await listMyTasks(db, ivy)
    expect(r.count).toBe(2)
    expect(r.groups.map((g) => g.project.name)).toEqual(['CRM Migration', 'POS Upgrade'])
    expect(r.groups.map((g) => g.tasks.map((t) => t.name))).toEqual([['ตั้งค่า automation'], ['ทำ UAT + คู่มือหน้าร้าน']])
    expect(r.groups[0]!.tasks[0]!.status).toMatchObject({ name: 'ยังไม่เริ่ม', category: 'TODO' })
    expect((await listMyTasks(db, await golden('Cindy'))).count).toBe(2)
    const manager = (await db.select().from(user).where(eq(user.role, 'manager')))[0]!
    expect(await countMyOpenTasks(db, manager.id)).toBe(0)
  })

  it('completing Ivy’s POS task → 1; archiving CRM drops that group; a soft-deleted assignment is excluded; parents never listed', async () => {
    await seedGolden(db)
    const ivy = await golden('Ivy')
    const uat = await taskId('ทำ UAT + คู่มือหน้าร้าน')
    await db.execute(sql`update tasks set completed_on = '2026-09-30',
      status_id = (select id from task_statuses s where s.project_id = tasks.project_id and s.category = 'DONE' limit 1)
      where id = ${uat}`)
    expect(await countMyOpenTasks(db, ivy.id)).toBe(1)
    await db.update(projects).set({ archivedAt: new Date() }).where(eq(projects.name, 'CRM Migration'))
    expect((await listMyTasks(db, ivy)).groups).toEqual([])
    // soft-deleted assignment
    const cindy = await golden('Cindy')
    const pos = await taskId('ปรับปรุงระบบ POS หน้าร้าน')
    await db
      .update(taskAssignments)
      .set({ deletedAt: new Date() })
      .where(and(eq(taskAssignments.taskId, pos), eq(taskAssignments.userId, cindy.id)))
    expect(await countMyOpenTasks(db, cindy.id)).toBe(0)
  })

  it('a parent task with an assignment is never listed; sidebar myTaskCount = count', async () => {
    const w = await createWorld({ with: ['tasks'] })
    // give the member a (normally impossible) assignment on a parent: the query must still skip it
    await db.insert(taskAssignments).values({ taskId: w.tasks.pParent.id, userId: w.member.id })
    const me = asUser(w.member)
    const r = await listMyTasks(db, me)
    expect(r.groups.flatMap((g) => g.tasks.map((t) => t.id))).toEqual([w.tasks.pChildA.id])
    expect((await getSidebar(db, me, '2026-09-30')).myTaskCount).toBe(1)
    await makeTask({ project: w.P, parent: w.tasks.pChildA, name: 'grandchild', createdBy: w.manager })
    expect(await countMyOpenTasks(db, w.member.id)).toBe(0)
  })

  it('GET /api/tasks/my: 200 with the caller’s rows', async () => {
    const w = await createWorld({ with: ['tasks'] })
    const { GET } = await import('../../app/api/tasks/my/route')
    asUser(w.lead)
    const res = await GET(new Request('http://x/api/tasks/my'), { params: Promise.resolve({}) })
    expect(res.status).toBe(200)
    const body = (await res.json()) as { count: number }
    expect(body.count).toBe(1)
  })
})
