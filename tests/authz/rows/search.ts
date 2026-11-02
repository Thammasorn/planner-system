// Search + titles — PERM-06 / PERM-17 (FR-1104 pages part, X63/X68, M4-D19/D20; plan/m04-pages-editor.md §7.2 keys SR-*,
// PG-TITLES*). Every user may search and resolve titles; what comes back is filtered by visibility, which the masking
// suite (tests/authz/masking.int.test.ts › pages (M4), K1–K14) checks in detail. Query-string errors stay 400 (X86).
// M10 (plan/m10 S4.1, §7.2, C2) appends SR-ALL, SR-INDEX and SR-LONG and makes SR-PAGES / SR-TITLE-ONLY assert the five
// category keys of SearchAllResponse (FR-1102); the content per viewer is masking K1–K3.
import { expect } from 'vitest'
import type { PageTitlesResponse } from '@/lib/contracts/pages'
import type { SearchAllResponse, SearchIndexResponse } from '@/lib/contracts/search'
import type { World } from '../../helpers/world'
import type { TestUser } from '../../helpers/factories'
import { defineRow, type AuthzRow } from '../types'
import { ALL, each, PAGES, searchGet, titlesGet } from './_m4'
import {
  check,
  M10_WORLD,
  SEARCH_INDEX_ROUTE,
  SEARCH_KEYS,
  SEARCH_ROUTE,
  searchIndexGet,
  searchQ,
} from './_m10'

/** M10 (X88): every 200 answer of GET /api/search carries all five category arrays. */
function expectFiveKeys(body: SearchAllResponse, titleOnly = false): void {
  for (const k of SEARCH_KEYS) expect(Array.isArray(body[k]), `search key ${k}`).toBe(true)
  if (titleOnly) for (const k of SEARCH_KEYS.filter((x) => x !== 'pages')) expect(body[k], `titleOnly → ${k} empty`).toEqual([])
}

const ids = (xs: readonly { id: string }[]): string[] => xs.map((x) => x.id).sort()

/** K3 sets per role (X43 visibility; PERM-04 clients; M10-D21 index = visible projects incl. archived). */
function expectIndexSets(w: World, actor: TestUser, body: SearchIndexResponse): void {
  const projects = ids(body.projects)
  const people = ids(body.people)
  const clients = ids(body.clients)
  const coworker = w.users.coworker!.id
  const pOnly = w.users.pOnly!.id
  if (actor.id === w.outsider.id) {
    expect(projects, 'W: projects = [Q]').toEqual([w.Q.id])
    expect(people, 'W: people = { outsider, coworker }').toEqual([w.outsider.id, coworker].sort())
    expect(clients, 'W: clients = [C2]').toEqual([w.C2.id])
    return
  }
  if (actor.id === w.manager.id) {
    expect(projects).toEqual(expect.arrayContaining([w.P.id, w.Q.id, w.A.id]))
    expect(people).toEqual(expect.arrayContaining([w.lead.id, w.member.id, w.outsider.id, coworker, pOnly]))
    expect(clients).toEqual(expect.arrayContaining([w.C1.id, w.C2.id]))
    expect(body.projects.find((p) => p.id === w.A.id)?.archived, 'archived A carries the chip').toBe(true)
    return
  }
  // lead / member: P and archived A (P's team), never Q or its client
  expect(projects, 'L/Me: projects = P + A').toEqual([w.P.id, w.A.id].sort())
  expect(clients, 'L/Me: clients = [C1]').toEqual([w.C1.id])
  expect(people).toEqual(expect.arrayContaining([w.lead.id, w.member.id, coworker, pOnly]))
  const role = actor.id === w.lead.id ? 'LEAD' : 'MEMBER'
  expect(body.projects.find((p) => p.id === w.P.id)?.role, 'viewer role in P').toBe(role)
  // §3.3: a LEAD sees everyone; a plain member never the outsider (no shared project)
  if (actor.id === w.member.id) expect(people, 'Me: no outsider').not.toContain(w.outsider.id)
  else expect(people, 'L: LEAD sees the outsider').toContain(w.outsider.id)
}

