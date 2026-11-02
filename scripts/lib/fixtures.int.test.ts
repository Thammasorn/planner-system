// M2 S1.7 — golden clients / projects / memberships (X11, M2-D12, BR-60 context, SEED-A1 part).
import { and, asc, count, eq, gte, inArray, lt, sql } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import { db } from '@/server/db/client'
import { th } from '@/i18n/th'
import { displayName } from '@/lib/display-name'
import {
  allocations,
  auditLog,
  clients,
  holidays,
  leaveTypes,
  milestones,
  pages,
  projectMembers,
  projects,
  taskAssignments,
  positions,
  taskStatuses,
  tasks,
  timeOff,
  user,
  workSchedules,
} from '@/server/db/schema'
import {
  addDayExample,
  addMilestones,
  addSyntheticGridProject,
  addSyntheticWorkload,
  applyFixture,
  DAY_EXAMPLE,
  DEMO_MILESTONES,
  loadGolden,
  parseFixtureArg,
  seedGolden,
} from './fixtures'

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

describe('M6 — seedGolden allocations + addSyntheticGridProject (X11, X92, M6-D22/D23; plan/m06 S0.10)', () => {
  /** Bounded like every allocations query (SPEC §6.5): the golden window [2026-08-31, 2027-01-04) and beyond. */
  const inRange = and(gte(allocations.weekStart, '2026-01-05'), lt(allocations.weekStart, '2028-01-03'))

  it('57 WEEK rows, Σ person_days = 195.00; Rollout สาขา 11-30 … 12-28; 10 actor-null allocation audit rows', async () => {
    await seedGolden(db)
    const rows = await db.select().from(allocations).where(inRange)
    expect(rows).toHaveLength(57)
    expect(rows.every((r) => r.granularity === 'WEEK' && r.periodStart === r.weekStart)).toBe(true)
    const [sum] = await db
      .select({ total: sql<string>`sum(${allocations.personDays})::text` })
      .from(allocations)
      .where(inRange)
    expect(sum?.total).toBe('195.00')
    const rollout = await db
      .select({ week: allocations.weekStart, pd: allocations.personDays })
      .from(allocations)
      .innerJoin(taskAssignments, eq(taskAssignments.id, allocations.taskAssignmentId))
      .innerJoin(tasks, eq(tasks.id, taskAssignments.taskId))
      .where(and(eq(tasks.name, 'Rollout สาขา'), inRange))
      .orderBy(asc(allocations.weekStart))
    expect(rollout).toEqual([
      { week: '2026-11-30', pd: '2.50' },
      { week: '2026-12-07', pd: '3.75' },
      { week: '2026-12-14', pd: '5.00' },
      { week: '2026-12-21', pd: '5.00' },
      { week: '2026-12-28', pd: '2.50' },
    ])
    const audits = await db.select().from(auditLog).where(eq(auditLog.entity, 'allocation'))
    expect(audits).toHaveLength(10)
    const assignmentIds = (await db.select({ id: taskAssignments.id }).from(taskAssignments)).map((a) => a.id)
    expect(audits.map((a) => a.entityId).sort()).toEqual([...assignmentIds].sort())
    for (const a of audits) {
      expect(a.actorId).toBeNull()
      expect(a.projectId).not.toBeNull()
    }
    const rolloutAudit = audits.find((a) => a.summary === th.audit.allocationsSeeded(5))
    expect(rolloutAudit).toBeDefined()
  })

  it("upTo: 'pages' seeds no allocations and no allocation audit rows", async () => {
    await seedGolden(db, { upTo: 'pages' })
    expect(await db.select().from(allocations).where(inRange)).toEqual([])
    expect(await db.select().from(auditLog).where(eq(auditLog.entity, 'allocation'))).toEqual([])
  })

  it('addSyntheticGridProject 200 × 16 → 220 tasks, 200 assignments, 3 200 WEEK rows of 1.00; audit_log unchanged', async () => {
    await seedGolden(db)
    const [before] = await db.select({ n: count() }).from(auditLog)
    const { projectId } = await addSyntheticGridProject(db, { tasks: 200, weeks: 16, from: '2026-09-28' })
    const [after] = await db.select({ n: count() }).from(auditLog)
    expect(after?.n).toBe(before?.n)
    const [p] = await db.select().from(projects).where(eq(projects.id, projectId))
    expect(p).toMatchObject({ name: 'Perf grid', clientId: null, archivedAt: null })
    const ts = await db.select().from(tasks).where(eq(tasks.projectId, projectId))
    expect(ts).toHaveLength(220)
    expect(ts.filter((t) => t.depth === 0 && t.parentId === null)).toHaveLength(20)
    expect(ts.filter((t) => t.depth === 1 && t.parentId !== null)).toHaveLength(200)
    const as = await db
      .select({ id: taskAssignments.id, nickname: user.nickname })
      .from(taskAssignments)
      .innerJoin(tasks, eq(tasks.id, taskAssignments.taskId))
      .innerJoin(user, eq(user.id, taskAssignments.userId))
      .where(eq(tasks.projectId, projectId))
    expect(as).toHaveLength(200)
    expect(new Set(as.map((a) => a.nickname))).toEqual(new Set(['Cindy', 'Ivy', 'Mint']))
    const rows = await db
      .select({
        granularity: allocations.granularity,
        pd: allocations.personDays,
        week: allocations.weekStart,
      })
      .from(allocations)
      .where(
        and(
          inArray(
            allocations.taskAssignmentId,
            as.map((a) => a.id),
          ),
          gte(allocations.weekStart, '2026-09-28'),
          lt(allocations.weekStart, '2027-01-18'),
        ),
      )
    expect(rows).toHaveLength(3200)
    expect(rows.every((r) => r.granularity === 'WEEK' && r.pd === '1.00')).toBe(true)
    expect(new Set(rows.map((r) => r.week)).size).toBe(16)
    expect(await membership()).toMatchObject({ 'Perf grid': { Cindy: 'LEAD', Ivy: 'MEMBER', Mint: 'MEMBER' } })
  })
})

