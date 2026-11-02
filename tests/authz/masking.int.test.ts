// tests/authz/masking.int.test.ts — MASK-7 / X30 leak tests (SPEC §3.3 "ห้ามส่งชื่อโปรเจคหรือ task ไปที่ client",
// §11.2 `JSON.stringify(res).includes(name) === false`, CLAUDE.md › สิทธิ์). Every read endpoint/loader that can carry
// other people's data is requested as a viewer who must not see a project; the serialized payload must contain none
// of its names or ids. M2: sidebar, project list, client list/detail, people options, client options.
// M3 (plan/m03 S4.3): project tasks, project statuses, /api/tasks/my, team tasks /api/tasks, sidebar count, and the
// error body of a cross-project blocker. Later milestones append describe blocks (M5 calendar, M6 grid, M9
// workload/person, M10 search/home). plan/m02-clients-projects-authz.md S3.4.
// M6 (plan/m06 S5.2): project grid (leave labels, otherProjects numbers only) and plan-save error bodies.
// M7.1 (plan/m07.1 S5.2): the load chart (computed from the same grid chunk, M7.1-D3 — numbers only for other projects)
// and the plan-markers route (markers are per project, §3.3).
// M6.1 (plan/m06.1 S6.3): task bodies — task search group, page trees/titles without TASK pages, body/page/lease/file
// 404 bodies, hasBody without body text, /my statusesByProject of the viewer's projects only.
import { readFileSync } from 'node:fs'
import { beforeEach, describe, expect, it } from 'vitest'
import { GET as getClientOptions } from '@/app/api/clients/options/route'
import { GET as getPeopleOptions } from '@/app/api/people/options/route'
import { GET as getProjectStatuses } from '@/app/api/projects/[id]/statuses/route'
import { GET as getProjectTasks } from '@/app/api/projects/[id]/tasks/route'
import { GET as getSidebar } from '@/app/api/sidebar/route'
import { GET as getMyTasks } from '@/app/api/tasks/my/route'
import { GET as getTeamTasks } from '@/app/api/tasks/route'
import { eq, sql } from 'drizzle-orm'
import { th } from '@/i18n/th'
import type {
  CalendarResponse,
  CalendarTimeOffFull,
  CalendarTimeOffMasked,
} from '@/lib/contracts/calendar'
import type { GridPerson, GridResponse, SaveItemResult } from '@/lib/contracts/grid'
import type { PlanMarkersResponse } from '@/lib/contracts/plan-markers'
import type { PageTitlesResponse, PageTreeResponse, PageView } from '@/lib/contracts/pages'
import type { PeopleOptionsResponse } from '@/lib/contracts/people'
import type { SearchResponse } from '@/lib/contracts/search'
import type { MyTasksResponse, ProjectTasksResponse, TeamTasksResponse } from '@/lib/contracts/tasks'
import { createPage, movePage } from '@/server/actions/pages'
import { addTaskBlocker } from '@/server/actions/task-blockers'
import { db } from '@/server/db/client'
import {
  pageLocks,
  timeOff,
  type LeaveTypeRow,
  type PageRow,
  type TimeOffRow,
} from '@/server/db/schema'
import * as services from '@/server/services'
import { addDayExample, applyFixture, DAY_EXAMPLE, GOLDEN_PATH, seedGolden } from '../../scripts/lib/fixtures'
import { asUser } from '../helpers/as-user'
import { allocationRows, makeBlocker, makePage, makePlanMarker, type TestUser } from '../helpers/factories'
import { outcomeOf } from '../helpers/outcome'
import { createWorld, type World } from '../helpers/world'
import { goldenProjectId, goldenTaskNames, goldenUser, type GoldenProject } from './_support/golden'
import { callRoute, okJson } from './_support/http'
import { assertContains, assertNoLeak } from './_support/leak'
import { fileGet, lockCall, pageGet, searchGet, titlesGet, treeGet } from './rows/_m4'
import { calendarGet } from './rows/_m5'
import { gridGet, save, weekItem } from './rows/_m6'
import { bodyGet } from './rows/_m6_1'
import { markersGet } from './rows/_m7_1'

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

