// tests/authz/masking.int.test.ts — MASK-7 / X30 leak tests (SPEC §3.3 "ห้ามส่งชื่อโปรเจคหรือ task ไปที่ client",
// §11.2 `JSON.stringify(res).includes(name) === false`, CLAUDE.md › สิทธิ์). Every read endpoint/loader that can carry
// other people's data is requested as a viewer who must not see a project; the serialized payload must contain none
// of its names or ids. M2: sidebar, project list, client list/detail, people options, client options.
// M3 (plan/m03 S4.3): project tasks, project statuses, /api/tasks/my, team tasks /api/tasks, sidebar count, and the
// error body of a cross-project blocker. Later milestones append describe blocks (M5 calendar, M6 grid, M9
// workload/person, M10 search/home). plan/m02-clients-projects-authz.md S3.4.
import { beforeEach, describe, expect, it } from 'vitest'
import { GET as getClientOptions } from '@/app/api/clients/options/route'
import { GET as getPeopleOptions } from '@/app/api/people/options/route'
import { GET as getProjectStatuses } from '@/app/api/projects/[id]/statuses/route'
import { GET as getProjectTasks } from '@/app/api/projects/[id]/tasks/route'
import { GET as getSidebar } from '@/app/api/sidebar/route'
import { GET as getMyTasks } from '@/app/api/tasks/my/route'
import { GET as getTeamTasks } from '@/app/api/tasks/route'
import type { PeopleOptionsResponse } from '@/lib/contracts/people'
import type { MyTasksResponse, ProjectTasksResponse, TeamTasksResponse } from '@/lib/contracts/tasks'
import { addTaskBlocker } from '@/server/actions/task-blockers'
import { db } from '@/server/db/client'
import * as services from '@/server/services'
import { seedGolden } from '../../scripts/lib/fixtures'
import { asUser } from '../helpers/as-user'
import { makeBlocker, type TestUser } from '../helpers/factories'
import { outcomeOf } from '../helpers/outcome'
import { createWorld, type World } from '../helpers/world'
import { goldenProjectId, goldenTaskNames, goldenUser, type GoldenProject } from './_support/golden'
import { callRoute, okJson } from './_support/http'
import { assertContains, assertNoLeak } from './_support/leak'

async function sidebarAs(u: TestUser): Promise<unknown> {
  asUser(u)
  return okJson(await callRoute(getSidebar, '/api/sidebar'))
}

describe('masking — world', () => {
  /** Everything about P's side of the world the outsider must never receive. */
  const hiddenFromOutsider = (w: World) => [w.P.name, w.P.id, w.A.name, w.A.id, w.C1.name, w.C1.id]

  it('outsider: GET /api/sidebar has Q and nothing of P, A or C1', async () => {
    const w = await createWorld()
    const body = await sidebarAs(w.outsider)
    assertContains(body, [w.Q.name, w.Q.id])
    assertNoLeak(body, hiddenFromOutsider(w))
  })

  it('outsider: /projects (active and archived) has nothing of P, A or C1', async () => {
    const w = await createWorld()
    const user = asUser(w.outsider)
    const active = await services.projects.listProjectsForViewer(db, user, { archived: false })
    assertContains(active, [w.Q.name])
    assertNoLeak(active, hiddenFromOutsider(w))
    const archived = await services.projects.listProjectsForViewer(db, user, { archived: true })
    assertNoLeak(archived, hiddenFromOutsider(w))
  })

  it('outsider: /clients and the C2 page have nothing of P, A or C1', async () => {
    const w = await createWorld()
    const user = asUser(w.outsider)
    const list = await services.clients.listClientsForViewer(db, user, { includeArchived: false })
    assertContains(list, [w.C2.name])
    assertNoLeak(list, hiddenFromOutsider(w))
    // workers ignore includeArchived (their own clients only), so asking for archived must not widen the list
    const listArchived = await services.clients.listClientsForViewer(db, user, { includeArchived: true })
    assertNoLeak(listArchived, [...hiddenFromOutsider(w), w.C3.name, w.C3.id])
    const detail = await services.clients.getClientDetail(db, user, w.C2.id)
    assertContains(detail, [w.C2.name, w.Q.name])
    assertNoLeak(detail, hiddenFromOutsider(w))
  })

  it('member: GET /api/sidebar has P and nothing of Q; archived A is not in the sidebar', async () => {
    const w = await createWorld()
    const body = await sidebarAs(w.member)
    assertContains(body, [w.P.name])
    assertNoLeak(body, [w.Q.name, w.Q.id, w.C2.name, w.A.id, w.A.name])
  })

  it('member: /projects and /clients have nothing of Q or C2', async () => {
    const w = await createWorld()
    const user = asUser(w.member)
    for (const archived of [false, true]) {
      assertNoLeak(await services.projects.listProjectsForViewer(db, user, { archived }), [
        w.Q.name,
        w.Q.id,
        w.C2.name,
        w.C2.id,
      ])
    }
    const list = await services.clients.listClientsForViewer(db, user, { includeArchived: false })
    assertNoLeak(list, [w.Q.name, w.Q.id, w.C2.name, w.C2.id])
    const detail = await services.clients.getClientDetail(db, user, w.C1.id)
    assertNoLeak(detail, [w.Q.name, w.Q.id, w.C2.name, w.C2.id])
  })

  it('people options (X09): names allowed, no project names, no email key', async () => {
    const w = await createWorld()
    asUser(w.outsider)
    const body = await okJson<PeopleOptionsResponse>(await callRoute(getPeopleOptions, '/api/people/options'))
    assertContains(body, [w.lead.name, w.member.name, w.manager.name])
    assertNoLeak(body, [w.P.name, w.Q.name, w.A.name, w.P.id, w.Q.id, w.A.id, w.lead.email, w.member.email])
    expect(body.people.length).toBeGreaterThan(0)
    for (const person of body.people) {
      expect(Object.keys(person).sort()).toEqual([
        'active',
        'color',
        'id',
        'name',
        'nickname',
        'positionId', // M3 FR-665 (/tasks position filter); a position id is directory data, not project data
        'positionName',
      ])
    }
  })

  it('documented exception (X61, M2-D04): client options for P list every active client name but no project names', async () => {
    const w = await createWorld()
    asUser(w.lead)
    const body = await okJson(await callRoute(getClientOptions, `/api/clients/options?projectId=${w.P.id}`))
    assertContains(body, [w.C1.name, w.C2.name]) // C2 is Q's client: allowed by design (X61)
    assertNoLeak(body, [w.P.name, w.Q.name, w.A.name, w.Q.id, w.A.id, w.C3.name])
  })
})

