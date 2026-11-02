// tests/authz/rows/home.ts — M10 home row (plan/m10 §7.2, S4.1): GET /api/home (FR-1101, PERM-22 home part). Every role
// reads its own dashboard (cards filtered, never refused); the manager-only cards (FR-1101f) are `null` for workers.
// The masking suite (tests/authz/masking.int.test.ts › home, search, embeds (M10), K4/K5/K10) checks the content.
// M10's search rows live in search.ts (SR-ALL, SR-INDEX, SR-LONG; C2) and the embed rows in pages.ts (EMB-*; GAPI-08).
import { expect } from 'vitest'
import type { HomeResponse } from '@/lib/contracts/home'
import { defineRow, type AuthzRow } from '../types'
import { ALL, check, HOME_ROUTE, homeGet, M10_WORLD } from './_m10'

export const rows: AuthzRow[] = [
  defineRow({
    id: 'HM-HOME',
    spec: 'FR-1101 + PERM-22 (home part) — GET /api/home (every role; cards filtered, never refused; manager cards M only)',
    action: HOME_ROUTE,
    mutates: false,
    with: M10_WORLD,
    expect: ALL,
    run: async (w, _ctx, actor) =>
      check<HomeResponse>(await homeGet(), (body) => {
        // FR-1101f: the manager cards exist for the manager only
        if (actor.id === w.manager.id) expect(body.manager, 'manager cards for M').not.toBeNull()
        else expect(body.manager, 'manager cards are null for workers').toBeNull()
        expect(body.today).toBe('2026-09-30')
        expect(body.weekStart).toBe('2026-09-28')
        expect(body.myLoad, 'exactly 8 weeks (FR-1101b)').toHaveLength(8)
        expect(body.recentPages.length).toBeLessThanOrEqual(8)
      }),
  }),
]