describe('masking — pages (M4, plan/m04 S4.6, K1–K14)', () => {
  const UUID_G = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g
  const q = (s: string) => encodeURIComponent(s)

  /** World pages + files, plus a wiki page "อ้างอิง W-06" whose content mentions pPage and holds a card to pChild. */
  async function pagesWorld(): Promise<{ w: World; ref: PageRow }> {
    const w = await createWorld({ with: ['pages', 'files'] })
    const ref = await makePage({
      title: 'อ้างอิง W-06',
      createdBy: w.manager,
      content: [
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: 'ดูหน้า ', styles: {} },
            { type: 'mention', props: { kind: 'page', id: w.pages.pPage.id } },
          ],
        },
        { type: 'subpage', props: { pageId: w.pages.pChild.id } },
      ],
    })
    return { w, ref }
  }

  /** Titles, content, file names and project names of P and A (never ids). */
  const pTitles = (w: World): string[] => [
    w.pages.pCharter.title,
    w.pages.pPage.title,
    w.pages.pChild.title,
    w.pages.aPage.title,
    w.deletedPages.pDeleted.title,
    w.deletedPages.aDeleted.title,
    w.deletedPages.pOldDeleted.title,
    'เนื้อหา P-ลับ06',
    w.files.pPdf.originalName,
    w.P.name,
    w.A.name,
  ]
  /** M4-D32: everything above plus the P/A ids — for bodies that are not page content. */
  const forbiddenP = (w: World): string[] => [
    ...pTitles(w),
    w.P.id,
    w.A.id,
    w.pages.pCharter.id,
    w.pages.pPage.id,
    w.pages.pChild.id,
    w.pages.aPage.id,
    w.deletedPages.pDeleted.id,
    w.files.pImage.id,
    w.files.pPdf.id,
    w.files.aFile.id,
  ]
  /** Everything of Q P's team must never receive. */
  const forbiddenQ = (w: World): string[] => [
    w.pages.qPage.title,
    'เนื้อหา Q-ลับ09',
    w.Q.name,
    w.Q.id,
    w.pages.qPage.id,
    w.files.qFile.id,
  ]

  async function search(query: string): Promise<SearchResponse> {
    return okJson<SearchResponse>(await searchGet(query))
  }

  it('fixture sanity: the secret titles are the distinctive ones S0.15 promised', async () => {
    const { w } = await pagesWorld()
    expect(w.pages.pPage.title).toBe('หน้า P-ลับ05')
    expect(w.pages.qPage.title).toBe('หน้า Q-ลับ08')
    expect(w.pages.aPage.title).toBe('หน้า A-ลับ10')
    expect(w.deletedPages.pDeleted.title).toBe('ลบแล้ว P')
    expect(w.files.pPdf.originalName).toBe('สัญญา.pdf')
  })

  it('K1 outsider: GET /api/search?q=ลับ → only the Q title hit, nothing of P or A', async () => {
    const { w } = await pagesWorld()
    asUser(w.outsider)
    const body = await search(`q=${q('ลับ')}`)
    assertNoLeak(body, forbiddenP(w))
    expect(body.pages).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: w.pages.qPage.id, title: w.pages.qPage.title, matchedIn: 'title', subtitle: w.Q.name }),
      ]),
    )
  })

  it('K2 outsider: GET /api/search?q=เนื้อหา (content path) → Q content hit, nothing of P', async () => {
    const { w } = await pagesWorld()
    asUser(w.outsider)
    const body = await search(`q=${q('เนื้อหา')}`)
    assertNoLeak(body, forbiddenP(w))
    expect(body.pages).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: w.pages.qPage.id, matchedIn: 'content' })]),
    )
  })

  it('K3 outsider: mention suggestions (?titleOnly=1) → Q title hit, no content hits, nothing of P', async () => {
    const { w } = await pagesWorld()
    asUser(w.outsider)
    const body = await search(`q=${q('หน้า')}&titleOnly=1`)
    assertNoLeak(body, forbiddenP(w))
    expect(body.pages.map((h) => h.id)).toContain(w.pages.qPage.id)
    expect(body.pages.filter((h) => h.matchedIn === 'content')).toEqual([])
  })

  it('K4 outsider: GET /api/search?q=W- → wiki pages (subtitle Wiki ทีม), nothing of P', async () => {
    // plan K4 says q=W-0; S0.15 titled the protected root "นโยบาย W-ล็อก03", which "W-0" does not match → "W-".
    const { w } = await pagesWorld()
    asUser(w.outsider)
    const body = await search(`q=${q('W-')}`)
    assertNoLeak(body, forbiddenP(w))
    for (const page of [w.pages.wiki, w.pages.wikiProtected])
      expect(body.pages).toEqual(
        expect.arrayContaining([expect.objectContaining({ id: page.id, title: page.title, subtitle: th.palette.wiki })]),
      )
  })

  it('K5 outsider: GET /api/pages/titles → P/A ids answer exactly { id, visible:false }; Q and wiki are titled', async () => {
    const { w } = await pagesWorld()
    asUser(w.outsider)
    const hidden = [w.pages.pPage, w.pages.pChild, w.pages.aPage, w.deletedPages.pDeleted]
    const body = await okJson<PageTitlesResponse>(
      await titlesGet([...hidden.map((p) => p.id), w.pages.qPage.id, w.pages.wiki.id]),
    )
    assertNoLeak(body, [...pTitles(w), w.pages.pCharter.id, w.files.pImage.id, w.files.pPdf.id, w.files.aFile.id])
    for (const p of hidden) expect(body.items.find((i) => i.id === p.id)).toEqual({ id: p.id, visible: false })
    expect(body.items.find((i) => i.id === w.pages.qPage.id)).toMatchObject({ visible: true, title: w.pages.qPage.title })
    expect(body.items.find((i) => i.id === w.pages.wiki.id)).toMatchObject({ visible: true, title: w.pages.wiki.title })
  })

  it('K6 outsider: P tree and a P parent under Q → 404 with an error body only', async () => {
    const { w } = await pagesWorld()
    asUser(w.outsider)
    const tree = await bodyOf(await treeGet(`space=PROJECT&projectId=${w.P.id}`))
    expect(tree.status).toBe(404)
    assertNoLeak(tree.body, forbiddenP(w)) // not even the requested project id is echoed
    const child = await bodyOf(
      await treeGet(`space=PROJECT&projectId=${w.Q.id}&parentId=${w.pages.pPage.id}`),
    )
    expect(child.status).toBe(404)
    assertNoLeak(child.body, forbiddenP(w))
  })

  it('K7 outsider: GET /api/pages/{pPage} and its lease → 404, no title and no lease holder', async () => {
    const { w } = await pagesWorld()
    await db.insert(pageLocks).values({
      pageId: w.pages.pPage.id,
      userId: w.lead.id,
      expiresAt: sql`now() + interval '2 minutes'`,
    })
    asUser(w.outsider)
    for (const res of [await pageGet(w.pages.pPage.id), await lockCall('GET', w.pages.pPage.id)]) {
      const { status, body } = await bodyOf(res)
      expect(status).toBe(404)
      assertNoLeak(body, [...forbiddenP(w), w.lead.name, w.lead.id])
    }
  })

  it('K8 outsider: GET /api/files/{pImage|pPdf|aFile} → 404 without bytes, name or Content-Disposition', async () => {
    const { w } = await pagesWorld()
    asUser(w.outsider)
    for (const file of [w.files.pImage, w.files.pPdf, w.files.aFile]) {
      const res = await fileGet(file.id)
      expect(res.status, file.originalName).toBe(404)
      expect(res.headers.get('content-disposition')).toBeNull()
      const text = await res.text()
      for (const s of ['%PDF', 'PNG', w.files.pPdf.originalName, file.storageKey]) expect(text).not.toContain(s)
      assertNoLeak(text, forbiddenP(w))
    }
  })

  it('K9 outsider: wiki tree + a wiki page that references P → wiki titles only; content keeps the P ids (M4-D32)', async () => {
    const { w, ref } = await pagesWorld()
    asUser(w.outsider)
    const tree = await okJson<PageTreeResponse>(await treeGet('space=WORKSPACE'))
    assertContains(tree, [w.pages.wiki.title, w.pages.wikiProtected.title, w.pages.wikiFolder.title, ref.title])
    assertNoLeak(tree, forbiddenP(w))
    const view = await okJson<PageView>(await pageGet(ref.id))
    assertNoLeak(view, pTitles(w))
    const ids = new Set(JSON.stringify(view.page.content).match(UUID_G) ?? [])
    expect(ids).toEqual(new Set([w.pages.pPage.id, w.pages.pChild.id]))
  })

  it('K10 outsider: titles of the two ids found in that content → { visible:false } × 2, no P titles', async () => {
    const { w, ref } = await pagesWorld()
    asUser(w.outsider)
    const view = await okJson<PageView>(await pageGet(ref.id))
    const ids = [...new Set(JSON.stringify(view.page.content).match(UUID_G) ?? [])]
    expect(ids).toHaveLength(2)
    const body = await okJson<PageTitlesResponse>(await titlesGet(ids))
    assertNoLeak(body, pTitles(w))
    expect(body.items).toEqual(expect.arrayContaining(ids.map((id) => ({ id, visible: false }))))
    expect(body.items).toHaveLength(2)
  })

  it('K11 member: search q=ลับ / q=เนื้อหา → P (incl. archived A, X43) and nothing of Q; deleted pages never listed', async () => {
    const { w } = await pagesWorld()
    asUser(w.member)
    const titles = await search(`q=${q('ลับ')}`)
    assertNoLeak(titles, forbiddenQ(w))
    assertContains(titles, [w.pages.pPage.title, w.pages.aPage.title])
    const content = await search(`q=${q('เนื้อหา')}`)
    assertNoLeak(content, forbiddenQ(w))
    expect(content.pages).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: w.pages.pPage.id, matchedIn: 'content' })]),
    )
    const deleted = await search(`q=${q('ลบ')}`)
    assertNoLeak(deleted, [
      w.deletedPages.pDeleted.title,
      w.deletedPages.pDeleted.id,
      w.deletedPages.aDeleted.id,
      w.deletedPages.wikiDeleted.id,
      w.deletedPages.pOldDeleted.id,
    ])
  })

  it('K12 member: Q file, Q page and Q title → 404 · 404 · { visible:false }', async () => {
    const { w } = await pagesWorld()
    asUser(w.member)
    const file = await fileGet(w.files.qFile.id)
    expect(file.status).toBe(404)
    assertNoLeak(await file.text(), forbiddenQ(w).filter((s) => s !== w.files.qFile.id))
    const page = await bodyOf(await pageGet(w.pages.qPage.id))
    expect(page.status).toBe(404)
    assertNoLeak(page.body, forbiddenQ(w).filter((s) => s !== w.pages.qPage.id))
    const titles = await okJson<PageTitlesResponse>(await titlesGet([w.pages.qPage.id]))
    expect(titles.items).toEqual([{ id: w.pages.qPage.id, visible: false }])
    assertNoLeak(titles, forbiddenQ(w).filter((s) => s !== w.pages.qPage.id))
  })

  it('K13 lead: create/move under a Q page → NOT_FOUND (M4-D31) and the error names nothing of Q', async () => {
    const { w } = await pagesWorld()
    asUser(w.lead)
    const created = await createPage({ space: 'PROJECT', projectId: w.P.id, parentId: w.pages.qPage.id })
    expect(created).toMatchObject({ ok: false, code: 'NOT_FOUND' })
    assertNoLeak(created, forbiddenQ(w).filter((s) => s !== w.pages.qPage.id))
    const moved = await movePage({ pageId: w.pages.pChild.id, parentId: w.pages.qPage.id, afterId: null })
    expect(moved).toMatchObject({ ok: false, code: 'NOT_FOUND' })
    assertNoLeak(moved, forbiddenQ(w).filter((s) => s !== w.pages.qPage.id))
  })

  it('K14 outsider: q=% and q=_ are literal (escaped) — only titles containing them, nothing of P', async () => {
    const { w } = await pagesWorld()
    const percent = await makePage({ title: 'ส่วนลด 100% W', createdBy: w.manager })
    const underscore = await makePage({ title: 'ชื่อไฟล์ a_b W', createdBy: w.manager })
    asUser(w.outsider)
    for (const [ch, page] of [
      ['%', percent],
      ['_', underscore],
    ] as const) {
      const body = await search(`q=${q(ch)}`)
      assertNoLeak(body, forbiddenP(w))
      expect(body.pages.map((h) => h.id)).toContain(page.id)
      for (const hit of body.pages) expect(hit.title, `hit for ${ch}`).toContain(ch)
    }
  })
})

