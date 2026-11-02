// M2 S1.3 — people directory (X09, X12, M2-D16) + GET /api/people/options.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { GET } from '@/app/api/people/options/route'
import { GET as getPeople } from '@/app/api/people/route'
import { GET as getTimeOff } from '@/app/api/people/[userId]/time-off/route'
import type { ISODate } from '@/domain/types'
import { th } from '@/i18n/th'
import type { PeopleDirectoryResponse } from '@/lib/contracts/workload'
import { applyFixture, seedGolden } from '../../../scripts/lib/fixtures'
import { callRoute, okJson } from '../../../tests/authz/_support/http'
import { goldenUser, type GoldenViewer } from '../../../tests/authz/_support/golden'
import { allNumbersInteger } from '../../../tests/helpers/json'
import { NotFoundError } from '../errors'
import { compareThai } from '@/lib/collate'
import type { PeopleOptionsResponse } from '@/lib/contracts/people'
import { displayName } from '@/lib/display-name'
import { asNobody, asUser, toSessionUser } from '../../../tests/helpers/as-user'
import { makeUser } from '../../../tests/helpers/factories'
import { createWorld } from '../../../tests/helpers/world'
import { db } from '../db/client'
import { getPersonHeader, listPeopleDirectory, listPeopleOptions, listPersonTimeOff } from './people'

const TODAY: ISODate = '2026-09-30'

const KEYS = ['active', 'color', 'id', 'name', 'nickname', 'positionId', 'positionName']

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

// ── M9 S2.6 / S2.7 — /people directory, person header, person leave (FR-1008, M9-D14/D16, §3.3) ──

describe('M9 people directory / header / time off (golden)', () => {
  const as = async (n: GoldenViewer) => toSessionUser(await goldenUser(n))
  const idOf = async (n: GoldenViewer) => (await goldenUser(n)).id
  const dirNames = (r: PeopleDirectoryResponse) => r.groups.flatMap((g) => g.people.map((p) => p.name)).sort()

  beforeEach(() => {
    vi.stubEnv('ALLOW_TEST_HOOKS', '1')
    vi.stubEnv('APP_NOW', '2026-09-30T10:00:00+07:00')
  })

  it('directory: Ivy → Cindy, Ivy, Mint; manager → 6 incl. Manager; Peter this week 500; no email; integers', async () => {
    await seedGolden(db)
    expect(dirNames(await listPeopleDirectory(db, await as('Ivy'), TODAY))).toEqual(['Cindy', 'Ivy', 'Mint'])
    const all = await listPeopleDirectory(db, await as('Manager'), TODAY)
    expect(all.week).toBe('2026-09-28')
    expect(dirNames(all)).toEqual(['Cindy', 'Ivy', 'Jack', 'Manager', 'Mint', 'Peter'])
    const peter = all.groups.flatMap((g) => g.people).find((p) => p.name === 'Peter')!
    expect(peter.thisWeek.total).toBe(500)
    expect(peter.positionName).toBe('Data')
    expect(JSON.stringify(all)).not.toContain('@example.com')
    expect(allNumbersInteger(all)).toBe(true)
    asUser(await goldenUser('Ivy'))
    const body = await okJson<PeopleDirectoryResponse>(await callRoute(getPeople, '/api/people'))
    expect(dirNames(body)).toEqual(['Cindy', 'Ivy', 'Mint'])
  })

  it('header: Peter as Cindy → Data, Mon–Fri 100, canEditLeave false; as Peter → self; Ivy → Peter → 404', async () => {
    await seedGolden(db)
    const peter = await idOf('Peter')
    const h = await getPersonHeader(db, await as('Cindy'), peter)
    expect(h).toMatchObject({
      userId: peter,
      name: 'Peter',
      positionName: 'Data',
      active: true,
      deactivatedOn: null,
      schedule: { 1: 100, 2: 100, 3: 100, 4: 100, 5: 100 },
      isSelf: false,
      canEditLeave: false,
    })
    expect(JSON.stringify(h)).not.toContain('@')
    expect(await getPersonHeader(db, await as('Peter'), peter)).toMatchObject({ isSelf: true, canEditLeave: true })
    expect(await getPersonHeader(db, await as('Manager'), peter)).toMatchObject({ canEditLeave: true })
    await expect(getPersonHeader(db, await as('Ivy'), peter)).rejects.toBeInstanceOf(NotFoundError)
    await expect(getPersonHeader(db, await as('Manager'), 'no-such-user')).rejects.toBeInstanceOf(NotFoundError)
  })

  it('time off: F4 as Ivy → Cindy’s entry masked; as Cindy → full + canEdit; Ivy → Peter → 404', async () => {
    await seedGolden(db)
    await applyFixture(db, 'F4')
    const cindy = await idOf('Cindy')
    const masked = await listPersonTimeOff(db, await as('Ivy'), cindy, TODAY)
    expect(masked.canEdit).toBe(false)
    expect(masked.from).toBe('2025-09-29')
    expect(masked.to).toBe('2027-10-04')
    expect(masked.entries).toHaveLength(1)
    expect(masked.entries[0]).toMatchObject({
      kind: 'masked',
      label: th.masking.leave,
      startDate: '2026-10-12',
      endDate: '2026-10-14',
    })
    expect(JSON.stringify(masked)).not.toContain('ลาพักร้อน')
    const full = await listPersonTimeOff(db, await as('Cindy'), cindy, TODAY)
    expect(full.canEdit).toBe(true)
    expect(full.entries[0]).toMatchObject({ kind: 'full', leaveTypeName: 'ลาพักร้อน' })
    await expect(listPersonTimeOff(db, await as('Ivy'), await idOf('Peter'), TODAY)).rejects.toBeInstanceOf(
      NotFoundError,
    )
    asUser(await goldenUser('Ivy'))
    const peter = await idOf('Peter')
    expect((await callRoute(getTimeOff, `/api/people/${peter}/time-off`, { userId: peter })).status).toBe(404)
  })
})
