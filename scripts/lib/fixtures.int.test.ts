// M2 S1.7 — golden clients / projects / memberships (X11, M2-D12, BR-60 context, SEED-A1 part).
import { asc, count, eq, inArray } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import { db } from '@/server/db/client'
import { th } from '@/i18n/th'
import { auditLog, clients, projectMembers, projects, taskAssignments, taskStatuses, tasks, user } from '@/server/db/schema'
import { seedGolden } from './fixtures'

async function membership(): Promise<Record<string, Record<string, string>>> {
  const rows = await db
    .select({ project: projects.name, nickname: user.nickname, role: projectMembers.role })
    .from(projectMembers)
    .innerJoin(projects, eq(projects.id, projectMembers.projectId))
    .innerJoin(user, eq(user.id, projectMembers.userId))
  const out: Record<string, Record<string, string>> = {}
  for (const r of rows) (out[r.project] ??= {})[r.nickname ?? '?'] = r.role
  return out
}

describe('seedGolden — M2 stage', () => {
  it('4 clients, 5 projects, 10 memberships (5 LEAD) derived from task assignees; no M2 audit rows', async () => {
    await seedGolden(db)
    const cl = await db.select().from(clients).orderBy(asc(clients.createdAt), asc(clients.name))
    expect(cl.map((c) => c.name).sort()).toEqual(['Bluebird', 'Coral', 'Internal', 'Sunrise'])
    for (const c of cl) expect(c).toMatchObject({ code: null, color: null, note: null, archivedAt: null })
    const ps = await db.select().from(projects)
    expect(ps).toHaveLength(5)
    const [{ n } = { n: 0 }] = await db.select({ n: count() }).from(projectMembers)
    expect(n).toBe(10)
    const leads = await db.select().from(projectMembers).where(eq(projectMembers.role, 'LEAD'))
    expect(leads).toHaveLength(5)
    expect(await membership()).toEqual({
      'POS Upgrade': { Cindy: 'LEAD', Ivy: 'MEMBER', Mint: 'MEMBER' },
      'Data Warehouse': { Peter: 'LEAD' },
      'Mobile App Revamp': { Jack: 'LEAD', Mint: 'MEMBER' },
      'CRM Migration': { Cindy: 'LEAD', Ivy: 'MEMBER' },
      'Store Analytics Dashboard': { Peter: 'LEAD', Jack: 'MEMBER' },
    })
    const byName = new Map(ps.map((p) => [p.name, p]))
    expect(byName.get('CRM Migration')?.certainty).toBe('TENTATIVE')
    expect(byName.get('Store Analytics Dashboard')?.certainty).toBe('TENTATIVE')
    expect(byName.get('POS Upgrade')?.certainty).toBe('CONFIRMED')
    const clientName = new Map(cl.map((c) => [c.id, c.name]))
    expect(clientName.get(byName.get('Mobile App Revamp')!.clientId!)).toBe('Bluebird')
    expect(clientName.get(byName.get('Store Analytics Dashboard')!.clientId!)).toBe('Internal')
    const [manager] = await db.select({ id: user.id }).from(user).where(eq(user.role, 'manager'))
    for (const p of ps)
      expect(p).toMatchObject({ createdBy: manager!.id, color: '#2F5597', archivedAt: null })
    for (const m of await db.select().from(projectMembers)) expect(m.addedBy).toBe(manager!.id)
    const m2Audits = await db
      .select({ entity: auditLog.entity })
      .from(auditLog)
      .where(inArray(auditLog.entity, ['client', 'project', 'project_member']))
    expect(m2Audits).toEqual([])
  })

  it("upTo: 'users' stops before clients and projects", async () => {
    await seedGolden(db, { upTo: 'users' })
    expect(await db.select().from(clients)).toEqual([])
    expect(await db.select().from(projects)).toEqual([])
  })
})

describe('seedGolden — M3 stage (X11, X70, M3-D20)', () => {
  it('25 statuses (5 per project, FR-621 order), 10 tasks on ยังไม่เริ่ม, 10 assignments, one override; memberships unchanged', async () => {
    await seedGolden(db)
    const st = await db
      .select({ projectId: taskStatuses.projectId, name: taskStatuses.name, category: taskStatuses.category })
      .from(taskStatuses)
      .orderBy(asc(taskStatuses.projectId), asc(taskStatuses.position), asc(taskStatuses.id))
    expect(st).toHaveLength(25)
    const perProject = new Map<string, string[]>()
    for (const s of st) perProject.set(s.projectId, [...(perProject.get(s.projectId) ?? []), s.name])
    const D = th.tasks.status.defaults
    for (const names of perProject.values()) expect(names).toEqual([D.todo, D.doing, D.waitData, D.blocked, D.done])
    const ts = await db
      .select({ name: tasks.name, depth: tasks.depth, completedOn: tasks.completedOn, status: taskStatuses.name, o: tasks.certaintyOverride })
      .from(tasks)
      .innerJoin(taskStatuses, eq(taskStatuses.id, tasks.statusId))
    expect(ts).toHaveLength(10)
    for (const t of ts) expect(t).toMatchObject({ depth: 0, completedOn: null, status: D.todo })
    expect(ts.filter((t) => t.o !== null)).toEqual([expect.objectContaining({ name: 'Rollout สาขา', o: 'TENTATIVE' })])
    const [{ n } = { n: 0 }] = await db.select({ n: count() }).from(taskAssignments)
    expect(n).toBe(10)
    const [{ m } = { m: 0 }] = await db.select({ m: count() }).from(projectMembers)
    expect(m).toBe(10)
    const pos = await db
      .select({ name: tasks.name })
      .from(tasks)
      .innerJoin(projects, eq(projects.id, tasks.projectId))
      .where(eq(projects.name, 'POS Upgrade'))
      .orderBy(asc(tasks.position), asc(tasks.id))
    expect(pos.map((p) => p.name)).toEqual(['ปรับปรุงระบบ POS หน้าร้าน', 'ทำ UAT + คู่มือหน้าร้าน', 'Rollout สาขา'])
    const audits = await db
      .select({ entity: auditLog.entity })
      .from(auditLog)
      .where(inArray(auditLog.entity, ['task', 'task_assignment', 'task_status']))
    expect(audits).toEqual([])
  })

  it("upTo: 'projects' seeds the statuses but no tasks", async () => {
    await seedGolden(db, { upTo: 'projects' })
    expect(await db.select().from(tasks)).toEqual([])
    const [{ n } = { n: 0 }] = await db.select({ n: count() }).from(taskStatuses)
    expect(n).toBe(25)
  })
})
