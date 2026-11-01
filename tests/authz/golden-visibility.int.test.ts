// tests/authz/golden-visibility.int.test.ts — per-viewer visibility on the golden seed (plan/research/r8-golden.md
// §4.2–§4.3; SPEC §3.1–§3.3, Appendix A.1; BR-60 context: MEMBER rows derived from task assignees, X11).
// Memberships: POS Cindy(L) Ivy Mint · DW Peter(L) · Mobile Jack(L) Mint · CRM Cindy(L) Ivy · Store Peter(L) Jack.
// plan/m02-clients-projects-authz.md S3.3. M6.1 (plan/m06.1 S6.4, AC-624): a body + image on a POS task — Peter
// (not in POS) gets 404 on body / page / lease / save / file and no search hit; Ivy (POS member) finds and opens it.
import { and, eq, isNull } from 'drizzle-orm'
import { beforeEach, describe, expect, it } from 'vitest'
import { GET as getSidebar } from '@/app/api/sidebar/route'
import { sortByThai } from '@/lib/collate'
import type { PageView } from '@/lib/contracts/pages'
import type { SearchResponse } from '@/lib/contracts/search'
import type { SidebarResponse } from '@/lib/contracts/sidebar'
import type { TaskBodyView } from '@/lib/contracts/task-pages'
import { savePageContent } from '@/server/actions/pages'
import { canSeeUserDetails, isLeadAnywhere, visibleUserIds } from '@/server/authz'
import { db } from '@/server/db/client'
import { tasks } from '@/server/db/schema'
import { NotFoundError } from '@/server/errors'
import * as services from '@/server/services'
import { seedGolden } from '../../scripts/lib/fixtures'
import { asUser } from '../helpers/as-user'
import { makeFile, makeTaskBody } from '../helpers/factories'
import { outcomeOf } from '../helpers/outcome'
import {
  GOLDEN_PROJECTS,
  goldenClientId,
  goldenProjectId,
  goldenTaskNames,
  goldenUser,
  type GoldenProject,
  type GoldenViewer,
} from './_support/golden'
import { callRoute, okJson } from './_support/http'
import { assertNoLeak } from './_support/leak'
import { fileGet, keepalive, lockCall, pageGet, para, searchGet } from './rows/_m4'
import { bodyGet } from './rows/_m6_1'

const ALL_PROJECTS = [...GOLDEN_PROJECTS]

const VISIBLE: Record<GoldenViewer, { projects: GoldenProject[]; clients: string[] }> = {
  Manager: { projects: ALL_PROJECTS, clients: ['Bluebird', 'Coral', 'Internal', 'Sunrise'] },
  Cindy: { projects: ['CRM Migration', 'POS Upgrade'], clients: ['Coral', 'Sunrise'] },
  Ivy: { projects: ['CRM Migration', 'POS Upgrade'], clients: ['Coral', 'Sunrise'] },
  Peter: { projects: ['Data Warehouse', 'Store Analytics Dashboard'], clients: ['Coral', 'Internal'] },
  Jack: { projects: ['Mobile App Revamp', 'Store Analytics Dashboard'], clients: ['Bluebird', 'Internal'] },
  Mint: { projects: ['Mobile App Revamp', 'POS Upgrade'], clients: ['Bluebird', 'Coral'] },
}
const VIEWERS = Object.keys(VISIBLE) as GoldenViewer[]
const byThai = (names: readonly string[]) => sortByThai(names, (s) => s)

beforeEach(async () => {
  await seedGolden(db)
})

