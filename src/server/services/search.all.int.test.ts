// M10 S1.8 — Cmd/Ctrl+K over every category + the palette's local index (FR-1102/1104/1105, X68, M10-D20/D21/D30).
// Extends M4's search.int.test.ts (pages) and M6.1's search.tasks.int.test.ts (tasks), which stay unchanged.
import { eq, sql } from 'drizzle-orm'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { GET as searchRoute } from '@/app/api/search/route'
import { GET as indexRoute } from '@/app/api/search/index/route'
import type { SearchAllResponse, SearchIndexResponse } from '@/lib/contracts/search'
import { seedGolden } from '../../../scripts/lib/fixtures'
import { callRoute, okJson } from '../../../tests/authz/_support/http'
import { goldenUser, type GoldenViewer } from '../../../tests/authz/_support/golden'
import { asNobody, asUser, toSessionUser } from '../../../tests/helpers/as-user'
import { deactivateUser, makeTask } from '../../../tests/helpers/factories'
import { containsAny } from '../../../tests/helpers/json'
import { createWorld, type World } from '../../../tests/helpers/world'
import { db } from '../db/client'
import { projects, tasks } from '../db/schema'
import type { SessionUser } from '../session'
import { searchAll, searchIndex } from './search'

beforeEach(() => {
  vi.stubEnv('ALLOW_TEST_HOOKS', '1')
  vi.stubEnv('APP_NOW', '2026-09-30T10:00:00+07:00')
})

const su = toSessionUser
const golden = async (n: GoldenViewer): Promise<SessionUser> => toSessionUser(await goldenUser(n))
const all = (user: SessionUser, q: string, titleOnly = false): Promise<SearchAllResponse> =>
  db.transaction((tx) => searchAll(tx, user, q, { titleOnly }), { accessMode: 'read only' })
const searchHttp = async (q: string, titleOnly = false): Promise<SearchAllResponse> =>
  okJson<SearchAllResponse>(
    await callRoute(searchRoute, `/api/search?q=${encodeURIComponent(q)}${titleOnly ? '&titleOnly=1' : ''}`),
  )

describe('searchAll — golden visibility (FR-1104, r6b §5 M10)', () => {
  beforeEach(async () => {
    await seedGolden(db)
  })

  it("tasks 'ลูกค้า': Cindy and Ivy see the CRM task, Jack none", async () => {
    for (const n of ['Cindy', 'Ivy'] as const) {
      expect((await all(await golden(n), 'ลูกค้า')).tasks.map((t) => t.name)).toContain('ย้ายข้อมูลลูกค้า')
    }
    expect((await all(await golden('Jack'), 'ลูกค้า')).tasks).toEqual([])
  })

  it("projects 'POS': Cindy → [POS Upgrade], Peter → []", async () => {
    const cindy = (await all(await golden('Cindy'), 'POS')).projects
    expect(cindy.map((p) => p.name)).toEqual(['POS Upgrade'])
    expect(cindy[0]).toMatchObject({ kind: 'project', archived: false, href: `/projects/${cindy[0]!.id}` })
    expect((await all(await golden('Peter'), 'POS')).projects).toEqual([])
  })

  it("people 'Pat': Ivy → [], Cindy (LEAD → everyone) → [Peter]", async () => {
    expect((await all(await golden('Ivy'), 'Pat')).people).toEqual([])
    const cindy = (await all(await golden('Cindy'), 'Pat')).people
    expect(cindy.map((p) => p.nickname)).toEqual(['Peter'])
    expect(cindy[0]).toMatchObject({ kind: 'person', active: true, href: `/people/${cindy[0]!.id}` })
  })

  it("clients 'Com': Peter → [Coral], Jack → []; 'Studio' as Ivy → [Sunrise]", async () => {
    const p = (await all(await golden('Peter'), 'Com')).clients
    expect(p.map((c) => c.name)).toEqual(['Coral'])
    expect(p[0]).toMatchObject({ kind: 'client', archived: false, href: `/clients/${p[0]!.id}` })
    expect((await all(await golden('Jack'), 'Com')).clients).toEqual([])
    expect((await all(await golden('Ivy'), 'Studio')).clients.map((c) => c.name)).toEqual(['Sunrise'])
  })

  it('timing: searchAll for ลูกค้า on the golden DB < 500 ms (M10-D30; full scale is M12)', async () => {
    const cindy = await golden('Cindy')
    await all(cindy, 'ลูกค้า') // warm-up (plans, connection)
    const t0 = performance.now()
    await db.transaction(
      async (tx) => {
        await tx.execute(sql`set local statement_timeout = '500ms'`)
        return searchAll(tx, cindy, 'ลูกค้า', { titleOnly: false })
      },
      { accessMode: 'read only' },
    )
    const ms = performance.now() - t0
    console.info(`[M10 search timing] searchAll('ลูกค้า') = ${ms.toFixed(1)} ms`)
    expect(ms).toBeLessThan(500)
  })
})

