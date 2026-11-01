// M3 S2.16 — /tasks reads (SPEC v3.1 FR-665, §7.8, X75, M3-D33/D34, AC-616) on the golden seed and the world.
import { eq, sql } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import { seedGolden } from '../../../scripts/lib/fixtures'
import { asUser, toSessionUser } from '../../../tests/helpers/as-user'
import { makeStatuses, makeTask } from '../../../tests/helpers/factories'
import { createWorld } from '../../../tests/helpers/world'
import { db } from '../db/client'
import { projects, user } from '../db/schema'
import type { SessionUser } from '../session'
import { listTeamTasks } from './teamTasks'

const Q0 = { blocked: false, includeDone: false } as const

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
const list = (u: SessionUser, q: Parameters<typeof listTeamTasks>[2] = Q0) =>
  db.transaction((tx) => listTeamTasks(tx, u, q))

describe('listTeamTasks (golden)', () => {
  it('AC-616: Peter sees exactly DW + Store tasks and nothing of POS / Mobile / CRM', async () => {
    await seedGolden(db)
    const r = await list(await golden('Peter'))
    expect(r.cards.map((c) => c.name).sort()).toEqual(
      ['ย้าย pipeline ขึ้น BigQuery', 'ทำ dashboard ผู้บริหาร', 'เก็บ requirement + สรุป'].sort(),
    )
    const body = JSON.stringify(r)
    for (const hidden of ['POS Upgrade', 'Mobile App Revamp', 'CRM Migration', 'ปรับปรุงระบบ POS หน้าร้าน', 'Rollout สาขา', 'ย้ายข้อมูลลูกค้า', 'พัฒนา front-end']) {
      expect(body).not.toContain(hidden)
    }
    expect(r.projects.map((p) => p.name).sort()).toEqual(['Data Warehouse', 'Store Analytics Dashboard'])
    expect(Object.keys(r.statusesByProject).sort()).toEqual(r.projects.map((p) => p.id).sort())
    expect(r.nextCursor).toBeNull()
  })

  it('manager → 10 cards; userId = Ivy → 2; DONE + includeDone → none until one completes; certainty BR-35', async () => {
    await seedGolden(db)
    const [mgr] = await db.select().from(user).where(eq(user.role, 'manager'))
    const m = await golden(mgr!.nickname!)
    expect((await list(m)).cards).toHaveLength(10)
    const ivy = await golden('Ivy')
    const ivyCards = (await list(m, { ...Q0, userId: ivy.id })).cards
    expect(ivyCards).toHaveLength(2)
    // FR-665 position filter: Ivy is the only QA → the same two cards; a soft-deleted assignment no longer matches
    const qa = { ...Q0, positionId: ivy.positionId! }
    expect((await list(m, qa)).cards.map((c) => c.id).sort()).toEqual(ivyCards.map((c) => c.id).sort())
    await db.execute(sql`update task_assignments set deleted_at = now(), deleted_batch = gen_random_uuid()
      where task_id = ${ivyCards[0]!.id} and user_id = ${ivy.id}`)
    expect((await list(m, qa)).cards.map((c) => c.id)).toEqual([ivyCards[1]!.id])
    await db.execute(sql`update task_assignments set deleted_at = null, deleted_batch = null
      where task_id = ${ivyCards[0]!.id} and user_id = ${ivy.id}`)
    expect((await list(m, { ...Q0, category: ['DONE'], includeDone: true })).cards).toEqual([])
    await db.execute(sql`update tasks set completed_on = '2026-09-30',
      status_id = (select id from task_statuses s where s.project_id = tasks.project_id and s.category = 'DONE' limit 1)
      where name = 'Rollout สาขา'`)
    const done = await list(m, { ...Q0, category: ['DONE'], includeDone: true })
    expect(done.cards.map((c) => [c.name, c.completed, c.certainty])).toEqual([['Rollout สาขา', true, 'TENTATIVE']])
    expect((await list(m)).cards).toHaveLength(9)
  })
})

