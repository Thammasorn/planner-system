// M5 S2.6 — month calendar (FR-907, §3.3 MASK-5, X43, M5-D7/D8): only visibleUserIds(viewer) are selected; other
// people's leave is masked ("ลา", no id / type / colour / note); holidays in range; GET /api/calendar validates the
// query (Mondays, ≤ 42 days) and runs in a read-only transaction.
import { eq } from 'drizzle-orm'
import { describe, expect, it, vi } from 'vitest'
import { GET } from '@/app/api/calendar/route'
import { th } from '@/i18n/th'
import type { CalendarResponse, CalendarTimeOffFull } from '@/lib/contracts/calendar'
import { applyFixture, seedGolden, type FixtureId } from '../../../scripts/lib/fixtures'
import { asUser, toSessionUser } from '../../../tests/helpers/as-user'
import {
  makeLeaveType,
  makeProject,
  makeTimeOff,
  makeUser,
  type TestUser,
} from '../../../tests/helpers/factories'
import { db } from '../db/client'
import { user } from '../db/schema'
import type { SessionUser } from '../session'
import { getCalendar } from './calendar'

/** `expect.any(String)` typed as unknown (no-unsafe-assignment inside object literals). */
const ANY_STRING: unknown = expect.any(String)

const OCT = { from: '2026-09-28', to: '2026-11-09' }
const TODAY = '2026-09-30'

async function golden(fixture: FixtureId | null): Promise<(nickname: string) => Promise<SessionUser>> {
  await seedGolden(db)
  if (fixture) await applyFixture(db, fixture)
  return async (nickname) => {
    const [u] = await db.select().from(user).where(eq(user.nickname, nickname))
    if (!u) throw new Error(nickname)
    return {
      id: u.id,
      email: u.email,
      name: u.name,
      nickname: u.nickname,
      role: u.role === 'manager' ? 'manager' : 'worker',
      positionId: u.positionId,
      color: u.color,
      mustChangePassword: false,
      sessionId: '',
      sessionToken: '',
    }
  }
}

const cal = (viewer: SessionUser, range = OCT) => getCalendar(db, viewer, range, TODAY)

describe('getCalendar (golden)', () => {
  it('F4 as Ivy → one masked Cindy entry 10-12..14 with exactly the masked keys; people = Cindy only', async () => {
    const who = await golden('F4')
    const cindy = await who('Cindy')
    const body = await cal(await who('Ivy'))
    expect(body.timeOff).toEqual([
      {
        kind: 'masked',
        userId: cindy.id,
        startDate: '2026-10-12',
        endDate: '2026-10-14',
        half: null,
        label: th.masking.leave,
      },
    ])
    expect(Object.keys(body.timeOff[0]!).sort()).toEqual([
      'endDate',
      'half',
      'kind',
      'label',
      'startDate',
      'userId',
    ])
    expect(Object.keys(body.people)).toEqual([cindy.id])
    expect(body.people[cindy.id]).toEqual({
      id: cindy.id,
      displayName: 'Cindy',
      name: 'Cindy',
      positionName: 'Project Manager',
      color: cindy.color,
      active: true,
    })
    expect(JSON.stringify(body)).not.toContain('ลาพักร้อน')
    expect(body.viewer).toEqual({ userId: (await who('Ivy')).id, canEditOthers: false })
    expect(body).toMatchObject({ from: OCT.from, to: OCT.to, holidays: [] })
  })

  it('F3: Ivy sees no Peter at all; Jack (LEAD) sees Peter masked; Peter sees own full entry; manager full', async () => {
    const who = await golden('F3')
    const peter = await who('Peter')
    const ivy = await cal(await who('Ivy'))
    expect(ivy.timeOff).toEqual([])
    expect(ivy.people).toEqual({})
    expect(JSON.stringify(ivy)).not.toContain(peter.id)

    const jack = await cal(await who('Jack'))
    expect(jack.timeOff).toEqual([
      {
        kind: 'masked',
        userId: peter.id,
        startDate: '2026-10-05',
        endDate: '2026-10-06',
        half: null,
        label: th.masking.leave,
      },
    ])

    const own = await cal(peter)
    expect(own.timeOff).toHaveLength(1)
    expect(own.timeOff[0]).toMatchObject({
      kind: 'full',
      userId: peter.id,
      leaveTypeName: 'ลาพักร้อน',
      note: null,
    })
    const full = own.timeOff[0] as CalendarTimeOffFull
    expect(full).toEqual({
      kind: 'full',
      id: ANY_STRING,
      userId: peter.id,
      startDate: '2026-10-05',
      endDate: '2026-10-06',
      half: null,
      leaveTypeId: ANY_STRING,
      leaveTypeName: 'ลาพักร้อน',
      leaveTypeColor: '#0369A1',
      leaveTypeArchived: false,
      note: null,
    })

    const mgr = await cal(await who('Manager'))
    expect(mgr.timeOff.map((t) => t.kind)).toEqual(['full'])
    expect(mgr.viewer.canEditOthers).toBe(true)
  })

  it('F2: holidays in range only ([2026-10-19, 2026-10-26) has 10-23)', async () => {
    const who = await golden('F2')
    const ivy = await who('Ivy')
    expect((await cal(ivy, { from: '2026-10-19', to: '2026-10-26' })).holidays).toEqual([
      { date: '2026-10-23', name: 'วันหยุดสมมติสำหรับทดสอบ' },
    ])
    expect((await cal(ivy, { from: '2026-10-26', to: '2026-11-02' })).holidays).toEqual([])
  })
})