describe('M7 — addDayExample (SPEC A.2, M7-D16; plan/m07 S0.7)', () => {
  /** The golden window [2026-08-31, 2027-01-04) (r8 §6.10), bounded like every allocations query. */
  const win = and(gte(allocations.weekStart, '2026-08-31'), lt(allocations.weekStart, '2027-01-04'))
  const cdOf = (pd: string | null | undefined): number => Math.round(Number(pd ?? '0') * 100)

  async function totals(where = win) {
    const committed = sql<string>`coalesce(sum(${allocations.personDays}) filter (where coalesce(${tasks.certaintyOverride}, ${projects.certainty}) = 'CONFIRMED'), 0)::text`
    const [r] = await db
      .select({ total: sql<string>`coalesce(sum(${allocations.personDays}), 0)::text`, committed })
      .from(allocations)
      .innerJoin(taskAssignments, eq(taskAssignments.id, allocations.taskAssignmentId))
      .innerJoin(tasks, eq(tasks.id, taskAssignments.taskId))
      .innerJoin(projects, eq(projects.id, tasks.projectId))
      .where(where)
    return { total: cdOf(r?.total), committed: cdOf(r?.committed) }
  }

  async function weekOf(nickname: string, week: string): Promise<number> {
    const [r] = await db
      .select({ total: sql<string>`coalesce(sum(${allocations.personDays}), 0)::text` })
      .from(allocations)
      .innerJoin(taskAssignments, eq(taskAssignments.id, allocations.taskAssignmentId))
      .innerJoin(user, eq(user.id, taskAssignments.userId))
      .where(and(eq(user.nickname, nickname), eq(allocations.weekStart, week)))
    return cdOf(r?.total)
  }

  it('Mobile gets "Kickoff workshop" last, 2 assignments and exactly 2 DAY rows of 0.50 on 2026-09-07', async () => {
    await seedGolden(db)
    const { taskId, assignmentIds } = await addDayExample(db)
    const [mobile] = await db.select().from(projects).where(eq(projects.name, DAY_EXAMPLE.project))
    const roots = await db
      .select({ id: tasks.id, name: tasks.name, depth: tasks.depth, override: tasks.certaintyOverride })
      .from(tasks)
      .where(
        and(eq(tasks.projectId, mobile!.id), sql`${tasks.parentId} is null`, sql`${tasks.deletedAt} is null`),
      )
      .orderBy(sql`${tasks.position} collate "C"`, asc(tasks.id))
    expect(roots).toHaveLength(3)
    expect(roots.at(-1)).toEqual({ id: taskId, name: 'Kickoff workshop', depth: 0, override: null })
    const as = await db
      .select({ id: taskAssignments.id, nickname: user.nickname, version: taskAssignments.version })
      .from(taskAssignments)
      .innerJoin(user, eq(user.id, taskAssignments.userId))
      .where(and(eq(taskAssignments.taskId, taskId), sql`${taskAssignments.deletedAt} is null`))
    expect(as.map((a) => a.nickname).sort()).toEqual(['Jack', 'Mint'])
    expect(as.every((a) => a.version === 1)).toBe(true)
    expect(new Set(as.map((a) => a.id))).toEqual(new Set([assignmentIds.Jack, assignmentIds.Mint]))
    const rows = await db
      .select({
        granularity: allocations.granularity,
        period: allocations.periodStart,
        week: allocations.weekStart,
        pd: allocations.personDays,
      })
      .from(allocations)
      .where(and(inArray(allocations.taskAssignmentId, [assignmentIds.Jack, assignmentIds.Mint]), win))
    expect(rows).toEqual([
      { granularity: 'DAY', period: '2026-09-07', week: '2026-09-07', pd: '0.50' },
      { granularity: 'DAY', period: '2026-09-07', week: '2026-09-07', pd: '0.50' },
    ])
    const audits = await db
      .select()
      .from(auditLog)
      .where(inArray(auditLog.entityId, [taskId, assignmentIds.Jack, assignmentIds.Mint]))
    expect(audits.map((a) => `${a.entity}:${a.action}`).sort()).toEqual([
      'allocation:create',
      'allocation:create',
      'task:create',
    ])
    expect(audits.every((a) => a.actorId === null && a.projectId === mobile!.id)).toBe(true)
    expect(audits.find((a) => a.entity === 'task')?.summary).toBe(th.audit.taskCreated('Kickoff workshop'))
    expect(audits.filter((a) => a.entity === 'allocation').map((a) => a.summary)).toEqual([
      th.audit.allocationsSeeded(1),
      th.audit.allocationsSeeded(1),
    ])
  })

  it('totals over [2026-08-31, 2027-01-04): all 19 600 / 11 725 cd, Mobile 5 975, Jack 09-07 = 300, Mint 09-07 = 50 (r8 §6.10)', async () => {
    await seedGolden(db)
    await addDayExample(db)
    expect(await totals()).toEqual({ total: 19600, committed: 11725 })
    expect((await totals(and(win, eq(projects.name, DAY_EXAMPLE.project)))).total).toBe(5975)
    expect(await weekOf('Jack', '2026-09-07')).toBe(300)
    expect(await weekOf('Mint', '2026-09-07')).toBe(50)
  })

  it('is idempotent: a second call returns the same ids and leaves 2 DAY rows', async () => {
    await seedGolden(db)
    const first = await addDayExample(db)
    const second = await addDayExample(db)
    expect(second).toEqual(first)
    const rows = await db
      .select({ id: allocations.id })
      .from(allocations)
      .where(and(inArray(allocations.taskAssignmentId, Object.values(first.assignmentIds)), win))
    expect(rows).toHaveLength(2)
    const [{ n } = { n: 0 }] = await db
      .select({ n: count() })
      .from(tasks)
      .where(eq(tasks.name, DAY_EXAMPLE.task))
    expect(n).toBe(1)
  })
})

