// Search + titles — PERM-06 / PERM-17 (FR-1104 pages part, X63/X68, M4-D19/D20; plan/m04-pages-editor.md §7.2 keys SR-*,
// PG-TITLES*). Every user may search and resolve titles; what comes back is filtered by visibility, which the masking
// suite (tests/authz/masking.int.test.ts › pages (M4), K1–K14) checks in detail. Query-string errors stay 400 (X86).
// M10 extends this file with the other search categories.
import { expect } from 'vitest'
import type { PageTitlesResponse } from '@/lib/contracts/pages'
import { defineRow, type AuthzRow } from '../types'
import { ALL, each, PAGES, searchGet, titlesGet } from './_m4'

export const rows: AuthzRow[] = [
  defineRow({
    id: 'SR-PAGES',
    spec: 'PERM-06/17 + FR-1104 — GET /api/search?q=หน้า (results filtered by visibility)',
    action: 'GET /api/search',
    mutates: false,
    with: PAGES,
    expect: ALL,
    run: () => searchGet(`q=${encodeURIComponent('หน้า')}`),
  }),
  defineRow({
    id: 'SR-TITLE-ONLY',
    spec: 'PERM-06/17 + M4-D20 — mention suggestions ?titleOnly=1',
    action: 'GET /api/search',
    mutates: false,
    with: PAGES,
    expect: ALL,
    run: () => searchGet(`q=${encodeURIComponent('หน้า')}&titleOnly=1`),
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
]