export const rows: AuthzRow[] = [
  defineRow({
    id: 'SR-PAGES',
    spec: 'PERM-06/17 + FR-1104 — GET /api/search?q=หน้า (results filtered by visibility)',
    action: 'GET /api/search',
    mutates: false,
    with: PAGES,
    expect: ALL,
    run: async () =>
      check<SearchAllResponse>(await searchGet(`q=${encodeURIComponent('หน้า')}`), (b) => expectFiveKeys(b)),
  }),
  defineRow({
    id: 'SR-TITLE-ONLY',
    spec: 'PERM-06/17 + M4-D20 — mention suggestions ?titleOnly=1',
    action: 'GET /api/search',
    mutates: false,
    with: PAGES,
    expect: ALL,
    run: async () =>
      check<SearchAllResponse>(await searchGet(`q=${encodeURIComponent('หน้า')}&titleOnly=1`), (b) =>
        expectFiveKeys(b, true),
      ),
  }),
  defineRow({
    id: 'SR-EMPTY',
    spec: 'X86 — an empty query is a 400 for everyone',
    action: 'GET /api/search',
    mutates: false,
    with: PAGES,
    expect: each('400'),
    run: () => searchGet('q='),
  }),
  defineRow({
    id: 'PG-TITLES',
    spec: 'PERM-06/17 + X63 — GET /api/pages/titles?ids={pPage},{wiki}; invisible ids answer { id, visible:false }',
    action: 'GET /api/pages/titles',
    mutates: false,
    with: PAGES,
    expect: ALL,
    run: async (w, _ctx, actor) => {
      const res = await titlesGet([w.pages.pPage.id, w.pages.wiki.id])
      if (res.status === 200) {
        const { items } = (await res.clone().json()) as PageTitlesResponse
        const p = items.find((i) => i.id === w.pages.pPage.id)
        if (actor.id === w.outsider.id) expect(p).toEqual({ id: w.pages.pPage.id, visible: false })
        else expect(p).toMatchObject({ visible: true, deleted: false, title: w.pages.pPage.title })
        expect(items.find((i) => i.id === w.pages.wiki.id)).toMatchObject({
          visible: true,
          title: w.pages.wiki.title,
        })
      }
      return res
    },
  }),
  defineRow({
    id: 'PG-TITLES-400',
    spec: 'X86 — a malformed id list is a 400 for everyone',
    action: 'GET /api/pages/titles',
    mutates: false,
    with: PAGES,
    expect: each('400'),
    run: () => titlesGet('x'),
  }),
  // ── M10 (plan/m10 §7.2) ──
  defineRow({
    id: 'SR-ALL',
    spec: 'FR-1102/1104 + PERM-04, PERM-06, PERM-16, PERM-17, PERM-22 — GET /api/search?q=ลับ (every role; five categories, visibility in SQL)',
    action: SEARCH_ROUTE,
    mutates: false,
    with: M10_WORLD,
    expect: ALL,
    run: async () => check<SearchAllResponse>(await searchQ('ลับ'), (b) => expectFiveKeys(b)),
  }),
  defineRow({
    id: 'SR-INDEX',
    spec: 'FR-1102/1104, M10-D21 + PERM-04, PERM-06, PERM-22 — GET /api/search/index (every role; visible projects, people, clients only)',
    action: SEARCH_INDEX_ROUTE,
    mutates: false,
    with: M10_WORLD,
    expect: ALL,
    run: async (w, _ctx, actor) =>
      check<SearchIndexResponse>(await searchIndexGet(), (b) => expectIndexSets(w, actor, b)),
  }),
  defineRow({
    id: 'SR-LONG',
    spec: 'X86 — a query of 101 characters is a 400 for everyone (searchQuerySchema max 100)',
    action: SEARCH_ROUTE,
    mutates: false,
    with: M10_WORLD,
    expect: each('400'),
    run: () => searchQ('ก'.repeat(101)),
  }),
]
