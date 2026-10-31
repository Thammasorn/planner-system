// tests/authz/visibility.int.test.ts — what each world role sees (SPEC §3.1 "Worker เข้าถึงได้เฉพาะโปรเจคที่ตัวเองเป็นสมาชิก",
// §3.2 "เห็นโปรเจคในลิสต์" / "ดูลูกค้า", §8.1 sidebar, X09, X42, X43). The matrix rows PERM-04a/PERM-06a/d only prove
// "allowed"; these tests prove the content. plan/m02-clients-projects-authz.md S3.3.
import { describe, expect, it } from 'vitest'
import { GET as getPeopleOptions } from '@/app/api/people/options/route'
import { GET as getSidebar } from '@/app/api/sidebar/route'
import type { PeopleOptionsResponse } from '@/lib/contracts/people'
import type { SidebarResponse } from '@/lib/contracts/sidebar'
import { db } from '@/server/db/client'
import * as services from '@/server/services'
import { asUser } from '../helpers/as-user'
import type { TestUser } from '../helpers/factories'
import { createWorld, type World } from '../helpers/world'
import { callRoute, okJson } from './_support/http'

type RoleKey = 'manager' | 'lead' | 'member' | 'outsider'
const ROLES: readonly RoleKey[] = ['manager', 'lead', 'member', 'outsider']

async function sidebarAs(u: TestUser): Promise<SidebarResponse> {
  asUser(u)
  return okJson<SidebarResponse>(await callRoute(getSidebar, '/api/sidebar'))
}

describe('visibility (world)', () => {
  it('sidebar: M [P, Q] · L [P] · Me [P] · W [Q]; archived A never listed; + only for the manager', async () => {
    const w = await createWorld()
    const expected: Record<RoleKey, string[]> = {
      manager: [w.P.id, w.Q.id],
      lead: [w.P.id],
      member: [w.P.id],
      outsider: [w.Q.id],
    }
    for (const role of ROLES) {
      const body = await sidebarAs(w[role])
      expect(body.projects.map((p) => p.id), role).toEqual(expected[role])
      expect(body.canCreateProject, role).toBe(role === 'manager')
      // A (archived) is visible to M/L/Me → the "ดูโปรเจคที่ archive" link; the outsider has no archived project
      expect(body.hasArchived, role).toBe(role !== 'outsider')
    }
  })

  it('sidebar items carry only id, name, colour and certainty', async () => {
    const w = await createWorld()
    const body = await sidebarAs(w.lead)
    expect(body.projects).toEqual([
      { id: w.P.id, name: 'World P', color: w.P.color, certainty: w.P.certainty },
    ])
  })

  it('/projects: active M [P, Q] · L/Me [P] · W [Q]; archived M/L/Me [A] · W []', async () => {
    const w = await createWorld()
    const active: Record<RoleKey, string[]> = {
      manager: [w.P.id, w.Q.id],
      lead: [w.P.id],
      member: [w.P.id],
      outsider: [w.Q.id],
    }
    for (const role of ROLES) {
      const user = asUser(w[role])
      const act = await services.projects.listProjectsForViewer(db, user, { archived: false })
      expect(act.map((p) => p.id), `${role} active`).toEqual(active[role])
      const arch = await services.projects.listProjectsForViewer(db, user, { archived: true })
      expect(arch.map((p) => p.id), `${role} archived`).toEqual(role === 'outsider' ? [] : [w.A.id])
      for (const p of arch) expect(p.archived).toBe(true)
    }
  })

  it('/projects rows carry the viewer’s own role', async () => {
    const w = await createWorld()
    const role = async (u: TestUser) =>
      (await services.projects.listProjectsForViewer(db, asUser(u), { archived: false })).map(
        (p) => `${p.name}:${p.myRole}`,
      )
    expect(await role(w.manager)).toEqual(['World P:MANAGER', 'World Q:MANAGER'])
    expect(await role(w.lead)).toEqual(['World P:LEAD'])
    expect(await role(w.member)).toEqual(['World P:MEMBER'])
    expect(await role(w.outsider)).toEqual(['World Q:MEMBER'])
  })

  it('/clients: M [C1, C2] (C3 archived hidden by default) · L/Me [C1] · W [C2]', async () => {
    const w = await createWorld()
    const expected: Record<RoleKey, string[]> = {
      manager: [w.C1.id, w.C2.id],
      lead: [w.C1.id],
      member: [w.C1.id],
      outsider: [w.C2.id],
    }
    for (const role of ROLES) {
      const list = await services.clients.listClientsForViewer(db, asUser(w[role]), { includeArchived: false })
      expect(list.map((c) => c.id), role).toEqual(expected[role])
    }
    const all = await services.clients.listClientsForViewer(db, asUser(w.manager), { includeArchived: true })
    expect(all.map((c) => c.id)).toEqual([w.C1.id, w.C2.id, w.C3.id])
  })

  it('client detail C1 as the lead lists [A, P] (archived projects count); as the manager too', async () => {
    const w = await createWorld()
    const asLead = await services.clients.getClientDetail(db, asUser(w.lead), w.C1.id)
    expect(asLead.client.id).toBe(w.C1.id)
    expect(asLead.projects.map((p) => p.id)).toEqual([w.A.id, w.P.id])
    expect(asLead.can.manage).toBe(false)
    const asManager = await services.clients.getClientDetail(db, asUser(w.manager), w.C1.id)
    expect(asManager.projects.map((p) => p.id)).toEqual([w.A.id, w.P.id])
    expect(asManager.can.manage).toBe(true)
  })

  it('people options list every world user for every role (X09)', async () => {
    const w: World = await createWorld()
    const everyone = ROLES.map((r) => w[r].id).sort()
    for (const role of ROLES) {
      asUser(w[role])
      const body = await okJson<PeopleOptionsResponse>(await callRoute(getPeopleOptions, '/api/people/options'))
      expect(body.people.map((p) => p.id).sort(), role).toEqual(everyone)
    }
  })
})