/** Raw JSON body of a route call with its status (error bodies are checked for leaks too). */
async function bodyOf(res: Response): Promise<{ status: number; body: unknown }> {
  return { status: res.status, body: (await res.json()) as unknown }
}

describe('masking — tasks (M3, plan/m03 S4.3)', () => {
  /** Everything of P (live tasks, statuses, assignments) and A the outsider must never receive. */
  const pAndA = (w: World): string[] => {
    const t = w.tasks
    return [
      w.P.name,
      w.P.id,
      w.A.name,
      w.A.id,
      ...[t.pParent, t.pChildA, t.pChildB, t.pLeaf, t.pDone, t.aTask, t.aTask2].flatMap((x) => [
        x.name,
        x.id,
      ]),
      ...[w.deletedTasks.pDeleted, w.deletedTasks.aDeleted].flatMap((x) => [x.name, x.id]),
      w.statuses.P.pSecret.name,
      w.statuses.P.pSecret.id,
      w.statuses.P.todo.id,
      w.statuses.A.todo.id,
      w.assignments.pChildAMember.id,
      w.assignments.pLeafLead.id,
      w.assignments.aTaskMember.id,
      w.blockers.pLeafByChildA.id,
    ]
  }
  /** Everything of Q P's team must never receive. */
  const qOnly = (w: World): string[] => [
    w.Q.name,
    w.Q.id,
    w.tasks.qTask.name,
    w.tasks.qTask.id,
    w.statuses.Q.waitData.name,
    w.statuses.Q.waitData.id,
    w.statuses.Q.todo.id,
    w.assignments.qTaskOutsider.id,
  ]

  it('fixture sanity: the secret names are the distinctive ones S0.15 promised', async () => {
    const w = await createWorld({ with: ['tasks'] })
    expect(w.tasks.pParent.name).toBe('งานแม่ P-ลับ01')
    expect(w.tasks.qTask.name).toBe('งาน Q-ลับ02')
    expect(w.statuses.P.pSecret.name).toBe('สถานะลับ P-03')
    expect(w.statuses.Q.waitData.name).toBe('สถานะลับ Q-04')
  })

  it('outsider: GET /api/projects/{P}/tasks → 404 without any P task name or id', async () => {
    const w = await createWorld({ with: ['tasks'] })
    asUser(w.outsider)
    const { status, body } = await bodyOf(
      await callRoute(getProjectTasks, `/api/projects/${w.P.id}/tasks`, { id: w.P.id }),
    )
    expect(status).toBe(404)
    assertNoLeak(body, pAndA(w))
  })

  it('outsider: GET /api/projects/{P}/statuses → 404 without “สถานะลับ P-03”', async () => {
    const w = await createWorld({ with: ['tasks'] })
    asUser(w.outsider)
    const { status, body } = await bodyOf(
      await callRoute(getProjectStatuses, `/api/projects/${w.P.id}/statuses`, { id: w.P.id }),
    )
    expect(status).toBe(404)
    assertNoLeak(body, pAndA(w))
  })

  it('outsider: GET /api/tasks/my has only Q content (งาน Q-ลับ02), nothing of P or A', async () => {
    const w = await createWorld({ with: ['tasks'] })
    asUser(w.outsider)
    const body = await okJson<MyTasksResponse>(await callRoute(getMyTasks, '/api/tasks/my'))
    assertContains(body, [w.tasks.qTask.name])
    assertNoLeak(body, pAndA(w))
    expect(body.groups.map((g) => g.project.id)).toEqual([w.Q.id])
  })

  it('outsider: GET /api/sidebar (with tasks) has no P/A task names; member: none of Q', async () => {
    const w = await createWorld({ with: ['tasks'] })
    assertNoLeak(await sidebarAs(w.outsider), pAndA(w))
    assertNoLeak(await sidebarAs(w.member), qOnly(w))
  })

  it('outsider: GET /api/tasks (no filter) → only Q cards; no P/A names, ids or “สถานะลับ P-03”', async () => {
    const w = await createWorld({ with: ['tasks'] })
    asUser(w.outsider)
    const body = await okJson<TeamTasksResponse>(await callRoute(getTeamTasks, '/api/tasks'))
    assertContains(body, [w.tasks.qTask.name])
    assertNoLeak(body, pAndA(w))
    expect(body.cards.length).toBeGreaterThan(0)
    expect(new Set(body.cards.map((c) => c.projectId))).toEqual(new Set([w.Q.id]))
    expect(body.projects.map((p) => p.id)).toEqual([w.Q.id])
    expect(Object.keys(body.statusesByProject)).toEqual([w.Q.id])
  })

  it('outsider: GET /api/tasks?projectId={P} → 404 without names', async () => {
    const w = await createWorld({ with: ['tasks'] })
    asUser(w.outsider)
    const { status, body } = await bodyOf(await callRoute(getTeamTasks, `/api/tasks?projectId=${w.P.id}`))
    expect(status).toBe(404)
    // P's id is the caller's own input; nothing else of P or A may come back
    assertNoLeak(
      body,
      pAndA(w).filter((s) => s !== w.P.id),
    )
  })

  it('member: GET /api/projects/{Q}/tasks and …/statuses → 404 without “งาน Q-ลับ02” / “สถานะลับ Q-04”', async () => {
    const w = await createWorld({ with: ['tasks'] })
    asUser(w.member)
    const tasksRes = await bodyOf(
      await callRoute(getProjectTasks, `/api/projects/${w.Q.id}/tasks`, { id: w.Q.id }),
    )
    expect(tasksRes.status).toBe(404)
    assertNoLeak(
      tasksRes.body,
      qOnly(w).filter((s) => s !== w.Q.id),
    )
    const statusesRes = await bodyOf(
      await callRoute(getProjectStatuses, `/api/projects/${w.Q.id}/statuses`, { id: w.Q.id }),
    )
    expect(statusesRes.status).toBe(404)
    assertNoLeak(
      statusesRes.body,
      qOnly(w).filter((s) => s !== w.Q.id),
    )
  })

  it('member: GET /api/tasks has P content and nothing of Q (no “งาน Q-ลับ02”, no “สถานะลับ Q-04”)', async () => {
    const w = await createWorld({ with: ['tasks'] })
    asUser(w.member)
    const body = await okJson<TeamTasksResponse>(await callRoute(getTeamTasks, '/api/tasks'))
    assertContains(body, [w.tasks.pLeaf.name])
    assertNoLeak(body, qOnly(w))
    for (const c of body.cards)
      expect(c.projectId, 'M3-D33: archived A is excluded, Q is invisible').toBe(w.P.id)
  })

  it('lead: addTaskBlocker(pLeaf ← qTask) → 404 and the error body names nothing of Q', async () => {
    const w = await createWorld({ with: ['tasks'] })
    asUser(w.lead)
    const res = await addTaskBlocker({ taskId: w.tasks.pLeaf.id, blockerTaskId: w.tasks.qTask.id })
    expect(outcomeOf(res)).toBe('404')
    assertNoLeak(
      res,
      qOnly(w).filter((s) => s !== w.tasks.qTask.id),
    ) // the id is the caller's own input
  })

  it('member: GET /api/projects/{P}/tasks → blockerEdges only between live P tasks; nothing of Q', async () => {
    const w = await createWorld({ with: ['tasks'] })
    // a live edge to a soft-deleted P task must not surface either (X62 flat, live tasks only)
    await makeBlocker({ task: w.tasks.pChildB, blocker: w.deletedTasks.pDeleted, createdBy: w.manager })
    asUser(w.member)
    const body = await okJson<ProjectTasksResponse>(
      await callRoute(getProjectTasks, `/api/projects/${w.P.id}/tasks`, { id: w.P.id }),
    )
    assertNoLeak(body, [...qOnly(w), w.deletedTasks.pDeleted.name, w.deletedTasks.pDeleted.id])
    const live = new Set(body.tasks.map((t) => t.id))
    expect(body.tasks.every((t) => t.projectId === w.P.id)).toBe(true)
    expect(body.blockerEdges.length).toBeGreaterThan(0)
    for (const e of body.blockerEdges) {
      expect(live.has(e.taskId) && live.has(e.blockerTaskId), `edge ${e.id} between live P tasks`).toBe(true)
    }
    expect(body.blockerEdges.map((e) => e.id)).toEqual([w.blockers.pLeafByChildA.id])
  })
})