describe('searchAll — world', () => {
  let w: World
  beforeEach(async () => {
    w = await createWorld({ with: ['home'] })
  })

  it('escaping: _ % \\ are literals (FR-1105)', async () => {
    const ab = await makeTask({ project: w.P, name: 'a_b', createdBy: w.manager })
    await makeTask({ project: w.P, name: 'axb', createdBy: w.manager })
    expect((await all(su(w.member), 'a_b')).tasks.map((t) => t.id)).toEqual([ab.id])
    const pct = await all(su(w.member), '%')
    expect([...pct.projects, ...pct.tasks, ...pct.pages, ...pct.people, ...pct.clients]).toEqual([])
    await expect(all(su(w.member), '\\')).resolves.toBeDefined()
  })

  it("ranking: exact 'ลูกค้า' first; completed after open; ≤ 8", async () => {
    await makeTask({ project: w.P, name: 'ข้อมูลลูกค้าเก่า', createdBy: w.manager })
    await makeTask({ project: w.P, name: 'ย้ายข้อมูลลูกค้า', createdBy: w.manager })
    const exact = await makeTask({ project: w.P, name: 'ลูกค้า', createdBy: w.manager })
    const done = await makeTask({ project: w.P, name: 'ลูกค้า', createdBy: w.manager, completedOn: '2026-09-29' })
    const r = (await all(su(w.member), 'ลูกค้า')).tasks
    expect(r[0]!.id).toBe(exact.id)
    expect(r.at(-1)!.id).toBe(done.id)
    expect(r.at(-1)!.completed).toBe(true)
    for (let i = 0; i < 9; i++) await makeTask({ project: w.P, name: `ลูกค้ารายที่ ${i}`, createdBy: w.manager })
    expect((await all(su(w.member), 'ลูกค้า')).tasks).toHaveLength(8)
  })

  it('deleted task and deleted project excluded; archived A and its task visible to member with flags', async () => {
    const t = await makeTask({ project: w.P, name: 'งานหายไป-ลับ', createdBy: w.manager })
    await db.update(tasks).set({ deletedAt: new Date() }).where(eq(tasks.id, t.id))
    expect((await all(su(w.manager), 'งานหายไป-ลับ')).tasks).toEqual([])
    const r = await all(su(w.member), w.A.name)
    expect(r.projects.map((p) => [p.id, p.archived])).toEqual([[w.A.id, true]])
    const at = await all(su(w.member), w.tasks.aTask.name)
    expect(at.tasks.find((x) => x.id === w.tasks.aTask.id)).toMatchObject({ projectArchived: true })
    await db.update(projects).set({ deletedAt: new Date() }).where(eq(projects.id, w.A.id))
    const gone = await all(su(w.manager), w.A.name)
    expect(gone.projects).toEqual([])
    expect(containsAny(await all(su(w.manager), w.tasks.aTask.name), [w.tasks.aTask.id])).toEqual([])
  })

  it('visibility: outsider never gets P/A projects, P-only people or clients of P (FR-1104)', async () => {
    const r = await all(su(w.outsider), 'World')
    expect(r.projects.map((p) => p.id)).toEqual([w.Q.id])
    const people = await all(su(w.outsider), w.users.pOnly!.name)
    expect(people.people.map((p) => p.id)).not.toContain(w.users.pOnly!.id)
    expect((await all(su(w.outsider), w.C1.name)).clients).toEqual([])
    expect((await all(su(w.outsider), w.C2.name)).clients.map((c) => c.id)).toEqual([w.C2.id])
    expect((await all(su(w.manager), w.C3.name)).clients.map((c) => [c.id, c.archived])).toEqual([[w.C3.id, true]])
  })

  it('people: matched on nickname; deactivated people labelled inactive', async () => {
    const co = w.users.coworker!
    await deactivateUser(co, '2026-09-01')
    const r = await all(su(w.manager), co.name)
    expect(r.people.find((p) => p.id === co.id)).toMatchObject({ active: false })
  })

  it('route: titleOnly → only pages; otherwise all six keys in FR-1102 order (M11 databases last); 401 for nobody', async () => {
    asUser(w.member)
    const t = await searchHttp('P-ลับ', true)
    expect(t.pages.length).toBeGreaterThan(0)
    expect({ ...t, pages: [] }).toEqual({ projects: [], tasks: [], pages: [], people: [], clients: [], databases: [] })
    const full = await searchHttp('P-ลับ')
    expect(Object.keys(full)).toEqual(['projects', 'tasks', 'pages', 'people', 'clients', 'databases'])
    expect(full.tasks.length).toBeGreaterThan(0)
    asNobody()
    expect((await callRoute(searchRoute, '/api/search?q=x')).status).toBe(401)
  })

  // The name predicate alone: on the tiny world table the planner otherwise prefers the partial live-row btree for
  // `deleted_at is null` and filters names afterwards; this checks that the ILIKE itself is served by the trigram index.
  it('uses tasks_name_trgm (seqscan off)', async () => {
    const plan = await db.transaction(async (tx) => {
      await tx.execute(sql`set local enable_seqscan = off`)
      return tx.execute<{ 'QUERY PLAN': string }>(sql`
        explain select t.id from tasks t
        where t.name ilike ${'%ลูกค้า%'} escape '\\'`)
    })
    expect(plan.map((r) => r['QUERY PLAN']).join('\n')).toContain('tasks_name_trgm')
  })
})

