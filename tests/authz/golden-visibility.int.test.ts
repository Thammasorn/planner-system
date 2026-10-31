// tests/authz/golden-visibility.int.test.ts — per-viewer visibility on the golden seed (plan/research/r8-golden.md
// §4.2–§4.3; SPEC §3.1–§3.3, Appendix A.1; BR-60 context: MEMBER rows derived from task assignees, X11).
// Memberships: POS Cindy(L) Ivy Mint · DW Peter(L) · Mobile Jack(L) Mint · CRM Cindy(L) Ivy · Store Peter(L) Jack.
// plan/m02-clients-projects-authz.md S3.3.
import { beforeEach, describe, expect, it } from 'vitest'
import { GET as getSidebar } from '@/app/api/sidebar/route'
import { sortByThai } from '@/lib/collate'
import type { SidebarResponse } from '@/lib/contracts/sidebar'
import { canSeeUserDetails, isLeadAnywhere, visibleUserIds } from '@/server/authz'
import { db } from '@/server/db/client'
import { NotFoundError } from '@/server/errors'
import * as services from '@/server/services'
import { seedGolden } from '../../scripts/lib/fixtures'
import { asUser } from '../helpers/as-user'
import {
  GOLDEN_PROJECTS,
  goldenClientId,
  goldenProjectId,
  goldenUser,
  type GoldenProject,
  type GoldenViewer,
} from './_support/golden'
import { callRoute, okJson } from './_support/http'

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
