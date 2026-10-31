// M2 S1.3 — people directory (X09, X12, M2-D16) + GET /api/people/options.
import { describe, expect, it } from 'vitest'
import { GET } from '@/app/api/people/options/route'
import { compareThai } from '@/lib/collate'
import type { PeopleOptionsResponse } from '@/lib/contracts/people'
import { displayName } from '@/lib/display-name'
import { asNobody, asUser } from '../../../tests/helpers/as-user'
import { makeUser } from '../../../tests/helpers/factories'
import { createWorld } from '../../../tests/helpers/world'
import { db } from '../db/client'
import { listPeopleOptions } from './people'

const KEYS = ['active', 'color', 'id', 'name', 'nickname', 'positionName']

describe('listPeopleOptions', () => {
  it('every user incl. deactivated (active: false), exact keys, no email, sorted by display name', async () => {
    const w = await createWorld()
    const d = await makeUser({ name: 'Nok Deactivated', nickname: 'Nok', deactivated: { on: '2026-09-01' } })
    const qa = await makeUser({ name: 'สมชาย ใจดี', nickname: 'ชาย', positionName: 'QA' })
    const people = await listPeopleOptions(db)
    expect(people.map((p) => p.id).sort()).toEqual(
      [w.manager.id, w.lead.id, w.member.id, w.outsider.id, d.id, qa.id].sort(),
    )
    for (const p of people) expect(Object.keys(p).sort()).toEqual(KEYS)
    expect(people.find((p) => p.id === d.id)?.active).toBe(false)
    expect(people.find((p) => p.id === w.lead.id)?.active).toBe(true)
    expect(people.find((p) => p.id === qa.id)?.positionName).toBe('QA')
    const names = people.map((p) => displayName(p))
    expect(names).toEqual([...names].sort(compareThai))
    expect(JSON.stringify(people)).not.toContain('@example.com')
  })
})

describe('GET /api/people/options', () => {
  it('any logged-in user gets { people }; nobody → 401', async () => {
    const w = await createWorld()
    asUser(w.outsider)
    const res = await GET(new Request('http://t/api/people/options'), { params: Promise.resolve({}) })
    expect(res.status).toBe(200)
    expect(res.headers.get('cache-control')).toBe('private, no-store')
    const body = (await res.json()) as PeopleOptionsResponse
    expect(body.people).toHaveLength(4)
    asNobody()
    const anon = await GET(new Request('http://t/api/people/options'), { params: Promise.resolve({}) })
    expect(anon.status).toBe(401)
  })
})
