// M8 S2.4 — GET /api/projects/[id]/milestones (FR-409, PERM-06, §3.3, X41/X42/X86, M8-D17).
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ProjectMilestonesResponse } from '@/lib/contracts/milestones'
import { callRoute, okJson } from '../../../../../../tests/authz/_support/http'
import { asUser } from '../../../../../../tests/helpers/as-user'
import { createWorld } from '../../../../../../tests/helpers/world'
import { GET } from './route'

beforeEach(() => {
  vi.stubEnv('ALLOW_TEST_HOOKS', '1')
  vi.stubEnv('APP_NOW', '2026-09-30T10:00:00+07:00')
})

const get = (id: string) => callRoute(GET, `/api/projects/${id}/milestones`, { id })

describe('GET /api/projects/[id]/milestones', () => {
  it('member on P → 3 live milestones by date with status/late/progress; canManage false; no-store', async () => {
    const w = await createWorld({ with: ['milestones'] })
    asUser(w.member)
    const res = await get(w.P.id)
    expect(res.headers.get('Cache-Control')).toBe('private, no-store')
    const body = await okJson<ProjectMilestonesResponse>(res)
    expect(body).toMatchObject({ projectId: w.P.id, today: '2026-09-30', canManage: false })
    expect(body.milestones.map((m) => m.id)).toEqual([w.milestones.pDone.id, w.milestones.pLate.id, w.milestones.p.id])
    expect(body.milestones[0]).toEqual({
      id: w.milestones.pDone.id,
      projectId: w.P.id,
      name: 'Kickoff P',
      date: '2026-09-15',
      description: null,
      completedOn: '2026-09-16',
      color: 'PURPLE',
      status: 'DONE',
      late: false,
      lateTaskCount: 0,
      progress: { done: 1, total: 1 },
    })
    expect(body.milestones[1]).toMatchObject({ status: 'DUE_SOON', late: true, lateTaskCount: 1, progress: { done: 0, total: 1 } })
    expect(body.milestones[2]).toMatchObject({ status: 'UPCOMING', late: false, progress: { done: 0, total: 1 } })
  })

  it('lead → canManage true; archived A as lead → readable, canManage false', async () => {
    const w = await createWorld({ with: ['milestones'] })
    asUser(w.lead)
    expect((await okJson<ProjectMilestonesResponse>(await get(w.P.id))).canManage).toBe(true)
    const a = await okJson<ProjectMilestonesResponse>(await get(w.A.id))
    expect(a.canManage).toBe(false)
    expect(a.milestones.map((m) => m.id)).toEqual([w.milestones.a.id])
  })

  it('outsider on P → 404 without milestone names; malformed id → 404', async () => {
    const w = await createWorld({ with: ['milestones'] })
    asUser(w.outsider)
    const res = await get(w.P.id)
    expect(res.status).toBe(404)
    expect(await res.text()).not.toContain('Milestone P-ลับ06')
    expect((await get('not-a-uuid')).status).toBe(404)
  })
})
