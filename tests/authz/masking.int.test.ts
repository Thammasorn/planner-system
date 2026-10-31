// tests/authz/masking.int.test.ts — MASK-7 / X30 leak tests (SPEC §3.3 "ห้ามส่งชื่อโปรเจคหรือ task ไปที่ client",
// §11.2 `JSON.stringify(res).includes(name) === false`, CLAUDE.md › สิทธิ์). Every read endpoint/loader that can carry
// other people's data is requested as a viewer who must not see a project; the serialized payload must contain none
// of its names or ids. M2: sidebar, project list, client list/detail, people options, client options.
// Later milestones append describe blocks (M5 calendar, M6 grid, M9 workload/person, M10 search/home).
// plan/m02-clients-projects-authz.md S3.4.
import { beforeEach, describe, expect, it } from 'vitest'
import { GET as getClientOptions } from '@/app/api/clients/options/route'
import { GET as getPeopleOptions } from '@/app/api/people/options/route'
import { GET as getSidebar } from '@/app/api/sidebar/route'
import type { PeopleOptionsResponse } from '@/lib/contracts/people'
import { db } from '@/server/db/client'
import * as services from '@/server/services'
import { seedGolden } from '../../scripts/lib/fixtures'
import { asUser } from '../helpers/as-user'
import type { TestUser } from '../helpers/factories'
import { createWorld, type World } from '../helpers/world'
import { goldenProjectId, goldenUser, type GoldenProject } from './_support/golden'
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
      expect(Object.keys(person).sort()).toEqual(['active', 'color', 'id', 'name', 'nickname', 'positionName'])
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
    assertNoLeak(await services.projects.listProjectsForViewer(db, asUser(peter), { archived: false }), hidden)
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
})
