// M3 S2.10 → M9 S2.8 — /my buckets + sidebar count (FR-1009, X22, M9-D17, r8 §4.10) on the golden seed; today 2026-09-30.
import { and, eq, sql } from 'drizzle-orm'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ISODate } from '@/domain/types'
import type { MyBucketKey, MyTaskBucketsResponse } from '@/lib/contracts/tasks'
import { seedGolden } from '../../../scripts/lib/fixtures'
import { asUser } from '../../../tests/helpers/as-user'
import { makeAllocation, makeAssignment, makeTask } from '../../../tests/helpers/factories'
import { createWorld } from '../../../tests/helpers/world'
import { db } from '../db/client'
import { projects, taskAssignments, tasks, user } from '../db/schema'
import type { SessionUser } from '../session'
import { getSidebar } from './sidebar'
import { countMyOpenTasks, listMyTaskBuckets } from './my-tasks'

const TODAY: ISODate = '2026-09-30'

beforeEach(() => {
  vi.stubEnv('ALLOW_TEST_HOOKS', '1')
  vi.stubEnv('APP_NOW', '2026-09-30T10:00:00+07:00')
})

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

const bucket = (r: MyTaskBucketsResponse, key: MyBucketKey) => r.buckets.find((b) => b.key === key)!.tasks
const named = (r: MyTaskBucketsResponse, key: MyBucketKey) =>
  bucket(r, key).map((t) => [t.name, t.firstWeek, t.plannedCd])

describe('listMyTaskBuckets (golden F1, r8 §4.10)', () => {
  it('Cindy: THIS_WEEK POS 250, NEXT_WEEK CRM 250, count 1; 4 buckets always in key order', async () => {
    await seedGolden(db)
    const r = await listMyTaskBuckets(db, await golden('Cindy'), TODAY)
    expect(r.today).toBe(TODAY)
    expect(r.buckets.map((b) => b.key)).toEqual(['THIS_WEEK', 'NEXT_WEEK', 'LATER', 'UNPLANNED'])
    expect(named(r, 'THIS_WEEK')).toEqual([['ปรับปรุงระบบ POS หน้าร้าน', '2026-09-28', 250]])
    expect(named(r, 'NEXT_WEEK')).toEqual([['ย้ายข้อมูลลูกค้า', '2026-10-05', 250]])
    expect(bucket(r, 'LATER')).toEqual([])
    expect(bucket(r, 'UNPLANNED')).toEqual([])
    expect(r.count).toBe(1)
    expect(bucket(r, 'THIS_WEEK')[0]).toMatchObject({
      project: { name: 'POS Upgrade', certainty: 'CONFIRMED' },
      status: { name: 'ยังไม่เริ่ม', category: 'TODO' },
      hasBody: false,
    })
  })

  it('Ivy / Peter / Jack / Mint / Manager', async () => {
    await seedGolden(db)
    const ivy = await listMyTaskBuckets(db, await golden('Ivy'), TODAY)
    expect(named(ivy, 'THIS_WEEK')).toEqual([['ทำ UAT + คู่มือหน้าร้าน', '2026-09-28', 250]])
    expect(named(ivy, 'LATER')).toEqual([['ตั้งค่า automation', '2026-10-12', 250]])
    const peter = await listMyTaskBuckets(db, await golden('Peter'), TODAY)
    expect(named(peter, 'THIS_WEEK')).toEqual([['ย้าย pipeline ขึ้น BigQuery', '2026-09-28', 500]])
    expect(named(peter, 'LATER')).toEqual([['ทำ dashboard ผู้บริหาร', '2026-11-02', 250]])
    const jack = await listMyTaskBuckets(db, await golden('Jack'), TODAY)
    expect(named(jack, 'THIS_WEEK')).toEqual([['ออกแบบ flow ใหม่', '2026-09-28', 375]])
    expect(named(jack, 'LATER')).toEqual([['เก็บ requirement + สรุป', '2026-11-09', 250]])
    const mint = await listMyTaskBuckets(db, await golden('Mint'), TODAY)
    expect(named(mint, 'THIS_WEEK')).toEqual([['พัฒนา front-end', '2026-09-28', 250]])
    expect(named(mint, 'LATER')).toEqual([['Rollout สาขา', '2026-11-30', 250]])
    const manager = await listMyTaskBuckets(db, await golden('Manager'), TODAY)
    expect(manager.count).toBe(0)
    expect(manager.buckets.every((b) => b.tasks.length === 0)).toBe(true)
  })

  it('unplanned and past-only tasks → UNPLANNED; completing UAT → count 0; archived projects absent; sidebar = count', async () => {
    await seedGolden(db)
    const ivy = await golden('Ivy')
    const manager = await golden('Manager')
    const [pos] = await db.select().from(projects).where(eq(projects.name, 'POS Upgrade'))
    const fresh = await makeTask({ project: pos!, name: 'งานใหม่ยังไม่วางแผน', createdBy: manager })
    await makeAssignment({ task: fresh, user: ivy })
    const past = await makeTask({ project: pos!, name: 'งานในอดีต', createdBy: manager })
    const a = await makeAssignment({ task: past, user: ivy })
    await makeAllocation({ assignment: a, period: '2026-09-14', cd: 100 })
    let r = await listMyTaskBuckets(db, ivy, TODAY)
    expect(bucket(r, 'UNPLANNED').map((t) => [t.name, t.firstWeek, t.plannedCd])).toEqual([
      ['งานใหม่ยังไม่วางแผน', null, null],
      ['งานในอดีต', null, null],
    ])
    expect((await getSidebar(db, ivy, TODAY)).myTaskCount).toBe(1)
    expect(await countMyOpenTasks(db, ivy.id, TODAY)).toBe(r.count)

    const uat = await taskId('ทำ UAT + คู่มือหน้าร้าน')
    await db.execute(sql`update tasks set completed_on = '2026-09-30',
      status_id = (select id from task_statuses s where s.project_id = tasks.project_id and s.category = 'DONE' limit 1)
      where id = ${uat}`)
    r = await listMyTaskBuckets(db, ivy, TODAY)
    expect(r.count).toBe(0)
    expect(await countMyOpenTasks(db, ivy.id, TODAY)).toBe(0)

    await db.update(projects).set({ archivedAt: new Date() }).where(eq(projects.name, 'CRM Migration'))
    r = await listMyTaskBuckets(db, ivy, TODAY)
    expect(JSON.stringify(r)).not.toContain('ตั้งค่า automation')
  })

  it('statusesByProject carries only the listed projects (M6.1-D12 kept on the M9 shape)', async () => {
    await seedGolden(db)
    const r = await listMyTaskBuckets(db, await golden('Ivy'), TODAY)
    const listed = [...new Set(r.buckets.flatMap((b) => b.tasks.map((t) => t.project.id)))].sort()
    expect(Object.keys(r.statusesByProject).sort()).toEqual(listed)
  })
})