describe('golden visibility (r8 §4.3)', () => {
  it.each(VIEWERS)('%s: sidebar projects (Thai-sorted)', async (viewer) => {
    asUser(await goldenUser(viewer))
    const body = await okJson<SidebarResponse>(await callRoute(getSidebar, '/api/sidebar'))
    expect(body.projects.map((p) => p.name)).toEqual(byThai(VISIBLE[viewer].projects))
  })

  it.each(VIEWERS)('%s: /projects list (Thai-sorted)', async (viewer) => {
    const user = asUser(await goldenUser(viewer))
    const list = await services.projects.listProjectsForViewer(db, user, { archived: false })
    expect(list.map((p) => p.name)).toEqual(byThai(VISIBLE[viewer].projects))
  })

  it.each(VIEWERS)('%s: clients list (Thai-sorted)', async (viewer) => {
    const user = asUser(await goldenUser(viewer))
    const list = await services.clients.listClientsForViewer(db, user, { includeArchived: false })
    expect(list.map((c) => c.name)).toEqual(byThai(VISIBLE[viewer].clients))
  })

  it.each(VIEWERS)('%s: every other project overview is 404, own ones open', async (viewer) => {
    const user = asUser(await goldenUser(viewer))
    for (const name of GOLDEN_PROJECTS) {
      const id = await goldenProjectId(name)
      const load = services.projects.getProjectOverview(db, user, id)
      if (VISIBLE[viewer].projects.includes(name)) {
        await expect(load, `${viewer} → ${name}`).resolves.toMatchObject({ project: { id, name } })
      } else {
        await expect(load, `${viewer} → ${name}`).rejects.toBeInstanceOf(NotFoundError)
      }
    }
  })

  it('Cindy cannot open the Bluebird client page (404); Mint can', async () => {
    const bluebird = await goldenClientId('Bluebird')
    await expect(
      services.clients.getClientDetail(db, asUser(await goldenUser('Cindy')), bluebird),
    ).rejects.toBeInstanceOf(NotFoundError)
    const asMint = await services.clients.getClientDetail(db, asUser(await goldenUser('Mint')), bluebird)
    expect(asMint.projects.map((p) => p.name)).toEqual(['Mobile App Revamp'])
  })

  it('visibleUserIds (§3.3, X43): LEADs and the manager see everyone; Ivy and Mint only co-members', async () => {
    const ids = async (n: GoldenViewer) => (await goldenUser(n)).id
    for (const n of ['Manager', 'Cindy', 'Peter', 'Jack'] as const) {
      expect(await visibleUserIds(db, asUser(await goldenUser(n))), n).toBe('ALL')
    }
    const ivy = await visibleUserIds(db, asUser(await goldenUser('Ivy')))
    expect(ivy).not.toBe('ALL')
    expect([...(ivy as Set<string>)].sort()).toEqual([await ids('Cindy'), await ids('Ivy'), await ids('Mint')].sort())
    const mint = await visibleUserIds(db, asUser(await goldenUser('Mint')))
    expect(mint).not.toBe('ALL')
    expect([...(mix as Set<string>)].sort()).toEqual(
      [await ids('Cindy'), await ids('Ivy'), await ids('Jack'), await ids('Mint')].sort(),
    )
  })

  it('canSeeUserDetails: Ivy→Peter false · Mint→Manager false · Cindy→Peter true', async () => {
    const ivy = asUser(await goldenUser('Ivy'))
    expect(await canSeeUserDetails(db, ivy, (await goldenUser('Peter')).id)).toBe(false)
    const mint = asUser(await goldenUser('Mint'))
    expect(await canSeeUserDetails(db, mint, (await goldenUser('Manager')).id)).toBe(false)
    const cindy = asUser(await goldenUser('Cindy'))
    expect(await canSeeUserDetails(db, cindy, (await goldenUser('Peter')).id)).toBe(true)
  })

  it('isLeadAnywhere: Cindy, Peter, Jack true; Ivy, Mint false', async () => {
    const lead = async (n: GoldenViewer) => isLeadAnywhere(db, asUser(await goldenUser(n)))
    expect(await lead('Cindy')).toBe(true)
    expect(await lead('Peter')).toBe(true)
    expect(await lead('Jack')).toBe(true)
    expect(await lead('Ivy')).toBe(false)
    expect(await lead('Mint')).toBe(false)
  })
})