describe('listTeamTasks (world)', () => {
  it('blocked=1 → only tasks with open blockers; projectId invisible → NOT_FOUND; archived project absent', async () => {
    const w = await createWorld({ with: ['tasks'] })
    const lead = toSessionUser(w.lead)
    expect((await list(lead, { ...Q0, blocked: true })).cards.map((c) => c.id)).toEqual([w.tasks.pLeaf.id])
    await expect(list(lead, { ...Q0, projectId: w.Q.id })).rejects.toMatchObject({ code: 'NOT_FOUND' })
    const all = await list(lead, { ...Q0, includeDone: true })
    expect(all.cards.map((c) => c.projectId)).not.toContain(w.A.id)
    expect(all.cards.find((c) => c.id === w.tasks.pChildA.id)).toMatchObject({
      parentPath: ['งานแม่ P-ลับ01'],
      assigneeIds: [w.member.id],
      status: { id: w.statuses.P.todo.id, category: 'TODO' },
      completed: false,
    })
    expect(Object.keys(all.cards[0]!).sort()).toEqual(
      // M6.1 adds hasBody (FR-691, M6.1-D11)
      ['assigneeIds', 'blockers', 'certainty', 'completed', 'dueDate', 'hasBody', 'id', 'name', 'parentPath', 'projectId', 'status'].sort(),
    )
    // outsider: Q only
    const out = await list(toSessionUser(w.outsider), { ...Q0, includeDone: true })
    expect(out.cards.map((c) => c.id)).toEqual([w.tasks.qTask.id])
    expect(JSON.stringify(out)).not.toContain('P-ลับ')
  })

  it('keyset pagination: 205 tasks → 200 + cursor, then 5; no duplicates; due asc nulls last', async () => {
    const w = await createWorld()
    await makeStatuses({ project: w.P })
    for (let i = 0; i < 205; i++) {
      await makeTask({
        project: w.P,
        name: `T${i}`,
        createdBy: w.manager,
        dueDate: i % 3 === 0 ? null : `2026-10-${String((i % 27) + 1).padStart(2, '0')}`,
      })
    }
    const m = toSessionUser(w.manager)
    const p1 = await list(m)
    expect(p1.cards).toHaveLength(200)
    expect(p1.nextCursor).not.toBeNull()
    const p2 = await list(m, { ...Q0, cursor: p1.nextCursor! })
    expect(p2.cards).toHaveLength(5)
    expect(p2.nextCursor).toBeNull()
    const ids = [...p1.cards, ...p2.cards].map((c) => c.id)
    expect(new Set(ids).size).toBe(205)
    const dues = [...p1.cards, ...p2.cards].map((c) => c.dueDate ?? '9999-12-31')
    expect([...dues].sort()).toEqual(dues)
    await expect(list(m, { ...Q0, cursor: 'garbage' })).rejects.toMatchObject({ code: 'VALIDATION' })
  })

  it('GET /api/tasks: repeated category, bad projectId → 400, invisible project → 404', async () => {
    const w = await createWorld({ with: ['tasks'] })
    const { GET } = await import('../../app/api/tasks/route')
    const call = (qs: string) => GET(new Request(`http://x/api/tasks?${qs}`), { params: Promise.resolve({}) })
    asUser(w.lead)
    const ok = await call('category=TODO&category=IN_PROGRESS')
    expect(ok.status).toBe(200)
    const body = (await ok.json()) as { cards: { status: { category: string } }[] }
    expect(new Set(body.cards.map((c) => c.status.category))).toEqual(new Set(['TODO', 'IN_PROGRESS']))
    expect((await call('projectId=x')).status).toBe(400)
    expect((await call(`projectId=${w.Q.id}`)).status).toBe(404)
    await db.update(projects).set({ archivedAt: null }).where(eq(projects.id, w.A.id))
    const withA = (await (await call('includeDone=1')).json()) as { cards: { projectId: string }[] }
    expect(withA.cards.some((c) => c.projectId === w.A.id)).toBe(true)
  })
})