// ── M5 calendar (plan/m05 S4.3, MASK-5 / MASK-7, X43, M5-D7) ──────────────────────────────────────────────────────
// GET /api/calendar returns only the leave of visibleUserIds(viewer); other people's entries are
// `{ kind:'masked', userId, startDate, endDate, half, label:'ลา' }` — no entry id, type id/name, colour or note.

type LeaveSecrets = Record<'coworker' | 'pOnly' | 'member', string[]>

/** Per live world entry: its note, type name, type colour, entry id and type id (none may reach a masked viewer). */
function leaveSecrets(w: World): LeaveSecrets {
  return {
    coworker: ['โน้ตลับ-โลก-01', 'ลาพักร้อน-โลก', '#0369A1', w.timeOff.coworker.id, w.leaveTypes.vacation.id],
    pOnly: ['โน้ตลับ-โลก-02', 'ลาป่วย-โลก', '#B91C1C', w.timeOff.pOnly.id, w.leaveTypes.sick.id],
    member: ['โน้ตของ member', 'อบรม-โลก', '#7E22CE', w.timeOff.member.id, w.leaveTypes.training.id],
  }
}

const maskedLeave = (
  userId: string,
  startDate: string,
  endDate: string,
  half: 'AM' | 'PM' | null,
): CalendarTimeOffMasked => ({ kind: 'masked', userId, startDate, endDate, half, label: th.masking.leave })

const fullLeave = (e: TimeOffRow, t: LeaveTypeRow): CalendarTimeOffFull => ({
  kind: 'full',
  id: e.id,
  userId: e.userId,
  startDate: e.startDate,
  endDate: e.endDate,
  half: e.half,
  leaveTypeId: t.id,
  leaveTypeName: t.name,
  leaveTypeColor: t.color,
  leaveTypeArchived: t.archivedAt !== null,
  note: e.note,
})

const leaveOf = (body: CalendarResponse, userId: string) => body.timeOff.filter((e) => e.userId === userId)

