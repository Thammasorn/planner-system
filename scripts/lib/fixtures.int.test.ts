// M2 S1.7 — golden clients / projects / memberships (X11, M2-D12, BR-60 context, SEED-A1 part).
import { asc, count, eq, inArray } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import { db } from '@/server/db/client'
import { th } from '@/i18n/th'
import { displayName } from '@/lib/display-name'
import {
  auditLog,
  clients,
  holidays,
  leaveTypes,
  pages,
  projectMembers,
  projects,
  taskAssignments,
  taskStatuses,
  tasks,
  timeOff,
  user,
} from '@/server/db/schema'
import { applyFixture, loadGolden, parseFixtureArg, seedGolden } from './fixtures'

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
    for (const names of perProject.values())
      expect(names).toEqual([D.todo, D.doing, D.waitData, D.blocked, D.done])
    const ts = await db
      .select({
        name: tasks.name,
        depth: tasks.depth,
        completedOn: tasks.completedOn,
        status: taskStatuses.name,
        o: tasks.certaintyOverride,
      })
      .from(tasks)
      .innerJoin(taskStatuses, eq(taskStatuses.id, tasks.statusId))
    expect(ts).toHaveLength(10)
    for (const t of ts) expect(t).toMatchObject({ depth: 0, completedOn: null, status: D.todo })
    expect(ts.filter((t) => t.o !== null)).toEqual([
      expect.objectContaining({ name: 'Rollout สาขา', o: 'TENTATIVE' }),
    ])
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
    expect(pos.map((p) => p.name)).toEqual([
      'ปรับปรุงระบบ POS หน้าร้าน',
      'ทำ UAT + คู่มือหน้าร้าน',
      'Rollout สาขา',
    ])
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

describe('seedGolden — M4 stage (X11, X25, FR-402)', () => {
  it('5 charters, one per golden project, each first in its project root order; actor-null page audit rows', async () => {
    await seedGolden(db)
    const ps = await db.select({ id: projects.id, name: projects.name }).from(projects)
    expect(ps).toHaveLength(5)
    const charters = await db.select().from(pages).where(eq(pages.isCharter, true))
    expect(charters).toHaveLength(5)
    expect(new Set(charters.map((c) => c.projectId))).toEqual(new Set(ps.map((p) => p.id)))
    for (const p of ps) {
      const roots = await db
        .select({ isCharter: pages.isCharter, title: pages.title })
        .from(pages)
        .where(eq(pages.projectId, p.id))
        .orderBy(asc(pages.position), asc(pages.id))
      expect(roots[0]).toEqual({ isCharter: true, title: th.pages.charterTitle })
    }
    // The backfill path (ensureProjectCharters, M4-D6) pre-fills every charter with its own client, LEAD display
    // name and certainty — checked per project by containment (M4-D37c), expectations taken from the golden JSON.
    const golden = loadGolden()
    const expected = golden.projects.map((gp) => {
      const lead = golden.users.find((u) => u.nickname === gp.lead)!
      return { name: gp.name, client: gp.client!, lead: displayName(lead), certainty: gp.certainty }
    })
    expect(expected.map((e) => e.client)).toEqual(['Coral', 'Coral', 'Bluebird', 'Sunrise', 'Internal'])
    for (const e of expected) {
      const projectId = ps.find((p) => p.name === e.name)!.id
      const charter = charters.find((c) => c.projectId === projectId)!
      expect(charter.contentText, e.name).toContain(e.client)
      expect(charter.contentText, e.name).toContain(e.lead)
      expect(charter.contentText, e.name).toContain(th.projects.certainty[e.certainty])
    }
    const audits = await db
      .select({ actorId: auditLog.actorId })
      .from(auditLog)
      .where(eq(auditLog.entity, 'page'))
    expect(audits).toHaveLength(5)
    for (const a of audits) expect(a.actorId).toBeNull()
  })

  it("upTo: 'tasks' seeds no pages", async () => {
    await seedGolden(db, { upTo: 'tasks' })
    expect(await db.select().from(pages)).toEqual([])
  })
})

describe('M5 — seedGolden leave types + applyFixture F2/F3/F4 (X11, M5-D12; plan/m05 S2.10)', () => {
  const leaveRows = () =>
    db
      .select({
        nickname: user.nickname,
        startDate: timeOff.startDate,
        endDate: timeOff.endDate,
        half: timeOff.half,
        type: leaveTypes.name,
        createdBy: timeOff.createdBy,
        userId: timeOff.userId,
      })
      .from(timeOff)
      .innerJoin(user, eq(user.id, timeOff.userId))
      .innerJoin(leaveTypes, eq(leaveTypes.id, timeOff.leaveTypeId))

  it('seedGolden → the 4 default leave types in th order; no holiday and no leave (F1)', async () => {
    await seedGolden(db)
    const types = await db.select().from(leaveTypes).orderBy(asc(leaveTypes.position), asc(leaveTypes.id))
    expect(types.map((t) => t.name)).toEqual(th.leaveTypes.defaults.map((d) => d.name))
    expect(await db.select().from(holidays)).toEqual([])
    expect(await db.select().from(timeOff)).toEqual([])
  })

  it("applyFixture('F2') → the 2026-10-23 holiday only", async () => {
    await seedGolden(db)
    await applyFixture(db, 'F2')
    expect((await db.select().from(holidays)).map((h) => [h.date, h.name])).toEqual([
      ['2026-10-23', 'วันหยุดสมมติสำหรับทดสอบ'],
    ])
    expect(await db.select().from(timeOff)).toEqual([])
  })

  it("applyFixture('F3') → Peter 2026-10-05..06 ลาพักร้อน, self-recorded; no holiday (not cumulative)", async () => {
    await seedGolden(db)
    await applyFixture(db, 'F3')
    const rows = await leaveRows()
    expect(rows.map(({ createdBy: _c, userId: _u, ...r }) => r)).toEqual([
      { nickname: 'Peter', startDate: '2026-10-05', endDate: '2026-10-06', half: null, type: 'ลาพักร้อน' },
    ])
    expect(rows[0]!.createdBy).toBe(rows[0]!.userId)
    expect(await db.select().from(holidays)).toEqual([])
    const audits = await db.select().from(auditLog).where(eq(auditLog.entity, 'time_off'))
    expect(audits.map((a) => a.actorId)).toEqual([null])
  })

  it("applyFixture('F4') → Cindy 2026-10-12..14 ลาพักร้อน", async () => {
    await seedGolden(db)
    await applyFixture(db, 'F4')
    expect((await leaveRows()).map((r) => [r.nickname, r.startDate, r.endDate, r.type])).toEqual([
      ['Cindy', '2026-10-12', '2026-10-14', 'ลาพักร้อน'],
    ])
  })

  it('parseFixtureArg: --fixture=F3 · --fixture F4 · absent → null · unknown → throws', () => {
    expect(parseFixtureArg(['--fixture=F3'])).toBe('F3')
    expect(parseFixtureArg(['x', '--fixture', 'F4'])).toBe('F4')
    expect(parseFixtureArg([])).toBeNull()
    expect(() => parseFixtureArg(['--fixture=F9'])).toThrow()
    expect(() => parseFixtureArg(['--fixture'])).toThrow()
  })
})