describe('getCalendar (factories)', () => {
  it('soft-deleted entries absent; a deactivated co-member’s leave is returned with active: false; sorted by start, then name', async () => {
    const viewer = await makeUser({ nickname: 'Viewer' })
    const gone = await makeUser({ name: 'Zed Former', nickname: 'Zed', deactivated: { on: '2026-10-20' } })
    const amy = await makeUser({ name: 'Amy Example', nickname: 'Amy' })
    await makeProject({ members: [viewer, gone, amy] })
    const lt = await makeLeaveType({ name: 'ลาทดสอบ', color: '#7E22CE' })
    await makeTimeOff({ user: gone, leaveType: lt, startDate: '2026-10-12', note: 'ลับ' })
    await makeTimeOff({ user: amy, leaveType: lt, startDate: '2026-10-12', endDate: '2026-10-13' })
    await makeTimeOff({ user: amy, leaveType: lt, startDate: '2026-10-05' })
    await makeTimeOff({
      user: amy,
      leaveType: lt,
      startDate: '2026-10-20',
      deleted: { batch: '00000000-0000-4000-8000-000000000003', daysAgo: 1 },
    })
    const body = await cal(toSessionUser(viewer))
    expect(body.timeOff.map((t) => [t.userId, t.startDate])).toEqual([
      [amy.id, '2026-10-05'],
      [amy.id, '2026-10-12'],
      [gone.id, '2026-10-12'],
    ])
    expect(body.people[gone.id]?.active).toBe(false)
    expect(body.people[amy.id]?.active).toBe(true)
    expect(JSON.stringify(body)).not.toContain('ลับ')
    expect(JSON.stringify(body)).not.toContain('ลาทดสอบ')
    expect(JSON.stringify(body)).not.toContain('#7E22CE')
  })
})

describe('GET /api/calendar', () => {
  const get = (qs: string) => GET(new Request(`http://t/api/calendar?${qs}`), { params: Promise.resolve({}) })

  async function asWorker(): Promise<TestUser> {
    const u = await makeUser()
    asUser(u)
    return u
  }

  it('200 with the CalendarResponse shape; Tuesday `from` → 400; 43-day span → 400; to = from → 400', async () => {
    vi.stubEnv('ALLOW_TEST_HOOKS', '1')
    vi.stubEnv('APP_NOW', '2026-09-30T10:00:00+07:00')
    const u = await asWorker()
    const lt = await makeLeaveType()
    await makeTimeOff({ user: u, leaveType: lt, startDate: '2026-10-07', note: 'ของฉัน' })
    const res = await get('from=2026-09-28&to=2026-11-09')
    expect(res.status).toBe(200)
    expect(res.headers.get('cache-control')).toBe('private, no-store')
    const body = (await res.json()) as CalendarResponse
    expect(body.timeOff).toMatchObject([{ kind: 'full', note: 'ของฉัน' }])
    expect(body.viewer).toEqual({ userId: u.id, canEditOthers: false })
    expect((await get('from=2026-09-29&to=2026-11-09')).status).toBe(400)
    expect((await get('from=2026-09-28&to=2026-11-16')).status).toBe(400)
    expect((await get('from=2026-09-28&to=2026-09-28')).status).toBe(400)
    expect((await get('from=x&to=2026-11-09')).status).toBe(400)
  })

  it('member sees a co-member masked; an outsider (no shared project) is not selected', async () => {
    const me = await makeUser()
    const co = await makeUser({ nickname: 'Co' })
    const stranger = await makeUser({ nickname: 'Stranger' })
    await makeProject({ members: [me, co] })
    const lt = await makeLeaveType({ name: 'ลาลับ' })
    const coEntry = await makeTimeOff({ user: co, leaveType: lt, startDate: '2026-10-08' })
    await makeTimeOff({ user: stranger, leaveType: lt, startDate: '2026-10-08' })
    asUser(me)
    const body = (await (await get('from=2026-10-05&to=2026-10-12')).json()) as CalendarResponse
    expect(body.timeOff).toEqual([
      {
        kind: 'masked',
        userId: co.id,
        startDate: '2026-10-08',
        endDate: '2026-10-08',
        half: null,
        label: th.masking.leave,
      },
    ])
    const text = JSON.stringify(body)
    for (const leak of [coEntry.id, lt.id, 'ลาลับ', stranger.id]) expect(text).not.toContain(leak)
  })
})