describe('M8 — addMilestones (SPEC App. A.2, M8-D20, X70, BR-72; plan/m08 S0.9)', () => {
  const win = and(gte(allocations.weekStart, '2026-08-31'), lt(allocations.weekStart, '2027-01-04'))

  async function allocationTotals() {
    const [r] = await db
      .select({ n: count(), total: sql<string>`coalesce(sum(${allocations.personDays}), 0)::text` })
      .from(allocations)
      .where(win)
    return { n: r?.n ?? 0, total: r?.total ?? '0' }
  }

  it('7 A.2 milestones by the Manager, UAT sign-off bound to "ทำ UAT + คู่มือหน้าร้าน", 7 actor-null audit rows', async () => {
    await seedGolden(db)
    const [tasksBefore] = await db.select({ n: count() }).from(tasks)
    const allocBefore = await allocationTotals()
    const [auditBefore] = await db.select({ n: count() }).from(auditLog).where(eq(auditLog.entity, 'milestone'))

    const { ids } = await addMilestones(db)

    const rows = await db
      .select({
        id: milestones.id,
        project: projects.name,
        name: milestones.name,
        date: milestones.date,
        creator: user.nickname,
        completedOn: milestones.completedOn,
        deletedAt: milestones.deletedAt,
      })
      .from(milestones)
      .innerJoin(projects, eq(projects.id, milestones.projectId))
      .innerJoin(user, eq(user.id, milestones.createdBy))
      .orderBy(asc(milestones.date))
    expect(rows).toHaveLength(7)
    expect(rows.map((r) => [r.project, r.name, r.date])).toEqual(
      [...DEMO_MILESTONES]
        .sort((a, b) => a.date.localeCompare(b.date))
        .map((m) => [m.project, m.name, m.date]),
    )
    expect(new Set(rows.map((r) => r.creator))).toEqual(new Set(['Manager']))
    expect(rows.every((r) => r.completedOn === null && r.deletedAt === null)).toBe(true)
    expect(Object.keys(ids).sort()).toEqual(DEMO_MILESTONES.map((m) => m.name).sort())
    for (const r of rows) expect(ids[r.name]).toBe(r.id)

    const bound = await db
      .select({ name: tasks.name, milestoneId: tasks.milestoneId })
      .from(tasks)
      .where(sql`${tasks.milestoneId} is not null`)
    expect(bound).toEqual([{ name: 'ทำ UAT + คู่มือหน้าร้าน', milestoneId: ids['UAT sign-off'] }])

    const audits = await db
      .select({ actorId: auditLog.actorId, action: auditLog.action, entityId: auditLog.entityId, summary: auditLog.summary })
      .from(auditLog)
      .where(eq(auditLog.entity, 'milestone'))
    expect(audits.length - (auditBefore?.n ?? 0)).toBe(7)
    expect(audits.every((a) => a.actorId === null && a.action === 'create')).toBe(true)
    expect(audits.map((a) => a.summary).sort()).toEqual(
      DEMO_MILESTONES.map((m) => th.audit.milestoneSeeded(m.name)).sort(),
    )
    expect(new Set(audits.map((a) => a.entityId))).toEqual(new Set(Object.values(ids)))

    // BR-72: milestones carry no load; X70: no task inserted
    const [tasksAfter] = await db.select({ n: count() }).from(tasks)
    expect(tasksAfter?.n).toBe(tasksBefore?.n)
    expect(await allocationTotals()).toEqual(allocBefore)
    expect(allocBefore).toEqual({ n: 57, total: '195.00' })
  })
})