describe('masking — calendar (M5, plan/m05 S4.3)', () => {
  const FROM = '2026-11-02'
  const TO = '2026-11-30'

  async function calendarAs(u: TestUser): Promise<CalendarResponse> {
    asUser(u)
    return okJson<CalendarResponse>(await calendarGet(FROM, TO))
  }

  /** Every viewer: the holiday, no soft-deleted entry (coworker · 2026-11-23), people = users with entries only. */
  function common(body: CalendarResponse, viewer: TestUser, canEditOthers: boolean): void {
    expect(body).toMatchObject({ from: FROM, to: TO, viewer: { userId: viewer.id, canEditOthers } })
    expect(body.holidays).toEqual([{ date: '2026-11-20', name: 'วันหยุดโลก' }])
    expect(body.timeOff.filter((e) => e.startDate === '2026-11-23'), 'soft-deleted leave').toEqual([])
    expect(Object.keys(body.people).sort()).toEqual([...new Set(body.timeOff.map((e) => e.userId))].sort())
    expect(
      body.timeOff.map((e) => e.startDate),
      'sorted by startDate',
    ).toEqual([...body.timeOff.map((e) => e.startDate)].sort())
  }

  it('member: coworker and pOnly masked (half kept), own entry in full; no other note, type, colour or id', async () => {
    const w = await createWorld({ with: ['timeOff'] })
    const { coworker, pOnly } = w.users
    const s = leaveSecrets(w)
    const body = await calendarAs(w.member)
    common(body, w.member, false)
    expect(leaveOf(body, coworker!.id)).toStrictEqual([
      maskedLeave(coworker!.id, '2026-11-09', '2026-11-10', null),
    ])
    expect(leaveOf(body, pOnly!.id)).toStrictEqual([maskedLeave(pOnly!.id, '2026-11-16', '2026-11-16', 'PM')])
    expect(leaveOf(body, w.member.id)).toStrictEqual([fullLeave(w.timeOff.member, w.leaveTypes.training)])
    expect(body.timeOff).toHaveLength(3)
    assertNoLeak(body, [...s.coworker, ...s.pOnly])
    assertContains(body, ['อบรม-โลก', 'โน้ตของ member'])
  })

  it('outsider: coworker masked; pOnly and member (no shared project) absent entirely', async () => {
    const w = await createWorld({ with: ['timeOff'] })
    const { coworker, pOnly } = w.users
    const s = leaveSecrets(w)
    const body = await calendarAs(w.outsider)
    common(body, w.outsider, false)
    expect(body.timeOff).toStrictEqual([maskedLeave(coworker!.id, '2026-11-09', '2026-11-10', null)])
    expect(Object.keys(body.people)).toEqual([coworker!.id])
    const hiddenPeople = [pOnly!, w.member].flatMap((u) => [u.id, u.name, ...(u.nickname ? [u.nickname] : [])])
    assertNoLeak(body, [...s.coworker, ...s.pOnly, ...s.member, ...hiddenPeople])
  })

  it('lead (LEAD of P → everyone visible): every entry masked, none of the details', async () => {
    const w = await createWorld({ with: ['timeOff'] })
    const { coworker, pOnly } = w.users
    const s = leaveSecrets(w)
    const body = await calendarAs(w.lead)
    common(body, w.lead, false)
    expect(body.timeOff).toStrictEqual([
      maskedLeave(w.member.id, '2026-11-02', '2026-11-02', null),
      maskedLeave(coworker!.id, '2026-11-09', '2026-11-10', null),
      maskedLeave(pOnly!.id, '2026-11-16', '2026-11-16', 'PM'),
    ])
    assertNoLeak(body, [...s.coworker, ...s.pOnly, ...s.member])
  })

  it('manager: every entry in full, including notes', async () => {
    const w = await createWorld({ with: ['timeOff'] })
    const { coworker, pOnly } = w.users
    const body = await calendarAs(w.manager)
    common(body, w.manager, true)
    expect(leaveOf(body, w.member.id)).toStrictEqual([fullLeave(w.timeOff.member, w.leaveTypes.training)])
    expect(leaveOf(body, coworker!.id)).toStrictEqual([fullLeave(w.timeOff.coworker, w.leaveTypes.vacation)])
    expect(leaveOf(body, pOnly!.id)).toStrictEqual([fullLeave(w.timeOff.pOnly, w.leaveTypes.sick)])
    expect(body.people[pOnly!.id]).toMatchObject({ id: pOnly!.id, active: true })
  })

  it('coworker: own entry in full, others masked; the own soft-deleted entry stays out', async () => {
    const w = await createWorld({ with: ['timeOff'] })
    const { coworker, pOnly } = w.users
    const s = leaveSecrets(w)
    const body = await calendarAs(coworker!)
    common(body, coworker!, false)
    expect(leaveOf(body, coworker!.id)).toStrictEqual([fullLeave(w.timeOff.coworker, w.leaveTypes.vacation)])
    expect(leaveOf(body, pOnly!.id)).toStrictEqual([maskedLeave(pOnly!.id, '2026-11-16', '2026-11-16', 'PM')])
    expect(leaveOf(body, w.member.id)).toStrictEqual([maskedLeave(w.member.id, '2026-11-02', '2026-11-02', null)])
    assertNoLeak(body, [...s.pOnly, ...s.member])
  })
})

describe('masking — calendar golden (M5, plan/m05 S4.3, r8 §4.3)', () => {
  // The October 2026 month view: 6 Monday-first weeks from weekStart('2026-10-01') (M5-D8).
  const FROM = '2026-09-28'
  const TO = '2026-11-09'
  /** th.leaveTypes.defaults[0] — the type every golden fixture's leave uses (M5-D12). */
  const VACATION = th.leaveTypes.defaults[0]
  /** expected.F2.setup.holidays of the golden JSON (never re-typed). */
  const F2_HOLIDAYS = (
    JSON.parse(readFileSync(GOLDEN_PATH, 'utf8')) as {
      expected: { F2: { setup: { holidays: { date: string; name: string }[] } } }
    }
  ).expected.F2.setup.holidays

  async function goldenCalendar(nickname: Parameters<typeof goldenUser>[0]): Promise<CalendarResponse> {
    asUser(await goldenUser(nickname))
    return okJson<CalendarResponse>(await calendarGet(FROM, TO))
  }

  async function entryIdsOf(userId: string): Promise<string[]> {
    return (await db.select({ id: timeOff.id }).from(timeOff).where(eq(timeOff.userId, userId))).map((r) => r.id)
  }

  it('F4: Ivy sees Cindy’s leave only as "ลา" (no type, colour or id); Cindy and the manager see ลาพักร้อน', async () => {
    await seedGolden(db)
    await applyFixture(db, 'F4')
    const cindy = await goldenUser('Cindy')
    const ids = await entryIdsOf(cindy.id)
    expect(ids).toHaveLength(1)

    const ivy = await goldenCalendar('Ivy')
    expect(ivy.timeOff).toStrictEqual([maskedLeave(cindy.id, '2026-10-12', '2026-10-14', null)])
    assertNoLeak(ivy, [VACATION.name, VACATION.color, ...ids])

    for (const viewer of ['Cindy', 'Manager'] as const) {
      const body = await goldenCalendar(viewer)
      expect(body.timeOff, viewer).toMatchObject([
        { kind: 'full', id: ids[0], userId: cindy.id, startDate: '2026-10-12', endDate: '2026-10-14', half: null },
      ])
      assertContains(body, [VACATION.name])
    }
  })

  it('F3: Ivy and Mint get no trace of Peter; Jack (LEAD of his project) sees him masked; Peter sees ลาพักร้อน', async () => {
    await seedGolden(db)
    await applyFixture(db, 'F3')
    const peter = await goldenUser('Peter')
    const ids = await entryIdsOf(peter.id)
    expect(ids).toHaveLength(1)

    for (const viewer of ['Ivy', 'Mint'] as const) {
      const body = await goldenCalendar(viewer)
      expect(body.timeOff, viewer).toEqual([])
      assertNoLeak(body, ['Peter', peter.id, VACATION.name, ...ids])
    }

    const jack = await goldenCalendar('Jack')
    expect(jack.timeOff).toStrictEqual([maskedLeave(peter.id, '2026-10-05', '2026-10-06', null)])
    assertNoLeak(jack, [VACATION.name, VACATION.color, ...ids])

    const own = await goldenCalendar('Peter')
    expect(own.timeOff).toMatchObject([{ kind: 'full', id: ids[0], leaveTypeName: VACATION.name }])
  })

  it('F2: the holiday reaches every viewer; no leave at all', async () => {
    await seedGolden(db)
    await applyFixture(db, 'F2')
    for (const viewer of ['Ivy', 'Peter', 'Manager'] as const) {
      const body = await goldenCalendar(viewer)
      expect(body.holidays, viewer).toEqual(F2_HOLIDAYS)
      expect(body.timeOff, viewer).toEqual([])
    }
  })
})

// ── M6 grid (plan/m06 S5.2, MASK-5 / MASK-7, X29, X43) ─────────────────────────────────────────────────────────────
// GET /api/grid/project/[projectId]: the project must be visible (PERM-06); people are co-members (BR-60) whose leave
// labels are masked through canSeeLeaveDetails (th.masking.leave unless manager or self); `otherProjects` carries
// per-period { total, committed } only — never a project, task, status or assignment of another project.