describe('M3 /my rules kept', () => {
  it('a soft-deleted assignment is excluded from the count and from /my (only CRM remains)', async () => {
    await seedGolden(db)
    const cindy = await golden('Cindy')
    const pos = await taskId('ปรับปรุงระบบ POS หน้าร้าน')
    await db
      .update(taskAssignments)
      .set({ deletedAt: new Date() })
      .where(and(eq(taskAssignments.taskId, pos), eq(taskAssignments.userId, cindy.id)))
    expect(await countMyOpenTasks(db, cindy.id, TODAY)).toBe(0)
    const all = (await listMyTaskBuckets(db, cindy, TODAY)).buckets.flatMap((b) => b.tasks.map((t) => t.name))
    expect(all).toEqual(['ย้ายข้อมูลลูกค้า'])
  })

  it('a parent task with an assignment is never listed', async () => {
    const w = await createWorld({ with: ['tasks'] })
    await db.insert(taskAssignments).values({ taskId: w.tasks.pParent.id, userId: w.member.id })
    const me = asUser(w.member)
    const r = await listMyTaskBuckets(db, me, TODAY)
    expect(r.buckets.flatMap((b) => b.tasks.map((t) => t.id))).toEqual([w.tasks.pChildA.id])
    expect(bucket(r, 'UNPLANNED').map((t) => t.id)).toEqual([w.tasks.pChildA.id])
    expect((await getSidebar(db, me, TODAY)).myTaskCount).toBe(0)
  })

  it('GET /api/tasks/my: 200 with the caller’s buckets', async () => {
    const w = await createWorld({ with: ['tasks'] })
    const { GET } = await import('../../app/api/tasks/my/route')
    asUser(w.lead)
    const res = await GET(new Request('http://x/api/tasks/my'), { params: Promise.resolve({}) })
    expect(res.status).toBe(200)
    const body = (await res.json()) as MyTaskBucketsResponse
    expect(body.buckets.map((b) => b.key)).toEqual(['THIS_WEEK', 'NEXT_WEEK', 'LATER', 'UNPLANNED'])
    expect(body.buckets.flatMap((b) => b.tasks)).toHaveLength(1)
    expect(body.count).toBe(0)
  })
})
