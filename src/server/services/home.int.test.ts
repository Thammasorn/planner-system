// M10 S1.1–S1.7 — the /home dashboard (FR-1101 a–f, M10-D13…D19/D34; r8 §4.6/§4.9/§4.10 golden facts; world 'home').
// today 2026-09-30 (Wed), weekStart 2026-09-28.
import { eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { GET as homeRoute } from '@/app/api/home/route'
import type { ISODate } from '@/domain/types'
import { th } from '@/i18n/th'
import type { HomeLeaveEntry, HomeResponse } from '@/lib/contracts/home'
import { addMilestones, applyFixture, seedGolden, type FixtureId } from '../../../scripts/lib/fixtures'
import { callRoute, okJson } from '../../../tests/authz/_support/http'
import { goldenUser, type GoldenViewer } from '../../../tests/authz/_support/golden'
import { asNobody, asUser, toSessionUser } from '../../../tests/helpers/as-user'
import {
  makeAllocation,
  makeAssignment,
  makePage,
  makeProject,
  makeTask,
  makeTaskBody,
  makeUser,
} from '../../../tests/helpers/factories'
import { allNumbersInteger, containsAny } from '../../../tests/helpers/json'
import { createWorld, type World } from '../../../tests/helpers/world'
import { db } from '../db/client'
import { pages } from '../db/schema'
import type { SessionUser } from '../session'
import {
  getHome,
  homeLeave,
  homeMilestones,
  managerCards,
  myLoad,
  myTasksThisWeek,
  recentPages,
} from './home'
import { listMyTaskBuckets } from './my-tasks'
import { completeTask } from './taskStatus'

const TODAY: ISODate = '2026-09-30'
const WS: ISODate = '2026-09-28'
const NOW = new Date('2026-09-30T10:00:00+07:00')

beforeEach(() => {
  vi.stubEnv('ALLOW_TEST_HOOKS', '1')
  vi.stubEnv('APP_NOW', '2026-09-30T10:00:00+07:00')
})

const golden = async (n: GoldenViewer): Promise<SessionUser> => toSessionUser(await goldenUser(n))
async function seed(...fixtures: FixtureId[]): Promise<void> {
  await seedGolden(db)
  for (const f of fixtures) await applyFixture(db, f)
}
const su = toSessionUser
const leaveNames = (xs: readonly HomeLeaveEntry[]) => xs.map((x) => x.name)

// ── S1.1 myTasks ──────────────────────────────────────────────────────────────────────────────────────────────────

describe('myTasks (FR-1101a, M10-D13)', () => {
  it('golden F1: one THIS_WEEK task per worker, Manager none (r8 §4.10)', async () => {
    await seed()
    const pick = async (n: GoldenViewer) =>
      (await myTasksThisWeek(db, await golden(n), TODAY)).items.map((t) => [t.name, t.project.name, t.plannedCd])
    expect(await pick('Cindy')).toEqual([['ปรับปรุงระบบ POS หน้าร้าน', 'POS Upgrade', 250]])
    expect(await pick('Ivy')).toEqual([['ทำ UAT + คู่มือหน้าร้าน', 'POS Upgrade', 250]])
    expect(await pick('Peter')).toEqual([['ย้าย pipeline ขึ้น BigQuery', 'Data Warehouse', 500]])
    expect(await pick('Jack')).toEqual([['ออกแบบ flow ใหม่', 'Mobile App Revamp', 375]])
    expect(await pick('Mint')).toEqual([['พัฒนา front-end', 'Mobile App Revamp', 250]])
    expect(await myTasksThisWeek(db, await golden('Manager'), TODAY)).toEqual({ items: [], more: 0 })
  })

  describe('world', () => {
    let w: World
    beforeEach(async () => {
      w = await createWorld({ with: ['home'] })
    })

    it('member: planned pChildA present; unplanned pDueThisWeek and archived aTask absent; gone after completion', async () => {
      const ids = async () => (await myTasksThisWeek(db, su(w.member), TODAY)).items.map((t) => t.id)
      const before = await ids()
      expect(before).toContain(w.tasks.pChildA.id)
      expect(before).not.toContain(w.tasks.pDueThisWeek.id)
      expect(before).not.toContain(w.tasks.aTask.id)
      await db.transaction((tx) =>
        completeTask(tx, su(w.member), { projectId: w.P.id, taskIds: [w.tasks.pChildA.id], withChildren: false }, TODAY),
      )
      expect(await ids()).not.toContain(w.tasks.pChildA.id)
    })

    it('21 THIS_WEEK tasks → 20 items + more 1; items equal M9 /my THIS_WEEK bucket (parity)', async () => {
      for (let i = 0; i < 20; i++) {
        const t = await makeTask({ project: w.P, name: `งานสัปดาห์นี้ ${i}`, createdBy: w.manager })
        const a = await makeAssignment({ task: t, user: w.member })
        await makeAllocation({ assignment: a, period: WS, cd: 25 })
      }
      const r = await myTasksThisWeek(db, su(w.member), TODAY)
      expect(r.items).toHaveLength(20)
      expect(r.more).toBe(1)
      const bucket = (await listMyTaskBuckets(db, su(w.member), TODAY)).buckets.find((b) => b.key === 'THIS_WEEK')!
      expect(bucket.tasks).toHaveLength(21)
      expect(r.items).toEqual(bucket.tasks.slice(0, 20))
    })
  })
})

// ── S1.2 myLoad ───────────────────────────────────────────────────────────────────────────────────────────────────

describe('myLoad (FR-1101b, BR-40/45, M10-D14)', () => {
  const totals = async (n: GoldenViewer) => (await myLoad(db, await golden(n), WS)).map((x) => x.cell.total)

  it('golden F1: 8 weeks of totals, capacity 500, all OK, integers (r8 §4.10)', async () => {
    await seed()
    expect(await totals('Cindy')).toEqual([250, 250, 250, 375, 375, 250, 0, 0])
    expect(await totals('Peter')).toEqual([500, 500, 375, 250, 0, 250, 375, 500])
    expect(await totals('Mint')).toEqual([250, 500, 500, 500, 500, 375, 250, 0])
    const cindy = await myLoad(db, await golden('Cindy'), WS)
    expect(cindy.map((x) => x.week)).toEqual([
      '2026-09-28',
      '2026-10-05',
      '2026-10-12',
      '2026-10-19',
      '2026-10-26',
      '2026-11-02',
      '2026-11-09',
      '2026-11-16',
    ])
    for (const n of ['Cindy', 'Peter', 'Mint'] as const) {
      const r = await myLoad(db, await golden(n), WS)
      expect(r.every((x) => x.cell.capacity === 500 && x.cell.level === 'OK')).toBe(true)
      expect(allNumbersInteger(r)).toBe(true)
    }
  })

  it('F3: Peter 2026-10-05 OVER by capacity', async () => {
    await seed('F3')
    const r = await myLoad(db, await golden('Peter'), WS)
    expect(r.find((x) => x.week === '2026-10-05')!.cell).toMatchObject({
      total: 500,
      committed: 500,
      capacity: 300,
      level: 'OVER',
      excess: 200,
      cause: 'CAPACITY',
    })
  })

  it('F4: Cindy 2026-10-12 RISK (tentative)', async () => {
    await seed('F4')
    const r = await myLoad(db, await golden('Cindy'), WS)
    expect(r.find((x) => x.week === '2026-10-12')!.cell).toMatchObject({
      total: 250,
      committed: 0,
      capacity: 200,
      level: 'RISK',
    })
  })

  it('Manager (outside M9 population) → 8 empty cells with capacity 500', async () => {
    await seed()
    const r = await myLoad(db, await golden('Manager'), WS)
    expect(r).toHaveLength(8)
    for (const x of r) expect(x.cell).toMatchObject({ total: 0, capacity: 500, level: 'OK' })
  })
})

// ── S1.3 milestones ───────────────────────────────────────────────────────────────────────────────────────────────

describe('milestones (FR-1101c, FR-705, M10-D15)', () => {
  describe('world', () => {
    let w: World
    beforeEach(async () => {
      w = await createWorld({ with: ['home'] })
    })

    it('member: overdue first, then upcoming; never outside the window, DONE, Q or archived A', async () => {
      const r = await homeMilestones(db, su(w.member), TODAY)
      expect(r.map((m) => [m.id, m.status])).toEqual([
        [w.milestones.pOverdue.id, 'OVERDUE'],
        [w.milestones.pLate.id, 'DUE_SOON'],
      ])
      expect(r[1]).toMatchObject({ name: 'ส่งมอบรอบแรก P', late: true })
      const ids = r.map((m) => m.id)
      for (const m of [w.milestones.p, w.milestones.pDone, w.milestones.q, w.milestones.qSoon, w.milestones.a]) {
        expect(ids).not.toContain(m.id)
      }
      expect(ids).not.toContain(w.milestones.pAncient.id) // 2026-08-31: beyond the 4-week look-back
    })

    it('outsider → [qSoon]; manager → [pOverdue, pLate, qSoon]', async () => {
      expect((await homeMilestones(db, su(w.outsider), TODAY)).map((m) => [m.id, m.status])).toEqual([
        [w.milestones.qSoon.id, 'DUE_SOON'],
      ])
      expect((await homeMilestones(db, su(w.manager), TODAY)).map((m) => m.id)).toEqual([
        w.milestones.pOverdue.id,
        w.milestones.pLate.id,
        w.milestones.qSoon.id,
      ])
    })
  })

  it('golden + A.2: Cindy → UAT sign-off only (no Mobile/DW leak); Manager → + Design freeze; Jack → Design freeze', async () => {
    await seed()
    await addMilestones(db)
    const cindy = await homeMilestones(db, await golden('Cindy'), TODAY)
    expect(cindy.map((m) => [m.name, m.status, m.late])).toEqual([['UAT sign-off', 'DUE_SOON', true]])
    expect(containsAny(cindy, ['Pipeline พร้อมใช้งาน', 'Design freeze', 'Beta release', 'Dashboard v1 review'])).toEqual(
      [],
    )
    expect((await homeMilestones(db, await golden('Manager'), TODAY)).map((m) => [m.name, m.status])).toEqual([
      ['UAT sign-off', 'DUE_SOON'],
      ['Design freeze', 'UPCOMING'],
    ])
    expect((await homeMilestones(db, await golden('Jack'), TODAY)).map((m) => m.name)).toEqual(['Design freeze'])
  })
})

// ── S1.4 leave ────────────────────────────────────────────────────────────────────────────────────────────────────

describe('leave (FR-1101d, MASK-5, X60b, M10-D16)', () => {
  describe('world', () => {
    let w: World
    beforeEach(async () => {
      w = await createWorld({ with: ['home'] })
    })
    const SECRETS = ['โน้ตลับ-โลก-03', 'โน้ตลับ-โลก-04', 'ลาพักร้อน-โลก', 'ลาป่วย-โลก']

    it('member: coworker masked today, pOnly masked next week; no note, type or id leaks', async () => {
      const r = await homeLeave(db, su(w.member), TODAY)
      expect(r.today.map((x) => [x.userId, x.entry])).toEqual([
        [
          w.users.coworker!.id,
          {
            kind: 'masked',
            userId: w.users.coworker!.id,
            startDate: '2026-09-30',
            endDate: '2026-09-30',
            half: null,
            label: th.masking.leave,
          },
        ],
      ])
      expect(r.thisWeek).toEqual([])
      expect(r.nextWeek.map((x) => x.entry)).toEqual([
        {
          kind: 'masked',
          userId: w.users.pOnly!.id,
          startDate: '2026-10-06',
          endDate: '2026-10-07',
          half: null,
          label: th.masking.leave,
        },
      ])
      expect(containsAny(r, [...SECRETS, w.timeOff.coworkerToday.id, w.timeOff.pOnlyNextWeek.id])).toEqual([])
    })

    it('outsider: coworker masked today, pOnly nowhere', async () => {
      const r = await homeLeave(db, su(w.outsider), TODAY)
      expect(r.today.map((x) => [x.userId, x.entry.kind])).toEqual([[w.users.coworker!.id, 'masked']])
      expect(containsAny(r, [w.users.pOnly!.id, ...SECRETS])).toEqual([])
    })

    it('manager sees full entries; coworker sees own entry full', async () => {
      const m = await homeLeave(db, su(w.manager), TODAY)
      expect(m.today[0]!.entry).toMatchObject({ kind: 'full', leaveTypeName: 'ลาพักร้อน-โลก' })
      expect(m.nextWeek[0]!.entry).toMatchObject({ kind: 'full', leaveTypeName: 'ลาป่วย-โลก' })
      const self = await homeLeave(db, su(w.users.coworker!), TODAY)
      expect(self.today[0]!.entry).toMatchObject({ kind: 'full', id: w.timeOff.coworkerToday.id })
    })
  })

  it('golden F3: Cindy (LEAD) sees Peter masked next week; Ivy sees nothing; Manager full; Peter own full', async () => {
    await seed('F3')
    const cindy = await homeLeave(db, await golden('Cindy'), TODAY)
    expect(cindy.nextWeek.map((x) => [x.name, x.entry.kind, x.entry.startDate, x.entry.endDate])).toEqual([
      ['Peter', 'masked', '2026-10-05', '2026-10-06'],
    ])
    expect(leaveNames(cindy.today)).toEqual([])
    expect(await homeLeave(db, await golden('Ivy'), TODAY)).toEqual({ today: [], thisWeek: [], nextWeek: [] })
    const mgr = await homeLeave(db, await golden('Manager'), TODAY)
    expect(mgr.nextWeek[0]!.entry).toMatchObject({ kind: 'full', leaveTypeName: 'ลาพักร้อน' })
    const own = await homeLeave(db, await golden('Peter'), TODAY)
    expect(own.nextWeek[0]!.entry.kind).toBe('full')
  })
})

// ── S1.5 recent pages ─────────────────────────────────────────────────────────────────────────────────────────────

describe('recentPages (FR-1101e, M10-D17)', () => {
  describe('world', () => {
    let w: World
    beforeEach(async () => {
      w = await createWorld({ with: ['home'] })
    })

    it('outsider: qRecent first, only Q + wiki pages; no P/A titles', async () => {
      const r = await recentPages(db, su(w.outsider))
      expect(r[0]).toMatchObject({
        id: w.pages.qRecent.id,
        title: 'หน้าล่าสุด Q-ลับ18',
        projectName: w.Q.name,
        href: `/p/${w.pages.qRecent.id}`,
      })
      expect(r.every((p) => p.projectName === null || p.projectName === w.Q.name)).toBe(true)
      expect(containsAny(r, ['หน้า P-ลับ05', 'Charter P-ลับ04', 'หน้า A-ลับ10', w.P.name, w.A.name])).toEqual([])
      expect(r[0]!.updatedAt).toBe('2026-09-30T02:00:00.000Z')
      expect(r[0]!.updatedBy.id).toBe(w.manager.id)
    })

    it('member: P (+ A) + wiki, never Q pages; ≤ 8', async () => {
      const r = await recentPages(db, su(w.member))
      expect(r).toHaveLength(8)
      expect(containsAny(r, ['หน้าล่าสุด Q-ลับ18', w.Q.name])).toEqual([])
    })

    it('a deleted page and a TASK body are absent even when newest; editor name = display name', async () => {
      const gone = await makePage({ project: w.P, title: 'ลบล่าสุด', createdBy: w.manager })
      await db.update(pages).set({ deletedAt: new Date() }).where(eq(pages.id, gone.id))
      const body = await makeTaskBody({ task: w.tasks.pDueThisWeek, createdBy: w.manager })
      const fresh = await makePage({ project: w.P, title: 'สดใหม่', createdBy: w.lead })
      const r = await recentPages(db, su(w.member))
      expect(r[0]!.id).toBe(fresh.id)
      const ids = r.map((p) => p.id)
      expect(ids).not.toContain(gone.id)
      expect(ids).not.toContain(body.id)
      expect(r[0]!.updatedBy.name).toBe(w.lead.nickname ?? w.lead.name)
    })
  })

  it('golden: Cindy sees the POS and CRM charters only', async () => {
    await seed()
    const r = await recentPages(db, await golden('Cindy'))
    const projectsSeen = new Set(r.map((p) => p.projectName))
    expect(projectsSeen.has('POS Upgrade')).toBe(true)
    expect(projectsSeen.has('CRM Migration')).toBe(true)
    expect(containsAny(r, ['Data Warehouse', 'Mobile App Revamp', 'Store Analytics Dashboard'])).toEqual([])
  })
})

// ── S1.6 manager cards ────────────────────────────────────────────────────────────────────────────────────────────

describe('managerCards (FR-1101f, X67, M9-D3, M10-D18)', () => {
  it('golden F1: nobody overloaded; 4-week utilisation 72.5 % over 5 workers (r8 §4.6)', async () => {
    await seed()
    const r = (await managerCards(db, await golden('Manager'), WS, TODAY))!
    expect(r.overloaded).toEqual([])
    expect(r.utilisation.weeks.map((x) => [x.week, x.totalCd, x.capacityCd, x.percentTenths])).toEqual([
      ['2026-09-28', 1625, 2500, 650],
      ['2026-10-05', 1875, 2500, 750],
      ['2026-10-12', 1875, 2500, 750],
      ['2026-10-19', 1875, 2500, 750],
    ])
    expect(r.utilisation.weeks.map((x) => x.committedPercentTenths)).toEqual([650, 650, 550, 500])
    expect(r.utilisation.total).toMatchObject({
      week: WS,
      totalCd: 7250,
      capacityCd: 10000,
      percentTenths: 725,
      committedCd: 5875,
      committedPercentTenths: 588,
    })
    expect(allNumbersInteger(r)).toBe(true)
  })

  it('F3: Peter OVER 2026-10-05 by capacity; utilisation 74.0 %', async () => {
    await seed('F3')
    const r = (await managerCards(db, await golden('Manager'), WS, TODAY))!
    expect(r.overloaded).toHaveLength(1)
    expect(r.overloaded[0]).toMatchObject({
      name: 'Peter',
      week: '2026-10-05',
      level: 'OVER',
      excess: 200,
      cause: 'CAPACITY',
    })
    expect(r.utilisation.total).toMatchObject({ totalCd: 7250, capacityCd: 9800, percentTenths: 740 })
  })

  it('F2: overload in 10-19 is outside this week and next → []', async () => {
    await seed('F2')
    expect((await managerCards(db, await golden('Manager'), WS, TODAY))!.overloaded).toEqual([])
  })

  it('every worker (Cindy as LEAD included) → null', async () => {
    await seed()
    for (const n of ['Cindy', 'Ivy', 'Peter', 'Jack', 'Mint'] as const) {
      expect(await managerCards(db, await golden(n), WS, TODAY)).toBeNull()
    }
  })
})

// ── S1.7 getHome + route ──────────────────────────────────────────────────────────────────────────────────────────

describe('getHome + GET /api/home (FR-1101, M10-D34)', () => {
  it('shape, clock and integers; manager null for workers', async () => {
    const w = await createWorld({ with: ['home'] })
    const r = await db.transaction((tx) => getHome(tx, su(w.member), { today: TODAY, now: NOW }))
    expect(Object.keys(r)).toEqual([
      'today',
      'now',
      'weekStart',
      'myTasks',
      'myLoad',
      'milestones',
      'leave',
      'recentPages',
      'manager',
    ])
    expect(r).toMatchObject({ today: TODAY, weekStart: WS, now: NOW.toISOString(), manager: null })
    expect(r.myLoad).toHaveLength(8)
    expect(allNumbersInteger(r)).toBe(true)
  })

  it('route: 200 with private no-store for the manager; 401 for nobody', async () => {
    const w = await createWorld({ with: ['home'] })
    asUser(w.manager)
    const res = await callRoute(homeRoute, '/api/home')
    expect(res.headers.get('Cache-Control')).toBe('private, no-store')
    const body = await okJson<HomeResponse>(res)
    expect(body).toMatchObject({ today: TODAY, weekStart: WS })
    expect(body.manager).not.toBeNull()
    expect(allNumbersInteger(body)).toBe(true)
    asNobody()
    expect((await callRoute(homeRoute, '/api/home')).status).toBe(401)
  })

  it('a user with no projects gets empty cards (no error)', async () => {
    const lone = await makeUser()
    await makeProject() // unrelated project
    const r = await db.transaction((tx) => getHome(tx, su(lone), { today: TODAY, now: NOW }))
    expect(r.myTasks).toEqual({ items: [], more: 0 })
    expect(r.milestones).toEqual([])
    expect(r.myLoad).toHaveLength(8)
  })
})