const W6 = ['allocations'] as const

async function gridAs(u: TestUser, projectId: string, qs = ''): Promise<{ status: number; body: unknown }> {
  asUser(u)
  return bodyOf(await gridGet(projectId, qs))
}

async function gridOk(u: TestUser, projectId: string, qs = ''): Promise<GridResponse> {
  const { status, body } = await gridAs(u, projectId, qs)
  expect(status, JSON.stringify(body)).toBe(200)
  return body as GridResponse
}

function personOf(body: GridResponse, userId: string): GridPerson {
  const p = body.people[userId]
  expect(p, `people[${userId}]`).toBeDefined()
  return p!
}

/** GridTimeOff is an explicit literal (S2.2): no id, type id, colour or note may ride along. */
const TIME_OFF_KEYS = ['end', 'half', 'label', 'start']

describe('masking — grid (M6, plan/m06 S5.2)', () => {
  it('outsider: P’s grid is a 404 whose body has nothing of P (names, task names, task and assignment ids)', async () => {
    const w = await createWorld({ with: W6 })
    const t = w.tasks
    const a = w.assignments
    const secrets = [
      w.P.name,
      w.P.id,
      ...[t.pParent, t.pChildA, t.pChildB, t.pLeaf, t.pDone, t.pCoworker].flatMap((x) => [x.name, x.id]),
      ...[a.pChildAMember, a.pLeafLead, a.pDoneMember, a.pCoworker].map((x) => x.id),
    ]
    expect(t.pCoworker.name).toBe('งานร่วม P-ลับ03')
    for (const qs of ['from=2026-09-28&to=2026-11-23', '', 'from=2026-09-28&to=2026-11-23&includeOthers=1']) {
      const { status, body } = await gridAs(w.outsider, w.P.id, qs)
      expect(status, qs).toBe(404)
      assertNoLeak(body, secrets)
    }
    const archived = await gridAs(w.outsider, w.A.id, 'from=2026-09-28&to=2026-11-23')
    expect(archived.status).toBe(404)
    assertNoLeak(archived.body, [w.A.name, w.A.id, t.aTask.name, t.aTask.id, a.aTaskMember.id])
  })

  it('lead (not manager): the member’s leave is only "ลา" — no type, note, colour or id', async () => {
    const w = await createWorld({ with: W6 })
    const s = leaveSecrets(w)
    const body = await gridOk(w.lead, w.P.id, 'from=2026-10-26&to=2026-11-09')
    const leave = personOf(body, w.member.id).timeOff
    expect(leave).toStrictEqual([{ start: '2026-11-02', end: '2026-11-02', half: null, label: th.masking.leave }])
    assertNoLeak(body, [...s.member, ...s.coworker, ...s.pOnly])
  })

  it('member (self) and the manager see the leave type name; no entry carries more than start/end/half/label', async () => {
    const w = await createWorld({ with: W6 })
    for (const viewer of [w.member, w.manager]) {
      const body = await gridOk(viewer, w.P.id, 'from=2026-10-26&to=2026-11-09')
      const leave = personOf(body, w.member.id).timeOff
      expect(leave, viewer.nickname ?? viewer.id).toStrictEqual([
        { start: '2026-11-02', end: '2026-11-02', half: null, label: w.leaveTypes.training.name },
      ])
      for (const p of Object.values(body.people))
        for (const e of p.timeOff) expect(Object.keys(e).sort()).toEqual(TIME_OFF_KEYS)
      assertNoLeak(body, [w.timeOff.member.id, w.leaveTypes.training.id, w.leaveTypes.training.color])
    }
  })

  it('member + includeOthers=1: coworker’s Q load is numbers only — nothing of Q, its task, status or assignments', async () => {
    const w = await createWorld({ with: W6 })
    const coworker = w.users.coworker!
    const body = await gridOk(w.member, w.P.id, 'from=2026-09-28&to=2026-10-26&includeOthers=1')
    // P's own 100 (pCoworker) is excluded (excludeProjectId) → week 10-05 is Q's 300 only; Q is CONFIRMED
    expect(personOf(body, coworker.id).otherProjects?.['W:2026-10-05']).toEqual({ total: 300, committed: 300 })
    assertContains(body, [w.P.name])
    assertNoLeak(body, [
      w.Q.name,
      w.Q.id,
      w.C2.name,
      w.C2.id,
      w.tasks.qTask.name,
      w.tasks.qTask.id,
      w.assignments.qTaskCoworker.id,
      w.assignments.qTaskOutsider.id,
      w.statuses.Q.waitData.name,
      w.statuses.Q.waitData.id,
      w.outsider.id,
      w.outsider.name,
    ])
    expect(w.statuses.Q.waitData.name).toBe('สถานะลับ Q-04')
    // switch off → no other-projects aggregate at all (X29)
    const off = await gridOk(w.member, w.P.id, 'from=2026-09-28&to=2026-10-26')
    for (const p of Object.values(off.people)) expect(p.otherProjects).toBeUndefined()
  })

  it('save errors: a batch touching Q is a 404 without Q data; VERSION_CONFLICT `current` holds only request items', async () => {
    const w = await createWorld({ with: W6 })
    const a = w.assignments
    const qSecrets = [w.Q.name, w.Q.id, w.tasks.qTask.name, w.tasks.qTask.id, w.C2.name]
    asUser(w.lead)
    const cross = await save({
      items: [weekItem(a.pLeafLead.id, '2026-11-16', 200), weekItem(a.qTaskOutsider.id, '2026-11-16', 100)],
      clientOpId: 'mask-cross',
    })
    expect(outcomeOf(cross)).toBe('404')
    assertNoLeak(cross, qSecrets)
    expect(await allocationRows(a.pLeafLead.id, '2026-11-16'), 'all-or-nothing').toEqual([])

    // [archived-but-visible A, invisible Q] as member: the invisible project wins (404), whatever the id order —
    // a 403 here would tell the member that the Q assignment id exists (CLAUDE.md › สิทธิ์, SPEC §3.3)
    asUser(w.member)
    const archivedHidden = await save({
      items: [weekItem(a.aTaskMember.id, '2026-10-12', 100), weekItem(a.qTaskOutsider.id, '2026-11-16', 100)],
      clientOpId: 'mask-arch-hidden',
    })
    expect(outcomeOf(archivedHidden)).toBe('404')
    assertNoLeak(archivedHidden, qSecrets)
    asUser(w.lead)

    const requested = [a.pLeafLead.id, a.pCoworker.id]
    const stale = await save({
      items: [weekItem(a.pLeafLead.id, '2026-10-05', 100, 99), weekItem(a.pCoworker.id, '2026-10-05', 150, 1)],
      clientOpId: 'mask-stale',
    })
    expect(outcomeOf(stale)).toBe('409')
    const current = (stale as { current?: SaveItemResult[] }).current ?? []
    expect(current.map((c) => c.taskAssignmentId)).toContain(a.pLeafLead.id)
    for (const c of current) {
      expect(requested).toContain(c.taskAssignmentId)
      expect(Object.keys(c.weeks)).toEqual(['2026-10-05'])
    }
    assertNoLeak(stale, [
      ...qSecrets,
      a.qTaskCoworker.id,
      a.qTaskOutsider.id,
      a.pChildAMember.id,
      a.pDoneMember.id,
    ])
  })
})