describe('masking — golden (r6a M2-17, r8 §4.3)', () => {
  beforeEach(async () => {
    await seedGolden(db)
  })

  async function forbidden(names: readonly GoldenProject[]): Promise<string[]> {
    const out: string[] = []
    for (const n of names) out.push(n, await goldenProjectId(n))
    return out
  }

  it('Peter: sidebar and /projects contain none of POS, Mobile, CRM (names or ids)', async () => {
    const peter = await goldenUser('Peter')
    const hidden = await forbidden(['POS Upgrade', 'Mobile App Revamp', 'CRM Migration'])
    const body = await sidebarAs(peter)
    assertContains(body, ['Data Warehouse', 'Store Analytics Dashboard'])
    assertNoLeak(body, hidden)
    assertNoLeak(
      await services.projects.listProjectsForViewer(db, asUser(peter), { archived: false }),
      hidden,
    )
  })

  it('Ivy: sidebar and /projects contain none of DW, Mobile, Store (names or ids)', async () => {
    const ivy = await goldenUser('Ivy')
    const hidden = await forbidden(['Data Warehouse', 'Mobile App Revamp', 'Store Analytics Dashboard'])
    const body = await sidebarAs(ivy)
    assertContains(body, ['POS Upgrade', 'CRM Migration'])
    assertNoLeak(body, hidden)
    assertNoLeak(await services.projects.listProjectsForViewer(db, asUser(ivy), { archived: false }), hidden)
  })

  it('Cindy: the Coral client page lists POS but not Data Warehouse (Coral project Cindy is not in)', async () => {
    const cindy = asUser(await goldenUser('Cindy'))
    const coral = (await services.clients.listClientsForViewer(db, cindy, { includeArchived: false })).find(
      (c) => c.name === 'Coral',
    )
    expect(coral).toBeDefined()
    expect(coral!.projectCount, 'counts only the viewer’s projects (no hint of DW)').toBe(1)
    const detail = await services.clients.getClientDetail(db, cindy, coral!.id)
    assertContains(detail, ['POS Upgrade'])
    assertNoLeak(detail, await forbidden(['Data Warehouse']))
  })

  it('Peter: GET /api/tasks and /api/tasks/my contain no POS, Mobile or CRM project/task names or ids (AC-616)', async () => {
    const peter = await goldenUser('Peter')
    const hiddenProjects: GoldenProject[] = ['POS Upgrade', 'Mobile App Revamp', 'CRM Migration']
    const hidden = [...(await forbidden(hiddenProjects)), ...goldenTaskNames(hiddenProjects)]
    expect(goldenTaskNames(hiddenProjects)).toEqual(
      expect.arrayContaining(['ปรับปรุงระบบ POS หน้าร้าน', 'ย้ายข้อมูลลูกค้า']),
    )
    asUser(peter)
    const team = await okJson<TeamTasksResponse>(await callRoute(getTeamTasks, '/api/tasks'))
    assertContains(team, goldenTaskNames(['Data Warehouse', 'Store Analytics Dashboard']))
    assertNoLeak(team, hidden)
    const my = await okJson<MyTasksResponse>(await callRoute(getMyTasks, '/api/tasks/my'))
    assertNoLeak(my, hidden)
  })
})
