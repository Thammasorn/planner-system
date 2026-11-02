// M10 S1.9/S1.10 — live-block data: GET /api/pages/:id/embed/{tasks,workload} (FR-1301…1304, AC-1302/1303, §7.8,
// M10-D1/D2/D3/D11; world 'home' + golden). today 2026-09-30.
import { and, eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { GET as embedTasksRoute } from '@/app/api/pages/[id]/embed/tasks/route'
import { GET as embedWorkloadRoute } from '@/app/api/pages/[id]/embed/workload/route'
import { addWeeks } from '@/domain/dates'
import type { ISODate } from '@/domain/types'
import type { EmbedTasksResponse, EmbedWorkloadResponse } from '@/lib/contracts/embed'
import { seedGolden } from '../../../scripts/lib/fixtures'
import { callRoute, okJson } from '../../../tests/authz/_support/http'
import { goldenProjectId, goldenUser, type GoldenProject, type GoldenViewer } from '../../../tests/authz/_support/golden'
import { asNobody, asUser, toSessionUser } from '../../../tests/helpers/as-user'
import { makePage, makeProject, makeUser } from '../../../tests/helpers/factories'
import { allNumbersInteger, containsAny } from '../../../tests/helpers/json'
import { createWorld, type World } from '../../../tests/helpers/world'
import { db } from '../db/client'
import { pages } from '../db/schema'
import { NotFoundError } from '../errors'
import type { SessionUser } from '../session'
import { getEmbedTasks, getEmbedWorkload } from './embed'
import { buildTable } from './workload'

const TODAY: ISODate = '2026-09-30'
const WS: ISODate = '2026-09-28'
const WINDOW = { from: WS, to: addWeeks(WS, 8) }

beforeEach(() => {
  vi.stubEnv('ALLOW_TEST_HOOKS', '1')
  vi.stubEnv('APP_NOW', '2026-09-30T10:00:00+07:00')
})

const su = toSessionUser
const golden = async (n: GoldenViewer): Promise<SessionUser> => toSessionUser(await goldenUser(n))
const tasksOf = (user: SessionUser, pageId: string) => getEmbedTasks(db, user, pageId)
const workloadOf = (user: SessionUser, pageId: string) => getEmbedWorkload(db, user, pageId, TODAY)

function project<T extends { kind: string }>(r: T): Extract<T, { kind: 'project' }> {
  if (r.kind !== 'project') throw new Error(`expected kind 'project', got ${r.kind}`)
  return r as Extract<T, { kind: 'project' }>
}

async function charterOf(name: GoldenProject): Promise<string> {
  const pid = await goldenProjectId(name)
  const [row] = await db
    .select({ id: pages.id })
    .from(pages)
    .where(and(eq(pages.projectId, pid), eq(pages.isCharter, true)))
  if (!row) throw new Error(`no charter for ${name}`)
  return row.id
}

describe('embed tasks (FR-1301/1302/1304, M10-D2/D3)', () => {
  let w: World
  beforeEach(async () => {
    w = await createWorld({ with: ['home'] })
  })

  it('member + pEmbed → P tasks tab payload, editable', async () => {
    const r = project(await tasksOf(su(w.member), w.pages.pEmbed.id))
    expect(r).toMatchObject({ projectId: w.P.id, projectName: w.P.name, tasksHref: `/projects/${w.P.id}/tasks` })
    expect(r.data.project.id).toBe(w.P.id)
    expect(r.data.statuses).toHaveLength(6)
    expect(r.data.tasks.map((t) => t.id)).toContain(w.tasks.pParent.id)
    expect(r.data.viewer.canEdit).toBe(true)
    expect(r.data.tasks.every((t) => t.projectId === w.P.id)).toBe(true)
  })

  it('outsider + qEmbed (same content) → Q tasks (binding by page, AC-1302)', async () => {
    const r = project(await tasksOf(su(w.outsider), w.pages.qEmbed.id))
    expect(r.projectId).toBe(w.Q.id)
    expect(r.data.tasks.map((t) => t.id)).toContain(w.tasks.qTask.id)
    expect(containsAny(r, [w.P.name, w.P.id, w.tasks.pParent.name])).toEqual([])
  })

  it('wiki page → { kind: wiki }; archived A → read-only', async () => {
    expect(await tasksOf(su(w.member), w.pages.wikiEmbed.id)).toEqual({ kind: 'wiki' })
    expect(project(await tasksOf(su(w.member), w.pages.aEmbed.id)).data.viewer.canEdit).toBe(false)
  })

  it('outsider + pEmbed → NotFoundError; soft-deleted page → NotFoundError', async () => {
    await expect(tasksOf(su(w.outsider), w.pages.pEmbed.id)).rejects.toBeInstanceOf(NotFoundError)
    await db.update(pages).set({ deletedAt: new Date() }).where(eq(pages.id, w.pages.pEmbed.id))
    await expect(tasksOf(su(w.member), w.pages.pEmbed.id)).rejects.toBeInstanceOf(NotFoundError)
  })

  it('route: 200 / 404 invisible / 404 malformed / 401 nobody', async () => {
    asUser(w.member)
    const ok = await okJson<EmbedTasksResponse>(
      await callRoute(embedTasksRoute, `/api/pages/${w.pages.pEmbed.id}/embed/tasks`, { id: w.pages.pEmbed.id }),
    )
    expect(ok.kind).toBe('project')
    asUser(w.outsider)
    const hidden = await callRoute(embedTasksRoute, `/api/pages/${w.pages.pEmbed.id}/embed/tasks`, {
      id: w.pages.pEmbed.id,
    })
    expect(hidden.status).toBe(404)
    expect(containsAny(await hidden.json(), [w.P.name])).toEqual([])
    expect((await callRoute(embedTasksRoute, '/api/pages/nope/embed/tasks', { id: 'nope' })).status).toBe(404)
    asNobody()
    expect(
      (await callRoute(embedTasksRoute, `/api/pages/${w.pages.pEmbed.id}/embed/tasks`, { id: w.pages.pEmbed.id }))
        .status,
    ).toBe(401)
  })
})

describe('embed workload (FR-1303, AC-1303, M10-D11)', () => {
  let w: World
  beforeEach(async () => {
    w = await createWorld({ with: ['home'] })
  })

  it('member + pEmbed: 8 weeks, P members sorted, coworker 10-05 with a masked Q part, no Q leak', async () => {
    const r = project(await workloadOf(su(w.member), w.pages.pEmbed.id))
    expect(r.weeks).toHaveLength(8)
    expect(r.weeks[0]).toBe('2026-09-28')
    expect(r.weeks.at(-1)).toBe('2026-11-16')
    expect(r).toMatchObject({ projectId: w.P.id, archived: false, workloadHref: `/workload?projectId=${w.P.id}` })
    const ids = r.people.map((p) => p.userId)
    expect(new Set(ids)).toEqual(new Set([w.lead.id, w.member.id, w.users.coworker!.id, w.users.pOnly!.id]))
    const sorted = [...r.people].sort((a, b) => new Intl.Collator('th').compare(a.name, b.name))
    expect(r.people.map((p) => p.userId)).toEqual(sorted.map((p) => p.userId))
    const cw = r.people.find((p) => p.userId === w.users.coworker!.id)!.cells['2026-10-05']!
    expect(cw.total).toBe(400)
    expect(cw.byProject).toContainEqual(expect.objectContaining({ projectId: w.P.id, total: 100 }))
    expect(cw.byProject).toContainEqual(expect.objectContaining({ projectId: null, total: 300, committed: 300 }))
    expect(
      containsAny(r, [
        w.Q.name,
        w.Q.id,
        w.tasks.qTask.name,
        w.tasks.qTask.id,
        w.assignments.qTaskCoworker.id,
      ]),
    ).toEqual([])
    expect(allNumbersInteger(r)).toBe(true)
  })

  it('outsider + qEmbed: coworker’s P load masked, no P name or task', async () => {
    const r = project(await workloadOf(su(w.outsider), w.pages.qEmbed.id))
    const cw = r.people.find((p) => p.userId === w.users.coworker!.id)!.cells['2026-10-05']!
    expect(cw.byProject).toContainEqual(expect.objectContaining({ projectId: null, total: 100 }))
    expect(containsAny(r, [w.P.name, w.P.id, 'งานร่วม P-ลับ03'])).toEqual([])
  })

  it('archived A (C49): archived true, people [lead, member], A load not counted, parity with buildTable', async () => {
    const r = project(await workloadOf(su(w.member), w.pages.aEmbed.id))
    expect(r.archived).toBe(true)
    expect(new Set(r.people.map((p) => p.userId))).toEqual(new Set([w.lead.id, w.member.id]))
    for (const p of r.people) {
      for (const c of Object.values(p.cells)) expect(c.byProject.some((x) => x.projectId === w.A.id)).toBe(false)
    }
    expect(Object.keys(r.projects)).not.toContain(w.A.id)
    const ref = await buildTable(db, su(w.member), { window: WINDOW, userIds: [w.lead.id, w.member.id] }, TODAY)
    for (const p of ref.groups.flatMap((g) => g.people)) {
      expect(r.people.find((x) => x.userId === p.userId)!.cells).toEqual(p.cells)
    }
  })

  it('an archived project whose only member has no other project and no load → people [] (also for the manager)', async () => {
    const fresh = await makeUser()
    const X = await makeProject({ archived: true, members: [fresh], createdBy: w.manager })
    const page = await makePage({ project: X, title: 'ฝังในโปรเจคเก็บ', createdBy: w.manager })
    expect(project(await workloadOf(su(fresh), page.id)).people).toEqual([])
    expect(project(await workloadOf(su(w.manager), page.id)).people).toEqual([])
  })

  it('wiki → { kind: wiki }; invisible → NotFoundError', async () => {
    expect(await workloadOf(su(w.member), w.pages.wikiEmbed.id)).toEqual({ kind: 'wiki' })
    await expect(workloadOf(su(w.outsider), w.pages.pEmbed.id)).rejects.toBeInstanceOf(NotFoundError)
  })

  it('parity: each person/week cell equals buildTable({ userIds: [person] }) (same masking, FR-1303)', async () => {
    const viewer = su(w.member)
    const r = project(await workloadOf(viewer, w.pages.pEmbed.id))
    for (const p of r.people) {
      const ref = await buildTable(db, viewer, { window: WINDOW, userIds: [p.userId] }, TODAY)
      const refPerson = ref.groups.flatMap((g) => g.people).find((x) => x.userId === p.userId)!
      expect(p.cells).toEqual(refPerson.cells)
    }
  })

  it('route: 200 for member, 404 for outsider, 404 malformed', async () => {
    asUser(w.member)
    const body = await okJson<EmbedWorkloadResponse>(
      await callRoute(embedWorkloadRoute, `/api/pages/${w.pages.pEmbed.id}/embed/workload`, {
        id: w.pages.pEmbed.id,
      }),
    )
    expect(project(body).weeks[0]).toBe(WS)
    asUser(w.outsider)
    expect(
      (
        await callRoute(embedWorkloadRoute, `/api/pages/${w.pages.pEmbed.id}/embed/workload`, {
          id: w.pages.pEmbed.id,
        })
      ).status,
    ).toBe(404)
    expect((await callRoute(embedWorkloadRoute, '/api/pages/x/embed/workload', { id: 'x' })).status).toBe(404)
  })
})

describe('embeds on golden charters (FR-1305, AC-1303)', () => {
  beforeEach(async () => {
    await seedGolden(db)
  })

  it('Peter on the DW charter → DW tasks only; Ivy on the POS charter → POS tasks only', async () => {
    const dw = project(await tasksOf(await golden('Peter'), await charterOf('Data Warehouse')))
    expect(dw.data.tasks.map((t) => t.name)).toEqual(['ย้าย pipeline ขึ้น BigQuery'])
    const posId = await goldenProjectId('POS Upgrade')
    const pos = project(await tasksOf(await golden('Ivy'), await charterOf('POS Upgrade')))
    expect(pos.projectId).toBe(posId)
    expect(pos.data.tasks.length).toBeGreaterThan(0)
    expect(pos.data.tasks.every((t) => t.projectId === posId)).toBe(true)
  })

  it('Ivy on the POS charter: people [Cindy, Ivy, Mint]; Mint 09-28 = 250 entirely masked; no Mobile leak', async () => {
    const r = project(await workloadOf(await golden('Ivy'), await charterOf('POS Upgrade')))
    expect(r.people.map((p) => p.name)).toEqual(['Cindy', 'Ivy', 'Mint'])
    const mint = r.people.find((p) => p.name === 'Mint')!.cells['2026-09-28']!
    expect(mint.total).toBe(250)
    expect(mint.byProject.filter((x) => x.projectId !== null).reduce((s, x) => s + x.total, 0)).toBe(0)
    expect(mint.byProject.find((x) => x.projectId === null)!.total).toBe(250)
    expect(containsAny(r, ['Mobile App Revamp', 'พัฒนา front-end'])).toEqual([])
    expect(r.people.map((p) => p.name)).not.toContain('Peter')
  })
})