describe('masking — grid golden (M6, plan/m06 S5.2, r8 §4.3)', () => {
  const OTHERS: GoldenProject[] = ['Data Warehouse', 'Mobile App Revamp', 'CRM Migration', 'Store Analytics Dashboard']

  it('Ivy, POS with includeOthers=1: Mint’s Mobile and Cindy’s CRM load are numbers only (no project/task name or id)', async () => {
    await seedGolden(db)
    const posId = await goldenProjectId('POS Upgrade')
    const body = await gridOk(await goldenUser('Ivy'), posId, 'from=2026-09-28&to=2026-10-26&includeOthers=1')
    const mint = await goldenUser('Mint')
    const cindy = await goldenUser('Cindy')
    expect(personOf(body, mint.id).otherProjects?.['W:2026-09-28']).toEqual({ total: 250, committed: 250 })
    expect(personOf(body, cindy.id).otherProjects?.['W:2026-10-05']).toEqual({ total: 250, committed: 0 })
    assertContains(body, ['POS Upgrade', ...goldenTaskNames(['POS Upgrade'])])
    const hidden: string[] = [...goldenTaskNames(OTHERS)]
    for (const n of OTHERS) hidden.push(n, await goldenProjectId(n))
    assertNoLeak(body, hidden)
  })

  it('Peter (not in POS): the POS grid is a 404 without POS names or ids', async () => {
    await seedGolden(db)
    const posId = await goldenProjectId('POS Upgrade')
    const { status, body } = await gridAs(await goldenUser('Peter'), posId, 'from=2026-09-28&to=2026-11-23')
    expect(status).toBe(404)
    assertNoLeak(body, ['POS Upgrade', posId, ...goldenTaskNames(['POS Upgrade'])])
  })
})

describe('masking — task bodies (M6.1, plan/m06.1 S6.3; FR-682, FR-687, FR-690, AC-624, AC-628)', () => {
  const q = (s: string) => encodeURIComponent(s)

  /** Body texts, ids and the TASK pages of P and A the outsider must never receive (task names: M3 block). */
  const pBodies = (w: World): string[] => [
    'P-ลับ', // every P secret, incl. the body text 'รายละเอียด P-ลับ11'
    'A-ลับ',
    w.P.name,
    w.P.id,
    w.A.name,
    w.A.id,
    w.tasks.pLeaf.id,
    w.tasks.aTask.id,
    w.taskBodies.pLeafBody.id,
    w.taskBodies.aTaskBody.id,
    w.taskBodies.pLeafBodyImage.id,
  ]
  /** Everything of Q P's team must never receive. */
  const qBodies = (w: World): string[] => [
    'Q-ลับ',
    w.Q.name,
    w.Q.id,
    w.tasks.qTask.id,
    w.taskBodies.qTaskBody.id,
  ]
  const search = async (query: string): Promise<SearchResponse> => okJson<SearchResponse>(await searchGet(query))

  it('fixture sanity: the body texts are the distinctive ones S0.15 promised', async () => {
    const w = await createWorld({ with: ['taskBodies'] })
    expect(w.taskBodies.pLeafBody.contentText).toContain('รายละเอียด P-ลับ11')
    expect(w.taskBodies.aTaskBody.contentText).toBe('รายละเอียด A-ลับ12')
    expect(w.taskBodies.qTaskBody.contentText).toBe('รายละเอียด Q-ลับ13')
    expect(w.taskBodies.pLeafBody).toMatchObject({ kind: 'TASK', taskId: w.tasks.pLeaf.id, projectId: w.P.id })
  })

  it('outsider: GET /api/search?q=รายละเอียด P-ลับ11 → nothing of P (no “P-ลับ”, no task or page id)', async () => {
    const w = await createWorld({ with: ['taskBodies'] })
    asUser(w.outsider)
    const body = await search(`q=${q('รายละเอียด P-ลับ11')}`)
    expect(body.tasks ?? []).toEqual([])
    assertNoLeak(body, pBodies(w))
  })

  it('outsider: q=รายละเอียด → only the Q body hit (opens /t/<qTask>), nothing of P or A', async () => {
    const w = await createWorld({ with: ['taskBodies'] })
    asUser(w.outsider)
    const body = await search(`q=${q('รายละเอียด')}`)
    expect(body.tasks).toEqual([
      expect.objectContaining({ id: w.tasks.qTask.id, href: `/t/${w.tasks.qTask.id}`, matchedIn: 'content' }),
    ])
    assertNoLeak(body, pBodies(w))
  })

  it('member: q=รายละเอียด → P and archived A body hits (projectArchived chip), nothing of Q; no TASK page in `pages`', async () => {
    const w = await createWorld({ with: ['taskBodies'] })
    asUser(w.member)
    const body = await search(`q=${q('รายละเอียด')}`)
    const ids = (body.tasks ?? []).map((t) => t.id)
    expect(ids).toEqual(expect.arrayContaining([w.tasks.pLeaf.id, w.tasks.aTask.id]))
    expect(body.tasks?.find((t) => t.id === w.tasks.aTask.id)).toMatchObject({ projectArchived: true })
    assertNoLeak(body, qBodies(w))
    // FR-682 / AC-628: TASK pages never appear in the pages group
    const pageIds = body.pages.map((p) => p.id)
    for (const b of [w.taskBodies.pLeafBody, w.taskBodies.aTaskBody, w.taskBodies.qTaskBody])
      expect(pageIds).not.toContain(b.id)
  })

  it('member: P and A page trees contain no TASK page id (AC-628; TASK pages sit at the project root with key a0)', async () => {
    const w = await createWorld({ with: ['taskBodies'] })
    asUser(w.member)
    const pTree = await okJson<PageTreeResponse>(await treeGet(`space=PROJECT&projectId=${w.P.id}`))
    assertContains(pTree, [w.pages.pPage.id, w.pages.pCharter.id])
    assertNoLeak(pTree, [w.taskBodies.pLeafBody.id, w.tasks.pLeaf.id])
    expect(pTree.nodes.every((n) => n.title !== '')).toBe(true)
    const aTree = await okJson<PageTreeResponse>(await treeGet(`space=PROJECT&projectId=${w.A.id}`))
    assertContains(aTree, [w.pages.aPage.id])
    assertNoLeak(aTree, [w.taskBodies.aTaskBody.id])
  })

  it('GET /api/pages/titles?ids=<pLeafBody> → { id, visible:false } for the member and the outsider (S1.2)', async () => {
    const w = await createWorld({ with: ['taskBodies'] })
    for (const u of [w.member, w.outsider, w.manager]) {
      asUser(u)
      const body = await okJson<PageTitlesResponse>(await titlesGet([w.taskBodies.pLeafBody.id]))
      expect(body.items, u.nickname ?? u.id).toEqual([{ id: w.taskBodies.pLeafBody.id, visible: false }])
    }
  })

  it('member: Q body, its TASK page and its lease → 404 without “Q-ลับ” or a Q id', async () => {
    const w = await createWorld({ with: ['taskBodies'] })
    asUser(w.member)
    for (const res of [
      await bodyGet(w.tasks.qTask.id),
      await pageGet(w.taskBodies.qTaskBody.id),
      await lockCall('GET', w.taskBodies.qTaskBody.id),
    ]) {
      const { status, body } = await bodyOf(res)
      expect(status).toBe(404)
      assertNoLeak(body, qBodies(w))
    }
  })

  it('outsider: P body, TASK page, lease and the body image → 404 without bytes, names or ids (AC-624)', async () => {
    const w = await createWorld({ with: ['taskBodies'] })
    asUser(w.outsider)
    for (const res of [
      await bodyGet(w.tasks.pLeaf.id),
      await pageGet(w.taskBodies.pLeafBody.id),
      await lockCall('GET', w.taskBodies.pLeafBody.id),
    ]) {
      const { status, body } = await bodyOf(res)
      expect(status).toBe(404)
      assertNoLeak(body, pBodies(w))
    }
    const file = await fileGet(w.taskBodies.pLeafBodyImage.id)
    expect(file.status).toBe(404)
    expect(file.headers.get('content-disposition')).toBeNull()
    assertNoLeak(await file.text(), pBodies(w))
  })

  it('member: GET /api/projects/{P}/tasks carries hasBody, never the body text (FR-687 / FR-691)', async () => {
    const w = await createWorld({ with: ['taskBodies'] })
    asUser(w.member)
    const body = await okJson<ProjectTasksResponse>(
      await callRoute(getProjectTasks, `/api/projects/${w.P.id}/tasks`, { id: w.P.id }),
    )
    const byId = new Map(body.tasks.map((t) => [t.id, t]))
    expect(byId.get(w.tasks.pLeaf.id)?.hasBody).toBe(true)
    expect(byId.get(w.tasks.pChildB.id)?.hasBody).toBe(false)
    assertNoLeak(body, ['รายละเอียด', w.taskBodies.pLeafBody.id, w.taskBodies.pLeafBodyImage.id])
  })

  it('outsider: GET /api/tasks/my statusesByProject has only Q’s statuses; member: none of Q (M6.1-D12)', async () => {
    const w = await createWorld({ with: ['taskBodies'] })
    asUser(w.outsider)
    const out = await okJson<MyTasksResponse>(await callRoute(getMyTasks, '/api/tasks/my'))
    expect(out.statusesByProject, 'S1.10 fills statusesByProject').toBeDefined()
    expect(Object.keys(out.statusesByProject ?? {})).toEqual([w.Q.id])
    assertNoLeak(out, [...pBodies(w), w.statuses.P.pSecret.name, w.statuses.P.todo.id, w.statuses.A.todo.id])
    asUser(w.member)
    const mine = await okJson<MyTasksResponse>(await callRoute(getMyTasks, '/api/tasks/my'))
    expect(Object.keys(mine.statusesByProject ?? {}).sort()).toEqual(mine.groups.map((g) => g.project.id).sort())
    expect(mine.groups.length).toBeGreaterThan(0)
    assertNoLeak(mine, [...qBodies(w), w.statuses.Q.waitData.name, w.statuses.Q.todo.id])
  })

  it('team tasks: hasBody only on visible cards — outsider sees qTask (true) and nothing of P; member none of Q', async () => {
    const w = await createWorld({ with: ['taskBodies'] })
    asUser(w.outsider)
    const out = await okJson<TeamTasksResponse>(await callRoute(getTeamTasks, '/api/tasks'))
    expect(out.cards.map((c) => [c.id, c.hasBody])).toEqual([[w.tasks.qTask.id, true]])
    assertNoLeak(out, pBodies(w))
    asUser(w.member)
    const mine = await okJson<TeamTasksResponse>(await callRoute(getTeamTasks, '/api/tasks'))
    const byId = new Map(mine.cards.map((c) => [c.id, c]))
    expect(byId.get(w.tasks.pLeaf.id)?.hasBody).toBe(true)
    expect(byId.get(w.tasks.pChildB.id)?.hasBody).toBe(false)
    assertNoLeak(mine, qBodies(w))
  })
})

