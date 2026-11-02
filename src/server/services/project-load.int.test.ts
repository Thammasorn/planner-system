// M9 S2.10 — FR-409 load part (M9-D19): GET /api/projects/[id]/load (golden F1, today 2026-09-30, 2026-09-28 … 2026-12-14).
import { eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { GET as getProjectLoad } from '@/app/api/projects/[id]/load/route'
import type { ProjectLoadResponse } from '@/lib/contracts/workload'
import { seedGolden } from '../../../scripts/lib/fixtures'
import { callRoute, okJson } from '../../../tests/authz/_support/http'
import { goldenProjectId, goldenUser } from '../../../tests/authz/_support/golden'
import { asUser, toSessionUser } from '../../../tests/helpers/as-user'
import { allNumbersInteger } from '../../../tests/helpers/json'
import { createWorld } from '../../../tests/helpers/world'
import { db } from '../db/client'
import { projects } from '../db/schema'
import { NotFoundError } from '../errors'
import { projectLoad } from './workload'

const TODAY = '2026-09-30'

beforeEach(() => {
  vi.stubEnv('ALLOW_TEST_HOOKS', '1')
  vi.stubEnv('APP_NOW', '2026-09-30T10:00:00+07:00')
})

describe('projectLoad (FR-409)', () => {
  it('POS: members LEAD first with this-week and 12-week sums; weekly totals; integers', async () => {
    await seedGolden(db)
    const pos = await goldenProjectId('POS Upgrade')
    const r = await projectLoad(db, toSessionUser(await goldenUser('Manager')), pos, TODAY)
    expect(r.archived).toBe(false)
    expect(r.weeks).toHaveLength(12)
    expect(r.members.map((m) => [m.name, m.role, m.thisWeek, m.sum])).toEqual([
      ['Cindy', 'LEAD', { total: 250, committed: 250 }, { total: 250, committed: 250 }],
      ['Ivy', 'MEMBER', { total: 250, committed: 250 }, { total: 375, committed: 375 }],
      ['Mint', 'MEMBER', { total: 0, committed: 0 }, { total: 1125, committed: 0 }],
    ])
    expect(r.weekly['2026-09-28']).toEqual({ total: 500, committed: 500 })
    expect(r.weekly['2026-10-05']).toEqual({ total: 125, committed: 125 })
    expect(r.weekly['2026-12-14']).toEqual({ total: 500, committed: 0 })
    expect(r.sum).toEqual({ total: 1750, committed: 625 })
    expect(allNumbersInteger(r)).toBe(true)
  })

  it('archived → archived: true without numbers; outsider → 404 (service and route)', async () => {
    const w = await createWorld({ with: ['allocations'] })
    const r = await projectLoad(db, asUser(w.member), w.A.id, TODAY)
    expect(r).toMatchObject({ archived: true, members: [], weekly: {}, sum: { total: 0, committed: 0 } })
    await expect(projectLoad(db, asUser(w.outsider), w.P.id, TODAY)).rejects.toBeInstanceOf(NotFoundError)
    asUser(w.outsider)
    expect((await callRoute(getProjectLoad, `/api/projects/${w.P.id}/load`, { id: w.P.id })).status).toBe(404)
    expect((await callRoute(getProjectLoad, '/api/projects/nope/load', { id: 'nope' })).status).toBe(404)
    asUser(w.member)
    const body = await okJson<ProjectLoadResponse>(
      await callRoute(getProjectLoad, `/api/projects/${w.P.id}/load`, { id: w.P.id }),
    )
    expect(body.projectId).toBe(w.P.id)
  })

  it('archiving POS later → archived response', async () => {
    await seedGolden(db)
    const pos = await goldenProjectId('POS Upgrade')
    await db.update(projects).set({ archivedAt: new Date() }).where(eq(projects.id, pos))
    const r = await projectLoad(db, toSessionUser(await goldenUser('Cindy')), pos, TODAY)
    expect(r.archived).toBe(true)
  })
})
