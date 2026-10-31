// M2 S1.3 — sidebar projects (SPEC §8.1, M2-D08, X90) + GET /api/sidebar.
import { describe, expect, it } from 'vitest'
import { GET } from '@/app/api/sidebar/route'
import type { SidebarResponse } from '@/lib/contracts/sidebar'
import { asUser, toSessionUser } from '../../../tests/helpers/as-user'
import { makeProject } from '../../../tests/helpers/factories'
import { createWorld } from '../../../tests/helpers/world'
import { db } from '../db/client'
import { getSidebar } from './sidebar'

const TODAY = '2026-09-30'

describe('getSidebar', () => {
  it('member: [P] only (A archived, Q invisible), hasArchived, cannot create', async () => {
    const w = await createWorld()
    const s = await getSidebar(db, toSessionUser(w.member), TODAY)
    expect(s.projects.map((p) => p.id)).toEqual([w.P.id])
    expect(s.hasArchived).toBe(true)
    expect(s.canCreateProject).toBe(false)
    for (const p of s.projects) expect(Object.keys(p).sort()).toEqual(['certainty', 'color', 'id', 'name'])
  })

  it('manager: [P, Q] sorted with compareThai, hasArchived, can create', async () => {
    const w = await createWorld()
    const extra = await makeProject({ name: 'Alpha', certainty: 'TENTATIVE', createdBy: w.manager })
    const s = await getSidebar(db, toSessionUser(w.manager), TODAY)
    expect(s.projects.map((p) => p.name)).toEqual(['Alpha', 'World P', 'World Q'])
    expect(s.projects[0]).toEqual({ id: extra.id, name: 'Alpha', color: '#2F5597', certainty: 'TENTATIVE' })
    expect(s.hasArchived).toBe(true)
    expect(s.canCreateProject).toBe(true)
  })

  it('outsider: [Q], hasArchived false', async () => {
    const w = await createWorld()
    const s = await getSidebar(db, toSessionUser(w.outsider), TODAY)
    expect(s.projects.map((p) => p.id)).toEqual([w.Q.id])
    expect(s.hasArchived).toBe(false)
  })
})

describe('GET /api/sidebar', () => {
  it('returns the viewer’s sidebar with no-store', async () => {
    const w = await createWorld()
    asUser(w.lead)
    const res = await GET(new Request('http://t/api/sidebar'), { params: Promise.resolve({}) })
    expect(res.status).toBe(200)
    expect(res.headers.get('cache-control')).toBe('private, no-store')
    const body = (await res.json()) as SidebarResponse
    expect(body.projects.map((p) => p.name)).toEqual(['World P'])
    expect(JSON.stringify(body)).not.toContain(w.Q.id)
  })
})