describe('masking — grid day (M7, plan/m07 S4.2; §3.3, X29, X30)', () => {
  const W7 = ['dayAllocations'] as const
  const DAY_WARNS = ['NON_WORKING', 'TIME_OFF']

  it('member + expand + includeOthers=1: coworker’s Q day load is a number on D:2026-11-10 — nothing of Q', async () => {
    const w = await createWorld({ with: W7 })
    const coworker = w.users.coworker!
    const body = await gridOk(w.member, w.P.id, 'from=2026-11-02&to=2026-11-16&expand=2026-11-09&includeOthers=1')
    // qDay: DAY 2026-11-10 = 75 on qTaskCoworker (Q); P's own plans are excluded (X29)
    expect(personOf(body, coworker.id).otherProjects?.['D:2026-11-10']?.total).toBe(75)
    for (const p of Object.values(body.people))
      for (const [key, v] of Object.entries(p.otherProjects ?? {})) {
        expect(Object.keys(v ?? {}).sort(), key).toEqual(['committed', 'total'])
        expect(typeof v?.total, key).toBe('number')
        expect(typeof v?.committed, key).toBe('number')
      }
    assertContains(body, [w.P.name])
    assertNoLeak(body, [
      w.Q.name,
      w.tasks.qTask.name,
      w.Q.id,
      w.tasks.qTask.id,
      w.assignments.qTaskCoworker.id,
      w.assignments.qTaskOutsider.id,
    ])
  })

  it('lead + zoom=day: the member’s leave is only "ลา"; day-cell warn holds codes only (no type, note or id)', async () => {
    const w = await createWorld({ with: W7 })
    const body = await gridOk(w.lead, w.P.id, 'from=2026-11-02&to=2026-11-09&zoom=day')
    expect(body.window.zoom).toBe('day')
    expect(personOf(body, w.member.id).timeOff).toStrictEqual([
      { start: '2026-11-02', end: '2026-11-02', half: null, label: th.masking.leave },
    ])
    for (const p of Object.values(body.people))
      for (const e of p.timeOff) expect(Object.keys(e).sort()).toEqual(TIME_OFF_KEYS)
    for (const r of body.rows) {
      if (r.kind !== 'assignee') continue
      for (const [key, c] of Object.entries(r.cells))
        if (key.startsWith('D:') && c?.warn) for (const code of c.warn) expect(DAY_WARNS, key).toContain(code)
    }
    assertNoLeak(body, ['อบรม-โลก', 'โน้ตของ member', w.timeOff.member.id, w.leaveTypes.training.id])
  })

  it('outsider: the day-zoomed grid of P is a 404 with nothing of P', async () => {
    const w = await createWorld({ with: W7 })
    for (const qs of [
      'from=2026-11-02&to=2026-11-09&zoom=day',
      'from=2026-11-02&to=2026-11-16&expand=2026-11-09&includeOthers=1',
    ]) {
      const { status, body } = await gridAs(w.outsider, w.P.id, qs)
      expect(status, qs).toBe(404)
      assertNoLeak(body, [w.P.name, w.tasks.pLeaf.name, w.tasks.pCoworker.name, w.P.id])
    }
  })

  it('golden + addDayExample: Ivy (not in Mobile) gets 404 without "Kickoff workshop"; Jack sees others’ day load as numbers only', async () => {
    await seedGolden(db)
    await addDayExample(db)
    const mobileId = await goldenProjectId('Mobile App Revamp')
    const ivy = await gridAs(await goldenUser('Ivy'), mobileId, 'from=2026-08-31&to=2026-10-26&zoom=day')
    expect(ivy.status).toBe(404)
    assertNoLeak(ivy.body, [DAY_EXAMPLE.task, 'Mobile App Revamp', mobileId, ...goldenTaskNames(['Mobile App Revamp'])])

    const body = await gridOk(
      await goldenUser('Jack'),
      mobileId,
      'from=2026-08-31&to=2026-10-26&includeOthers=1&expand=2026-09-07',
    )
    assertContains(body, [DAY_EXAMPLE.task])
    const mint = await goldenUser('Mint')
    const others = personOf(body, mint.id).otherProjects ?? {}
    for (const [key, v] of Object.entries(others)) {
      if (!key.startsWith('D:')) continue
      expect(Object.keys(v ?? {}).sort(), key).toEqual(['committed', 'total'])
      expect(Number.isInteger(v?.total) && Number.isInteger(v?.committed), key).toBe(true)
    }
    // Jack is not in POS / DW / CRM: none of their names, ids or task names (Mint's POS assignment rides as numbers)
    const hidden: string[] = [...goldenTaskNames(['POS Upgrade', 'Data Warehouse', 'CRM Migration'])]
    for (const n of ['POS Upgrade', 'Data Warehouse', 'CRM Migration'] as const) hidden.push(n, await goldenProjectId(n))
    assertNoLeak(body, hidden)
  })
})