describe('searchIndex + GET /api/search/index (M10-D21)', () => {
  let w: World
  beforeEach(async () => {
    w = await createWorld({ with: ['home'] })
  })

  it('outsider: projects [Q] as MEMBER, people exactly {outsider, coworker} (X43), clients [C2]', async () => {
    const r = await searchIndex(db, su(w.outsider))
    expect(r.projects.map((p) => [p.id, p.role, p.archived])).toEqual([[w.Q.id, 'MEMBER', false]])
    expect(new Set(r.people.map((p) => p.id))).toEqual(new Set([w.outsider.id, w.users.coworker!.id]))
    expect(r.clients.map((c) => c.id)).toEqual([w.C2.id])
    expect(containsAny(r, [w.P.name, w.A.name, w.C1.name])).toEqual([])
  })

  it('member: P as MEMBER, archived A with archived true; lead: LEAD role', async () => {
    const r = await searchIndex(db, su(w.member))
    const byId = new Map(r.projects.map((p) => [p.id, p]))
    expect(byId.get(w.P.id)).toMatchObject({ role: 'MEMBER', archived: false })
    expect(byId.get(w.A.id)).toMatchObject({ role: 'MEMBER', archived: true })
    expect(byId.has(w.Q.id)).toBe(false)
    const l = await searchIndex(db, su(w.lead))
    expect(l.projects.find((p) => p.id === w.P.id)!.role).toBe('LEAD')
  })

  it('manager: every live project with role MANAGER, every client', async () => {
    const r = await searchIndex(db, su(w.manager))
    expect(new Set(r.projects.map((p) => p.id))).toEqual(new Set([w.P.id, w.Q.id, w.A.id]))
    expect(r.projects.every((p) => p.role === 'MANAGER')).toBe(true)
    expect(new Set(r.clients.map((c) => c.id))).toEqual(new Set([w.C1.id, w.C2.id, w.C3.id]))
  })

  it('route: 200 private no-store; 401 for nobody', async () => {
    asUser(w.outsider)
    const res = await callRoute(indexRoute, '/api/search/index')
    expect(res.headers.get('Cache-Control')).toBe('private, no-store')
    const body = await okJson<SearchIndexResponse>(res)
    expect(body.projects.map((p) => p.id)).toEqual([w.Q.id])
    asNobody()
    expect((await callRoute(indexRoute, '/api/search/index')).status).toBe(401)
  })
})