describe('M9 — addSyntheticWorkload (NFR-03 smoke + M12 seed:perf, X92, M9-D23; plan/m09 S0.10)', () => {
  const window = and(gte(allocations.weekStart, '2026-01-05'), lt(allocations.weekStart, '2028-01-03'))
  const counts = async () => ({
    users: (await db.select({ n: count() }).from(user))[0]!.n,
    projects: (await db.select({ n: count() }).from(projects))[0]!.n,
    tasks: (await db.select({ n: count() }).from(tasks))[0]!.n,
    assignments: (await db.select({ n: count() }).from(taskAssignments))[0]!.n,
    allocations: (await db.select({ n: count() }).from(allocations).where(window))[0]!.n,
    audit: (await db.select({ n: count() }).from(auditLog))[0]!.n,
    positions: (await db.select({ n: count() }).from(positions))[0]!.n,
  })

  it('95 people × 20 projects × 12 weeks after seedGolden in one transaction: rows, e-mails, positions, no audit', async () => {
    let before: Awaited<ReturnType<typeof counts>> | undefined
    let out: { userIds: string[]; projectIds: string[] } | undefined
    await db.transaction(async (tx) => {
      await seedGolden(tx)
      before = {
        users: (await tx.select({ n: count() }).from(user))[0]!.n,
        projects: (await tx.select({ n: count() }).from(projects))[0]!.n,
        tasks: (await tx.select({ n: count() }).from(tasks))[0]!.n,
        assignments: (await tx.select({ n: count() }).from(taskAssignments))[0]!.n,
        allocations: (await tx.select({ n: count() }).from(allocations).where(window))[0]!.n,
        audit: (await tx.select({ n: count() }).from(auditLog))[0]!.n,
        positions: (await tx.select({ n: count() }).from(positions))[0]!.n,
      }
      out = await addSyntheticWorkload(tx, { people: 95, projects: 20, weeks: 12, from: '2026-09-28' })
    })
    const after = await counts()
    expect(out!.userIds).toHaveLength(95)
    expect(out!.projectIds).toHaveLength(20)
    expect(after).toEqual({
      users: before!.users + 95,
      projects: before!.projects + 20,
      tasks: before!.tasks + 190,
      assignments: before!.assignments + 190,
      allocations: before!.allocations + 2280,
      audit: before!.audit,
      positions: before!.positions,
    })
    const perf = await db.select().from(user).where(inArray(user.id, out!.userIds))
    expect(perf.map((u) => u.email).sort()).toEqual(
      Array.from({ length: 95 }, (_, i) => `perf-${String(i + 1).padStart(2, '0')}@example.com`).sort(),
    )
    const goldenPositions = new Set((await db.select({ id: positions.id }).from(positions)).map((p) => p.id))
    for (const u of perf) {
      expect(u.role).toBe('worker')
      expect(u.positionId !== null && goldenPositions.has(u.positionId)).toBe(true)
    }
    const schedules = await db.select().from(workSchedules).where(inArray(workSchedules.userId, out!.userIds))
    expect(schedules).toHaveLength(95 * 5)
    expect(schedules.every((r) => r.fraction === '1.00' && r.weekday >= 1 && r.weekday <= 5)).toBe(true)
    const perfProjects = await db.select().from(projects).where(inArray(projects.id, out!.projectIds))
    expect(perfProjects.every((p) => p.clientId === null && p.certainty === 'CONFIRMED')).toBe(true)
    const perfTasks = await db.select().from(tasks).where(inArray(tasks.projectId, out!.projectIds))
    expect(perfTasks).toHaveLength(190)
    expect(perfTasks.every((t) => t.statusId !== null)).toBe(true)
    const leads = await db
      .select({ n: count() })
      .from(projectMembers)
      .where(and(inArray(projectMembers.projectId, out!.projectIds), eq(projectMembers.role, 'LEAD')))
    expect(leads[0]!.n).toBe(20)
    const rows = await db
      .select()
      .from(allocations)
      .innerJoin(taskAssignments, eq(taskAssignments.id, allocations.taskAssignmentId))
      .where(and(window, inArray(taskAssignments.userId, out!.userIds)))
    expect(rows).toHaveLength(2280)
    for (const { allocations: a } of rows) {
      expect(a.granularity).toBe('WEEK')
      expect(a.weekStart >= '2026-09-28' && a.weekStart < '2026-12-21').toBe(true)
      expect(['1.00', '2.00', '3.00']).toContain(a.personDays)
    }
  })

  it('100 people also works (e-mails up to perf-100@example.com)', async () => {
    await seedGolden(db)
    const out = await addSyntheticWorkload(db, { people: 100, projects: 20, weeks: 1, from: '2026-09-28' })
    const emails = (await db.select({ e: user.email }).from(user).where(inArray(user.id, out.userIds))).map((r) => r.e)
    expect(emails).toContain('perf-100@example.com')
    expect(emails).toContain('perf-01@example.com')
    expect(new Set(emails).size).toBe(100)
  })

  it('without seedGolden → "run seedGolden first"; a Tuesday → RangeError', async () => {
    await expect(
      addSyntheticWorkload(db, { people: 2, projects: 1, weeks: 1, from: '2026-09-28' }),
    ).rejects.toThrow('addSyntheticWorkload: run seedGolden first')
    await expect(
      addSyntheticWorkload(db, { people: 2, projects: 1, weeks: 1, from: '2026-09-29' }),
    ).rejects.toBeInstanceOf(RangeError)
  })
})
