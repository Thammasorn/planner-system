// tests/authz/rows/_m10.ts — shared helpers for the M10 rows (home.ts HM-*, search.ts SR-ALL/SR-INDEX/SR-LONG, pages.ts
// EMB-T-* / EMB-W-*) and the masking block `home, search, embeds (M10)` (plan/m10 S4.1–S4.2, §7.2). No rows here.
// Outcomes follow X41: every M10 route is a read; invisible or deleted page → 404, malformed id → 404 (X86, M10-D1),
// bad query → 400; no M10 route answers 403. World createWorld({ with: ['home'] }) (S0.12) — 'home' implies tasks, pages,
// timeOff, allocations and milestones.
import { GET as GET_HOME } from '@/app/api/home/route'
import { GET as GET_EMBED_TASKS } from '@/app/api/pages/[id]/embed/tasks/route'
import { GET as GET_EMBED_WORKLOAD } from '@/app/api/pages/[id]/embed/workload/route'
import { GET as GET_SEARCH } from '@/app/api/search/route'
import { GET as GET_SEARCH_INDEX } from '@/app/api/search/index/route'
import type { SearchCategory } from '@/lib/contracts/search'
import type { WorldPart } from '../../helpers/world'
import { callRoute } from '../_support/http'
import type { Outcome, Role } from '../types'
import { pinToday } from './_m5'

export const HOME_ROUTE = 'GET /api/home'
export const SEARCH_ROUTE = 'GET /api/search'
export const SEARCH_INDEX_ROUTE = 'GET /api/search/index'
export const EMBED_TASKS_ROUTE = 'GET /api/pages/[id]/embed/tasks'
export const EMBED_WORKLOAD_ROUTE = 'GET /api/pages/[id]/embed/workload'

/** The four routes M10 adds (X81; AZ-2 must find a row for each). `GET /api/search` is M4's route, extended. */
export const M10_ROUTES = [HOME_ROUTE, SEARCH_INDEX_ROUTE, EMBED_TASKS_ROUTE, EMBED_WORKLOAD_ROUTE] as const

/** The M10 home world (plan/m10 S0.12). */
export const M10_WORLD = ['home'] as const satisfies readonly WorldPart[]

/** Every logged-in user (cards / results filtered, never refused). */
export const ALL = { M: 'allow', L: 'allow', Me: 'allow', W: 'allow' } as const satisfies Record<
  Role,
  Outcome
>
/** A page of P or archived A: P's team and the manager; the outsider never sees the project (404). */
export const NOT_W = { M: 'allow', L: 'allow', Me: 'allow', W: '404' } as const satisfies Record<
  Role,
  Outcome
>
/** A page of Q: the manager and Q's member (the outsider); lead and member are not in Q. */
export const Q_ONLY = { M: 'allow', L: '404', Me: '404', W: 'allow' } as const satisfies Record<Role, Outcome>
/** The same outcome for every role. */
export const each = (o: Outcome): Record<Role, Outcome> => ({ M: o, L: o, Me: o, W: o })

/** FR-1102 order; every `GET /api/search` answer carries all five keys from M10 (X88). */
export const SEARCH_KEYS: readonly SearchCategory[] = ['projects', 'tasks', 'pages', 'people', 'clients']

/** `GET /api/home` as the current asUser() session, "today" pinned to 2026-09-30 10:00 +07 (X45). */
export function homeGet(): Promise<Response> {
  pinToday()
  return callRoute(GET_HOME, '/api/home')
}

/** `GET /api/search?{query}` (the caller encodes `q`). */
export function searchAllGet(query: string): Promise<Response> {
  pinToday()
  return callRoute(GET_SEARCH, `/api/search?${query}`)
}

/** `GET /api/search?q=<q>` with `q` URL-encoded. */
export function searchQ(q: string): Promise<Response> {
  return searchAllGet(`q=${encodeURIComponent(q)}`)
}

/** `GET /api/search/index` (M10-D21). */
export function searchIndexGet(): Promise<Response> {
  pinToday()
  return callRoute(GET_SEARCH_INDEX, '/api/search/index')
}

/** `GET /api/pages/{id}/embed/tasks` (M10-D1: the param keeps its sibling's name `[id]`). */
export function embedTasksGet(id: string): Promise<Response> {
  pinToday()
  return callRoute(GET_EMBED_TASKS, `/api/pages/${encodeURIComponent(id)}/embed/tasks`, { id })
}

/** `GET /api/pages/{id}/embed/workload`. */
export function embedWorkloadGet(id: string): Promise<Response> {
  pinToday()
  return callRoute(GET_EMBED_WORKLOAD, `/api/pages/${encodeURIComponent(id)}/embed/workload`, { id })
}

/** 200 → body checks; other statuses pass through (the matrix compares the outcome). */
export async function check<T>(res: Response, fn: (body: T) => void): Promise<Response> {
  if (res.status === 200) fn((await res.clone().json()) as T)
  return res
}

/** The 8 Mondays of the embed workload window from "today" 2026-09-30 (M10-D11). */
export const EMBED_WEEKS = [
  '2026-09-28',
  '2026-10-05',
  '2026-10-12',
  '2026-10-19',
  '2026-10-26',
  '2026-11-02',
  '2026-11-09',
  '2026-11-16',
] as const
