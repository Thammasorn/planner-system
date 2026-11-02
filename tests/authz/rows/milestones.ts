// tests/authz/rows/milestones.ts — M8 milestones (SPEC §3.2 row "สร้าง/แก้/ลบ milestone" = PERM-15: M ✅ · L ✅ ·
// Me ดูได้ · W —; reads = PERM-06 เห็นโปรเจค; binding a task = PERM-11 แก้ task (M8-D4); §4.7, §7.5, X41/X42/X44/X66;
// plan/m08 S5.1, §7.2). Written from the SPEC before S2 writes the bodies (PLAN §4.1): every row is red with
// NOT_IMPLEMENTED until S2. Allowed writes assert exactly one new audit row (X44): `milestone` for milestone writes,
// `task` for a binding of one task. Content leaks across projects → masking.int.test.ts › milestones (M8).
import { randomUUID } from 'node:crypto'
import { eq } from 'drizzle-orm'
import { expect } from 'vitest'
import type { ActionResult } from '@/lib/action-result'
import type { MilestoneDTO, MilestoneTargetsResponse, ProjectMilestonesResponse } from '@/lib/contracts/milestones'
import type { TeamTasksResponse } from '@/lib/contracts/tasks'
import { db } from '@/server/db/client'
import { tasks } from '@/server/db/schema'
import type { TestUser } from '../../helpers/factories'
import type { World } from '../../helpers/world'
import { defineRow, type AuthzRow } from '../types'
import {
  ALL,
  ALL404,
  ARCH,
  auditMilestone,
  auditTask,
  BAD,
  M8_TODAY,
  MANAGE,
  MILESTONE_WORLD,
  milestonesGet,
  ms,
  PROJECT_MILESTONES_ROUTE,
  TARGETS_ROUTE,
  TEAM_TASKS_ROUTE,
  targetsGet,
  teamTasksGet,
  VIEW,
} from './_m8'

const auditP = auditMilestone((w) => w.P.id)
const auditA = auditMilestone((w) => w.A.id)
const auditQ = auditMilestone((w) => w.Q.id)
const auditTaskP = auditTask((w) => w.P.id)
const auditTaskA = auditTask((w) => w.A.id)

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

/** On success run content checks; failures pass through to the matrix outcome. */
function checked<T extends object>(r: ActionResult<T>, check: (ok: T) => void | Promise<void>): Promise<ActionResult<T>> {
  return (async () => {
    if (r.ok) await check(r)
    return r
  })()
}

/** 200 → body checks; other statuses pass through. */
async function checkedJson<T>(res: Response, check: (b: T) => void): Promise<Response> {
  if (res.status === 200) check((await res.clone().json()) as T)
  return res
}

/** MilestoneDTO = MilestoneRef + projectId, description, status, late, lateTaskCount, progress (M8-D7/D8). */
const DTO_KEYS = [
  'completedOn',
  'date',
  'description',
  'id',
  'late',
  'lateTaskCount',
  'name',
  'progress',
  'projectId',
  'status',
].sort()
const expectDto = (m: MilestoneDTO) => expect(Object.keys(m).sort()).toEqual(DTO_KEYS)

/** M/L manage a non-archived project; Me only reads (PERM-15 "ดูได้"). */
const canManageOn = (w: World, actor: TestUser) => actor.id === w.manager.id || actor.id === w.lead.id

/** Raw `tasks.milestone_id` (bypasses the live join) — M8-D5: delete must not touch it. */
async function rawMilestoneOf(taskId: string): Promise<string | null> {
  const [t] = await db.select({ m: tasks.milestoneId }).from(tasks).where(eq(tasks.id, taskId))
  return t?.m ?? null
}

