// M9 S2.10 — FR-303 load part (M9-D20): GET /api/clients/[id]/load (golden F1, today 2026-09-30, 12 weeks).
import { eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { GET as getClientLoad } from '@/app/api/clients/[id]/load/route'
import type { ClientLoadResponse } from '@/lib/contracts/workload'
import { seedGolden } from '../../../scripts/lib/fixtures'
import { callRoute, okJson } from '../../../tests/authz/_support/http'
import { goldenClientId, goldenProjectId, goldenUser, type GoldenViewer } from '../../../tests/authz/_support/golden'
import { asUser, toSessionUser } from '../../../tests/helpers/as-user'
import { db } from '../db/client'
import { projects } from '../db/schema'
import { NotFoundError } from '../errors'
import { clientLoad } from './workload'

const TODAY = '2026-09-30'

beforeEach(() => {
  vi.stubEnv('ALLOW_TEST_HOOKS', '1')
  vi.stubEnv('APP_NOW', '2026-09-30T10:00:00+07:00')
})

const load = async (v: GoldenViewer, client: string) =>
  clientLoad(db, toSessionUser(await goldenUser(v)), await goldenClientId(client), TODAY)

describe('clientLoad (FR-303)', () => {
  it('Coral: manager Σ POS + DW; Cindy only POS (visible); Peter only DW; Bluebird as Cindy → 404', async () => {
    await seedGolden(db)
    const [pos, dw] = [await goldenProjectId('POS Upgrade'), await goldenProjectId('Data Warehouse')]
    const m = await load('Manager', 'Coral')
    expect(m.sum).toEqual({ total: 3375, committed: 2250 })
    expect(m.projects).toEqual([
      { projectId: dw, sum: { total: 1625, committed: 1625 } },
      { projectId: pos, sum: { total: 1750, committed: 625 } },
    ])
    const cindy = await load('Cindy', 'Coral')
    expect(cindy.sum).toEqual({ total: 1750, committed: 625 })
    expect(cindy.projects.map((p) => p.projectId)).toEqual([pos])
    expect((await load('Peter', 'Coral')).sum).toEqual({ total: 1625, committed: 1625 })
    await expect(load('Cindy', 'Bluebird')).rejects.toBeInstanceOf(NotFoundError)
  })

  it('archived projects drop out; route 404 for an invisible client', async () => {
    await seedGolden(db)
    await db.update(projects).set({ archivedAt: new Date() }).where(eq(projects.name, 'POS Upgrade'))
    expect((await load('Manager', 'Coral')).sum).toEqual({ total: 1625, committed: 1625 })
    asUser(await goldenUser('Cindy'))
    const bluebird = await goldenClientId('Bluebird')
    expect((await callRoute(getClientLoad, `/api/clients/${bluebird}/load`, { id: bluebird })).status).toBe(404)
    const coral = await goldenClientId('Coral')
    const body = await okJson<ClientLoadResponse>(await callRoute(getClientLoad, `/api/clients/${coral}/load`, { id: coral }))
    expect(body.clientId).toBe(coral)
  })
})