describe('golden visibility — task bodies (M6.1, plan/m06.1 S6.4, AC-624)', () => {
  /** A word that exists only in the body (never in a golden name), ≥ 3 chars for the content search (FR-690). */
  const BODY_WORD = 'สเปกเครื่องพิมพ์ใบเสร็จ'

  /** First POS task of the golden JSON (read from the file, never re-typed) + its body with an image. */
  async function posBody(): Promise<{ taskId: string; taskName: string; bodyId: string; imageId: string; posId: string }> {
    const posId = await goldenProjectId('POS Upgrade')
    const taskName = goldenTaskNames(['POS Upgrade'])[0]!
    const [task] = await db
      .select()
      .from(tasks)
      .where(and(eq(tasks.projectId, posId), eq(tasks.name, taskName), isNull(tasks.deletedAt)))
    if (!task) throw new Error(`golden task ${taskName} not seeded`)
    const cindy = await goldenUser('Cindy')
    const body = await makeTaskBody({ task, content: `ขอบเขต: ${BODY_WORD} 3 สาขา`, createdBy: cindy })
    const image = await makeFile({ page: body, uploadedBy: cindy })
    return { taskId: task.id, taskName, bodyId: body.id, imageId: image.id, posId }
  }

  it('Peter (not in POS): /t loader, body, TASK page, lease, save, keepalive and the image → 404 without POS data', async () => {
    const b = await posBody()
    const user = asUser(await goldenUser('Peter'))
    const hidden = ['POS Upgrade', b.posId, b.taskName, b.taskId, b.bodyId, b.imageId, BODY_WORD]
    await expect(services.taskPages.getTaskPageView(db, user, b.taskId)).rejects.toBeInstanceOf(NotFoundError)
    const calls: [string, () => Promise<Response>][] = [
      ['body', () => bodyGet(b.taskId)],
      ['page', () => pageGet(b.bodyId)],
      ['lease state', () => lockCall('GET', b.bodyId)],
      ['lease acquire', () => lockCall('POST', b.bodyId)],
      ['keepalive save', () => keepalive(b.bodyId, { baseVersion: 1, content: para('แอบแก้') })],
    ]
    for (const [label, call] of calls) {
      const res = await call()
      expect(res.status, label).toBe(404)
      assertNoLeak(await res.json(), hidden)
    }
    const save = await savePageContent({ pageId: b.bodyId, baseVersion: 1, content: para('แอบแก้') })
    expect(outcomeOf(save)).toBe('404')
    assertNoLeak(save, hidden)
    const file = await fileGet(b.imageId)
    expect(file.status).toBe(404)
    expect(file.headers.get('content-disposition')).toBeNull()
  })

  it('Peter: Cmd+K on a body word finds nothing (no task or page hit, no POS name)', async () => {
    const b = await posBody()
    asUser(await goldenUser('Peter'))
    const body = await okJson<SearchResponse>(await searchGet(`q=${encodeURIComponent(BODY_WORD)}`))
    expect(body.tasks ?? []).toEqual([])
    expect(body.pages).toEqual([])
    assertNoLeak(body, ['POS Upgrade', b.posId, b.taskName, b.taskId, b.bodyId])
  })

  it('Ivy (POS member): the body word is a content hit opening /t/<id>; body, page and image answer 200', async () => {
    const b = await posBody()
    asUser(await goldenUser('Ivy'))
    const search = await okJson<SearchResponse>(await searchGet(`q=${encodeURIComponent(BODY_WORD)}`))
    expect(search.tasks?.find((t) => t.id === b.taskId)).toMatchObject({
      kind: 'task',
      name: b.taskName,
      projectName: 'POS Upgrade',
      href: `/t/${b.taskId}`,
      matchedIn: 'content',
    })
    expect(search.pages.map((p) => p.id), 'FR-682: never a page hit').not.toContain(b.bodyId)
    const view = await okJson<TaskBodyView>(await bodyGet(b.taskId))
    expect(view).toMatchObject({ taskId: b.taskId, projectId: b.posId, page: { id: b.bodyId }, can: { edit: true } })
    const page = await okJson<PageView>(await pageGet(b.bodyId))
    expect(page.page).toMatchObject({ kind: 'TASK', taskId: b.taskId, title: b.taskName })
    expect((await fileGet(b.imageId)).status).toBe(200)
  })
})