export const rows: AuthzRow[] = [
  // ── reads: PERM-06 เห็นโปรเจค (FR-409, M8-D17; archived readable X42) ──────────────────────────────────────────
  defineRow({
    id: 'MS-LIST',
    spec: 'PERM-06 §3.2 เห็นโปรเจค + FR-409/FR-703/FR-704 — GET /api/projects/{P}/milestones: live milestones by date, BR-70 status, BR-71 late, progress',
    action: PROJECT_MILESTONES_ROUTE,
    mutates: false,
    with: MILESTONE_WORLD,
    expect: VIEW,
    run: async (w, _ctx, actor) =>
      checkedJson<ProjectMilestonesResponse>(await milestonesGet(w.P.id), (b) => {
        expect(b).toMatchObject({ projectId: w.P.id, today: M8_TODAY, canManage: canManageOn(w, actor) })
        const m = w.milestones
        // date order; soft-deleted pDeleted / pExpired are not sent (M8-D5)
        expect(b.milestones.map((x) => x.id)).toEqual([m.pDone.id, m.pLate.id, m.p.id])
        b.milestones.forEach(expectDto)
        const [done, late, p] = b.milestones
        expect(done).toMatchObject({
          name: 'Kickoff P',
          date: '2026-09-15',
          completedOn: '2026-09-16',
          status: 'DONE',
          late: false,
          lateTaskCount: 0,
          progress: { done: 1, total: 1 },
        })
        // BR-70: 10-02 − 09-30 = 2 ≤ 7 → DUE_SOON; BR-71: pLeaf has WEEK 10-05 > 10-02 → late
        expect(late).toMatchObject({
          name: 'ส่งมอบรอบแรก P',
          projectId: w.P.id,
          status: 'DUE_SOON',
          late: true,
          lateTaskCount: 1,
          progress: { done: 0, total: 1 },
        })
        expect(p).toMatchObject({
          name: 'Milestone P-ลับ06',
          date: '2026-10-23',
          completedOn: null,
          status: 'UPCOMING',
          late: false,
          lateTaskCount: 0,
          progress: { done: 0, total: 1 },
        })
      }),
  }),
  defineRow({
    id: 'MS-LIST-ARCH',
    spec: 'PERM-06 + X42 — archived A: milestones stay readable, nobody may manage them',
    action: PROJECT_MILESTONES_ROUTE,
    mutates: false,
    with: MILESTONE_WORLD,
    expect: VIEW,
    run: async (w) =>
      checkedJson<ProjectMilestonesResponse>(await milestonesGet(w.A.id), (b) => {
        expect(b.canManage).toBe(false)
        expect(b.milestones.map((x) => x.id)).toEqual([w.milestones.a.id])
      }),
  }),
  defineRow({
    id: 'MS-LIST-BADID',
    spec: 'PERM-06 + X86 — GET /api/projects/not-a-uuid/milestones is a 404 for everyone',
    action: PROJECT_MILESTONES_ROUTE,
    mutates: false,
    with: MILESTONE_WORLD,
    expect: ALL404,
    run: () => milestonesGet('not-a-uuid'),
  }),
  defineRow({
    id: 'MS-TARGETS',
    spec: 'M8-D18 own data — GET /api/milestones/targets: manager → non-archived projects, worker → projects where LEAD',
    action: TARGETS_ROUTE,
    mutates: false,
    with: MILESTONE_WORLD,
    expect: ALL,
    run: async (w, _ctx, actor) =>
      checkedJson<MilestoneTargetsResponse>(await targetsGet(), (b) => {
        const ids = b.projects.map((p) => p.id)
        if (actor.id === w.manager.id) {
          expect(ids).toEqual(expect.arrayContaining([w.P.id, w.Q.id]))
          expect(ids).not.toContain(w.A.id)
        } else if (actor.id === w.lead.id) expect(ids).toEqual([w.P.id])
        else expect(ids).toEqual([])
      }),
  }),

  // ── milestone writes: PERM-15 (FR-701/702/704/707/708, M8-D3/D19) ───────────────────────────────────────────────
  defineRow({
    id: 'MS-CREATE',
    spec: 'PERM-15 §3.2 สร้าง milestone — createMilestone on P (FR-701/702)',
    action: 'createMilestone',
    mutates: true,
    audit: auditP,
    with: MILESTONE_WORLD,
    expect: MANAGE,
    run: async (w) =>
      checked(await ms.create({ projectId: w.P.id, name: 'x', date: '2026-11-13' }), (r) => {
        expectDto(r.milestone)
        expect(r.milestone).toMatchObject({
          projectId: w.P.id,
          name: 'x',
          date: '2026-11-13',
          description: null,
          completedOn: null,
          status: 'UPCOMING',
          late: false,
          lateTaskCount: 0,
          progress: { done: 0, total: 0 },
        })
        expect(r.milestone.id).toMatch(UUID)
      }),
  }),
  defineRow({
    id: 'MS-CREATE-ARCH',
    spec: 'PERM-15 + X42 — createMilestone on archived A',
    action: 'createMilestone',
    mutates: true,
    audit: auditA,
    with: MILESTONE_WORLD,
    expect: ARCH,
    run: (w) => ms.create({ projectId: w.A.id, name: 'x', date: '2026-11-13' }),
  }),
  defineRow({
    id: 'MS-RENAME',
    spec: 'PERM-15 §3.2 แก้ milestone — updateMilestone rename (previous for exact undo, M8-D3)',
    action: 'updateMilestone',
    mutates: true,
    audit: auditP,
    with: MILESTONE_WORLD,
    expect: MANAGE,
    run: async (w) =>
      checked(await ms.update({ milestoneId: w.milestones.p.id, patch: { name: 'y' } }), (r) => {
        expect(r.milestone).toMatchObject({ id: w.milestones.p.id, name: 'y', date: '2026-10-23' })
        expect(r.previous).toMatchObject({ name: 'Milestone P-ลับ06', date: '2026-10-23', completedOn: null })
        expect(r.changed).toEqual(['name'])
      }),
  }),
  defineRow({
    id: 'MS-MOVE',
    spec: 'PERM-15 + FR-707 — updateMilestone move (date) ',
    action: 'updateMilestone',
    mutates: true,
    audit: auditP,
    with: MILESTONE_WORLD,
    expect: MANAGE,
    run: async (w) =>
      checked(await ms.update({ milestoneId: w.milestones.p.id, patch: { date: '2026-10-30' } }), (r) => {
        expect(r.milestone).toMatchObject({ id: w.milestones.p.id, date: '2026-10-30', status: 'UPCOMING' })
        expect(r.previous.date).toBe('2026-10-23')
        expect(r.changed).toEqual(['date'])
      }),
  }),
  defineRow({
    id: 'MS-COMPLETE',
    spec: 'PERM-15 + FR-701/BR-70 — updateMilestone completed: true → completedOn = today, DONE (M8-D19)',
    action: 'updateMilestone',
    mutates: true,
    audit: auditP,
    with: MILESTONE_WORLD,
    expect: MANAGE,
    run: async (w) =>
      checked(await ms.update({ milestoneId: w.milestones.p.id, patch: { completed: true } }), (r) => {
        expect(r.milestone).toMatchObject({ id: w.milestones.p.id, completedOn: M8_TODAY, status: 'DONE' })
        expect(r.previous).toMatchObject({ completed: false, completedOn: null })
        expect(r.changed).toEqual(['completed'])
      }),
  }),
  defineRow({
    id: 'MS-UPDATE-ARCH',
    spec: 'PERM-15 + X42 — updateMilestone on archived A',
    action: 'updateMilestone',
    mutates: true,
    audit: auditA,
    with: MILESTONE_WORLD,
    expect: ARCH,
    run: (w) => ms.update({ milestoneId: w.milestones.a.id, patch: { name: 'y' } }),
  }),
  defineRow({
    id: 'MS-DELETE',
    spec: 'PERM-15 §3.2 ลบ milestone + FR-708 — deleteMilestone: soft delete with batch, bound tasks keep the raw id (M8-D5)',
    action: 'deleteMilestone',
    mutates: true,
    audit: auditP,
    with: MILESTONE_WORLD,
    expect: MANAGE,
    run: async (w) =>
      checked(await ms.remove({ milestoneId: w.milestones.p.id }), async (r) => {
        expect(r).toMatchObject({
          projectId: w.P.id,
          milestoneId: w.milestones.p.id,
          name: 'Milestone P-ลับ06',
          unlinkedTaskCount: 1,
        })
        expect(r.batch).toMatch(UUID)
        expect(await rawMilestoneOf(w.tasks.pChildB.id), 'M8-D5: tasks.milestone_id untouched').toBe(
          w.milestones.p.id,
        )
      }),
  }),
  defineRow({
    id: 'MS-DELETE-ARCH',
    spec: 'PERM-15 + X42 — deleteMilestone on archived A',
    action: 'deleteMilestone',
    mutates: true,
    audit: auditA,
    with: MILESTONE_WORLD,
    expect: ARCH,
    run: (w) => ms.remove({ milestoneId: w.milestones.a.id }),
  }),
  defineRow({
    id: 'MS-RESTORE',
    spec: 'PERM-15 + §7.5 — restoreMilestoneBatch (1 day old): the milestone and its binding come back exactly (X04, M8-D5)',
    action: 'restoreMilestoneBatch',
    mutates: true,
    audit: auditP,
    with: MILESTONE_WORLD,
    expect: MANAGE,
    run: async (w) =>
      checked(await ms.restore({ batch: w.batches.pDeletedMilestone }), (r) => {
        expectDto(r.milestone)
        expect(r.milestone).toMatchObject({
          id: w.deletedMilestones.pDeleted.id,
          projectId: w.P.id,
          name: 'Milestone ที่ลบแล้ว P',
          progress: { done: 0, total: 1 }, // pParent is bound again
        })
      }),
  }),
  defineRow({
    id: 'MS-RESTORE-EXPIRED',
    spec: '§7.5 30-day window — restoreMilestoneBatch of a batch deleted 31 days ago: authz first (Me 403, W 404), then VALIDATION restoreExpired',
    action: 'restoreMilestoneBatch',
    mutates: true,
    audit: auditP,
    with: MILESTONE_WORLD,
    expect: { M: '400', L: '400', Me: '403', W: '404' },
    run: (w) => ms.restore({ batch: w.batches.pExpiredMilestone }),
  }),
  defineRow({
    id: 'MS-RESTORE-ARCH',
    spec: 'PERM-15 + X42 + §7.5 (restore re-checks permission) — restoreMilestoneBatch on archived A',
    action: 'restoreMilestoneBatch',
    mutates: true,
    audit: auditA,
    with: MILESTONE_WORLD,
    expect: ARCH,
    run: (w) => ms.restore({ batch: w.batches.aDeletedMilestone }),
  }),
  defineRow({
    id: 'MS-RESTORE-MISSING',
    spec: 'PERM-15 + X41 — restoreMilestoneBatch of an unknown batch',
    action: 'restoreMilestoneBatch',
    mutates: true,
    audit: auditP,
    with: MILESTONE_WORLD,
    expect: ALL404,
    run: () => ms.restore({ batch: randomUUID() }),
  }),
  defineRow({
    id: 'MS-Q',
    spec: 'PERM-15 on another project — updateMilestone of Q’s milestone: M allow; L, Me not in Q → 404; W = MEMBER of Q → 403',
    action: 'updateMilestone',
    mutates: true,
    audit: auditQ,
    with: MILESTONE_WORLD,
    expect: { M: 'allow', L: '404', Me: '404', W: '403' },
    run: (w) => ms.update({ milestoneId: w.milestones.q.id, patch: { name: 'y' } }),
  }),
  defineRow({
    id: 'MS-MISSING',
    spec: 'PERM-15 + X41 — deleteMilestone of an unknown id',
    action: 'deleteMilestone',
    mutates: true,
    audit: auditP,
    with: MILESTONE_WORLD,
    expect: ALL404,
    run: () => ms.remove({ milestoneId: randomUUID() }),
  }),
  defineRow({
    id: 'MS-DELETED',
    spec: 'PERM-15 + M8-D5 — updateMilestone of a soft-deleted milestone is a 404 for everyone',
    action: 'updateMilestone',
    mutates: true,
    audit: auditP,
    with: MILESTONE_WORLD,
    expect: ALL404,
    run: (w) => ms.update({ milestoneId: w.deletedMilestones.pDeleted.id, patch: { name: 'y' } }),
  }),
  defineRow({
    id: 'MS-BAD',
    spec: 'PERM-15 + X41 — createMilestone with a blank name and 2026-02-30 → 400 before authz',
    action: 'createMilestone',
    mutates: true,
    audit: auditP,
    with: MILESTONE_WORLD,
    expect: BAD,
    run: (w) => ms.create({ projectId: w.P.id, name: ' ', date: '2026-02-30' }),
  }),

  // ── bindings: PERM-11 แก้ task (FR-601/614, M8-D4/D14, X66) ────────────────────────────────────────────────────
  defineRow({
    id: 'MS-LINK',
    spec: 'PERM-11 §3.2 แก้ task (M8-D4) — linkTasksToMilestone(pLeaf → p): one changed task, previous = pLate',
    action: 'linkTasksToMilestone',
    mutates: true,
    audit: auditTaskP,
    with: MILESTONE_WORLD,
    expect: VIEW,
    run: async (w) =>
      checked(await ms.link({ taskIds: [w.tasks.pLeaf.id], milestoneId: w.milestones.p.id }), (r) => {
        expect(r).toMatchObject({
          projectId: w.P.id,
          milestoneId: w.milestones.p.id,
          milestoneName: 'Milestone P-ลับ06',
        })
        expect(r.changed).toEqual([
          { taskId: w.tasks.pLeaf.id, taskName: w.tasks.pLeaf.name, previousMilestoneId: w.milestones.pLate.id },
        ])
      }),
  }),
  defineRow({
    id: 'MS-UNLINK',
    spec: 'PERM-11 — linkTasksToMilestone(pChildB → null) unbinds',
    action: 'linkTasksToMilestone',
    mutates: true,
    audit: auditTaskP,
    with: MILESTONE_WORLD,
    expect: VIEW,
    run: async (w) =>
      checked(await ms.link({ taskIds: [w.tasks.pChildB.id], milestoneId: null }), async (r) => {
        expect(r).toMatchObject({ projectId: w.P.id, milestoneId: null, milestoneName: null })
        expect(r.changed).toEqual([
          { taskId: w.tasks.pChildB.id, taskName: w.tasks.pChildB.name, previousMilestoneId: w.milestones.p.id },
        ])
        expect(await rawMilestoneOf(w.tasks.pChildB.id)).toBeNull()
      }),
  }),
  defineRow({
    id: 'MS-LINK-CROSS',
    spec: 'X66 same project only — linkTasksToMilestone(pLeaf → q): M sees both → VALIDATION sameProjectOnly; others cannot see one of them → 404',
    action: 'linkTasksToMilestone',
    mutates: true,
    audit: auditTaskP,
    with: MILESTONE_WORLD,
    expect: { M: '400', L: '404', Me: '404', W: '404' },
    run: (w) => ms.link({ taskIds: [w.tasks.pLeaf.id], milestoneId: w.milestones.q.id }),
  }),
  defineRow({
    id: 'MS-LINK-ARCH',
    spec: 'PERM-11 + X42 — linkTasksToMilestone on archived A',
    action: 'linkTasksToMilestone',
    mutates: true,
    audit: auditTaskA,
    with: MILESTONE_WORLD,
    expect: ARCH,
    run: (w) => ms.link({ taskIds: [w.tasks.aTask.id], milestoneId: w.milestones.a.id }),
  }),
  defineRow({
    id: 'MS-LINK-DELETED',
    spec: 'PERM-11 + M8-D5 — linkTasksToMilestone to a soft-deleted milestone: the team gets 404 (cannot bind to it), W 404',
    action: 'linkTasksToMilestone',
    mutates: true,
    audit: auditTaskP,
    with: MILESTONE_WORLD,
    expect: ALL404,
    run: (w) => ms.link({ taskIds: [w.tasks.pLeaf.id], milestoneId: w.deletedMilestones.pDeleted.id }),
  }),
  defineRow({
    id: 'MS-LINK-BAD',
    spec: 'PERM-11 + X41 — linkTasksToMilestone with an empty taskIds list → 400 before authz',
    action: 'linkTasksToMilestone',
    mutates: true,
    audit: auditTaskP,
    with: MILESTONE_WORLD,
    expect: BAD,
    run: (w) => ms.link({ taskIds: [], milestoneId: w.milestones.p.id }),
  }),
  defineRow({
    id: 'MS-REVERT',
    spec: 'PERM-11 + §7.5 — revertTaskMilestones([{ pLeaf, p }]) (undo of a link)',
    action: 'revertTaskMilestones',
    mutates: true,
    audit: auditTaskP,
    with: MILESTONE_WORLD,
    expect: VIEW,
    run: async (w) =>
      checked(await ms.revert({ items: [{ taskId: w.tasks.pLeaf.id, milestoneId: w.milestones.p.id }] }), (r) => {
        expect(r.projectId).toBe(w.P.id)
        expect(r.changed).toEqual([
          { taskId: w.tasks.pLeaf.id, taskName: w.tasks.pLeaf.name, previousMilestoneId: w.milestones.pLate.id },
        ])
      }),
  }),
  defineRow({
    id: 'MS-REVERT-DELETED',
    spec: 'PERM-11 + M8-D14 — revertTaskMilestones may restore the RAW previous id of a since-deleted milestone (exact undo)',
    action: 'revertTaskMilestones',
    mutates: true,
    audit: auditTaskP,
    with: MILESTONE_WORLD,
    expect: VIEW,
    run: async (w) =>
      checked(
        await ms.revert({ items: [{ taskId: w.tasks.pLeaf.id, milestoneId: w.deletedMilestones.pDeleted.id }] }),
        async () => {
          expect(await rawMilestoneOf(w.tasks.pLeaf.id)).toBe(w.deletedMilestones.pDeleted.id)
        },
      ),
  }),
  defineRow({
    id: 'MS-REVERT-ARCH',
    spec: 'PERM-11 + X42 — revertTaskMilestones on archived A',
    action: 'revertTaskMilestones',
    mutates: true,
    audit: auditTaskA,
    with: MILESTONE_WORLD,
    expect: ARCH,
    run: (w) => ms.revert({ items: [{ taskId: w.tasks.aTask.id, milestoneId: null }] }),
  }),

  // ── /tasks milestone filter: PERM-06 (FR-663, M8-D15) ─────────────────────────────────────────────────────────
  defineRow({
    id: 'TT-MS',
    spec: 'PERM-06 + M8-D15 — GET /api/tasks?milestoneId={pLate}: only tasks bound to it',
    action: TEAM_TASKS_ROUTE,
    mutates: false,
    with: MILESTONE_WORLD,
    expect: VIEW,
    run: async (w) =>
      checkedJson<TeamTasksResponse>(await teamTasksGet(`milestoneId=${w.milestones.pLate.id}`), (b) => {
        expect(b.cards.map((c) => c.id)).toEqual([w.tasks.pLeaf.id])
        expect(b.cards[0]).toMatchObject({ projectId: w.P.id, milestoneId: w.milestones.pLate.id })
        expect(Object.keys(b.milestonesByProject)).toEqual([w.P.id])
        expect(b.milestonesByProject[w.P.id]!.map((m) => m.id)).toEqual(
          expect.arrayContaining([w.milestones.p.id, w.milestones.pLate.id]),
        )
      }),
  }),
  defineRow({
    id: 'TT-MS-Q',
    spec: 'PERM-06 + M8-D15 — GET /api/tasks?milestoneId={q}: M and W (MEMBER of Q) see qTask; L, Me not in Q → 404',
    action: TEAM_TASKS_ROUTE,
    mutates: false,
    with: MILESTONE_WORLD,
    expect: { M: 'allow', L: '404', Me: '404', W: 'allow' },
    run: async (w) =>
      checkedJson<TeamTasksResponse>(await teamTasksGet(`milestoneId=${w.milestones.q.id}`), (b) => {
        expect(b.cards.map((c) => c.id)).toEqual([w.tasks.qTask.id])
        expect(b.cards[0]!.milestoneId).toBe(w.milestones.q.id)
      }),
  }),
  defineRow({
    id: 'TT-MS-DELETED',
    spec: 'PERM-06 + M8-D5 — GET /api/tasks?milestoneId={soft-deleted} is a 404 for everyone',
    action: TEAM_TASKS_ROUTE,
    mutates: false,
    with: MILESTONE_WORLD,
    expect: ALL404,
    run: (w) => teamTasksGet(`milestoneId=${w.deletedMilestones.pDeleted.id}`),
  }),
  defineRow({
    id: 'TT-MS-BAD',
    spec: 'X41/X86 — GET /api/tasks?milestoneId=not-a-uuid → 400 for everyone',
    action: TEAM_TASKS_ROUTE,
    mutates: false,
    with: MILESTONE_WORLD,
    expect: BAD,
    run: () => teamTasksGet('milestoneId=not-a-uuid'),
  }),
]