describe('masking — M7.1 chart + plan markers (plan/m07.1 S5.2; §3.3, X29, AC-807, AC-812)', () => {
  // AC-807: Mint is a member of POS (and Mobile), not of CRM / Data Warehouse / Store Analytics.
  const NOT_MINT: GoldenProject[] = ['CRM Migration', 'Data Warehouse', 'Store Analytics Dashboard']
  const CHART_WEEKS = ['2026-09-14', '2026-09-21', '2026-09-28', '2026-10-05', '2026-10-12', '2026-10-19', '2026-10-26']
  const CHART_RANGE = 'from=2026-09-14&to=2026-11-02&includeOthers=1'

  it('Mint, POS chunk with includeOthers=1: Cindy’s CRM load reaches the chart as a number; no CRM name, task or id anywhere', async () => {
    await seedGolden(db)
    const posId = await goldenProjectId('POS Upgrade')
    const cindy = await goldenUser('Cindy')
    const body = await gridOk(await goldenUser('Mint'), posId, CHART_RANGE)
    // the footer / chart source: numbers only (X29)
    expect(personOf(body, cindy.id).otherProjects?.['W:2026-10-05']).toEqual({ total: 250, committed: 0 })
    for (const p of Object.values(body.people))
      for (const [key, v] of Object.entries(p.otherProjects ?? {}))
        expect(Object.keys(v ?? {}).sort(), key).toEqual(['committed', 'total'])
    // the chart is computed client-side from exactly this body (M7.1-D3, no new route): its series over these numbers are
    // checked in tests/golden/plan-chart.int.test.ts › Mint; here the payload itself is the leak surface
    expect(body.periods.map((p) => p.key)).toEqual(CHART_WEEKS.map((w) => `W:${w}`))
    // §11.2: neither the response nor the computed chart carries anything of CRM (or the other hidden projects)
    const hidden: string[] = ['CRM Migration', 'ย้ายข้อมูลลูกค้า', ...goldenTaskNames(NOT_MINT)]
    for (const n of NOT_MINT) hidden.push(n, await goldenProjectId(n))
    assertContains(body, ['POS Upgrade'])
    assertNoLeak(body, hidden)
  })

  it('Peter (not in POS): the POS grid chunk and the POS markers route are 404s without POS names, ids or labels', async () => {
    await seedGolden(db)
    const posId = await goldenProjectId('POS Upgrade')
    const cindy = await goldenUser('Cindy')
    await makePlanMarker({ projectId: posId, date: '2026-10-23', color: 'RED', label: 'UAT sign-off', createdBy: cindy })
    const peter = await goldenUser('Peter')
    const grid = await gridAs(peter, posId, CHART_RANGE)
    expect(grid.status).toBe(404)
    assertNoLeak(grid.body, ['POS Upgrade', posId, ...goldenTaskNames(['POS Upgrade'])])
    asUser(peter)
    const markers = await bodyOf(await markersGet(posId))
    expect(markers.status).toBe(404)
    assertNoLeak(markers.body, ['POS Upgrade', posId, 'UAT sign-off'])
    // and Cindy (POS lead) does see it — the 404 is about Peter, not a missing marker
    asUser(cindy)
    const own = await bodyOf(await markersGet(posId))
    expect(own.status).toBe(200)
    assertContains(own.body, ['UAT sign-off'])
  })

  it('markers are per project: Q’s and A’s markers never appear in P’s response, whoever asks', async () => {
    const w = await createWorld({ with: ['planMarkers'] })
    const { pRed, pGreen, aYellow, qRed } = w.planMarkers
    for (const viewer of [w.manager, w.lead, w.member]) {
      asUser(viewer)
      const { status, body } = await bodyOf(await markersGet(w.P.id))
      expect(status, viewer.name).toBe(200)
      expect((body as PlanMarkersResponse).markers.map((m) => m.id), viewer.name).toEqual([pRed.id, pGreen.id])
      assertNoLeak(body, [qRed.id, qRed.label!, w.Q.id, w.Q.name, aYellow.id, aYellow.label!, w.A.id])
    }
    // the member is not in Q: Q's markers are a 404 with nothing of Q
    asUser(w.member)
    const q = await bodyOf(await markersGet(w.Q.id))
    expect(q.status).toBe(404)
    assertNoLeak(q.body, [qRed.id, qRed.label!, w.Q.name])
    // the outsider sees neither P's markers nor P
    asUser(w.outsider)
    const p = await bodyOf(await markersGet(w.P.id))
    expect(p.status).toBe(404)
    assertNoLeak(p.body, [pRed.id, pRed.label!, pGreen.id, w.P.name])
  })
})
