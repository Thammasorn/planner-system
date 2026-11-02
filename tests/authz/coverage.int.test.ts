// tests/authz/coverage.int.test.ts — AZ-2 (SPEC §3.4 "ทุก server action และ route handler ต้องเรียก authz", §11.2):
// every exported HTTP method of every src/app/api/**/route.ts has an authz row whose `action` is '<METHOD> /api/<path>'
// (dynamic segments as written, e.g. 'GET /api/projects/[id]/tasks'). Better Auth's catch-all and the public health
// check are exempt. M1's T-META-01 (matrix.int.test.ts) covers server actions. plan/m02-clients-projects-authz.md S3.1.
import { readdirSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import * as services from '@/server/services'
import { rows } from './rows'

const API_DIR = path.resolve(process.cwd(), 'src/app/api')
const HTTP_METHODS = ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'] as const
/** Route paths without authz rows by design: Better Auth's handler (its endpoints are BA-* rows) and the public health check. */
const EXEMPT_ROUTES = ['/api/auth/[...all]', '/api/health'] as const
const ROUTE_ROW = /^(GET|HEAD|POST|PUT|PATCH|DELETE|OPTIONS) (\/api\/\S*)$/
const LOADER_ROW = /^services\.([A-Za-z0-9]+)\.([A-Za-z0-9]+)$/

/** Every route.ts below src/app/api as its URL path ('/api/clients/options'); route groups `(x)` are dropped. */
function routeFiles(dir = API_DIR): Array<{ file: string; urlPath: string }> {
  const out: Array<{ file: string; urlPath: string }> = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) out.push(...routeFiles(full))
    else if (/^route\.(ts|tsx)$/.test(entry.name)) {
      const segments = path
        .relative(API_DIR, dir)
        .split(path.sep)
        .filter((s) => s !== '' && !/^\(.*\)$/.test(s))
      out.push({ file: full, urlPath: ['/api', ...segments].join('/') })
    }
  }
  return out
}

async function exportedRoutes(): Promise<string[]> {
  const out: string[] = []
  for (const { file, urlPath } of routeFiles()) {
    if ((EXEMPT_ROUTES as readonly string[]).includes(urlPath)) continue
    const mod = (await import(file)) as Record<string, unknown>
    for (const m of HTTP_METHODS) if (typeof mod[m] === 'function') out.push(`${m} ${urlPath}`)
  }
  return out.sort()
}

describe('AZ-2 route coverage', () => {
  it('finds the M2 routes (sanity: the walker sees src/app/api)', async () => {
    const routes = await exportedRoutes()
    expect(routes).toEqual(
      expect.arrayContaining(['GET /api/sidebar', 'GET /api/people/options', 'GET /api/clients/options']),
    )
  })

  it('M6.1 (plan/m06.1 S6.5): GET /api/tasks/[id]/body is exported and has rows; ensureTaskBody / setPageFullWidth have rows', async () => {
    const routes = await exportedRoutes()
    expect(routes).toContain('GET /api/tasks/[id]/body')
    const covered = new Set(rows.map((r) => r.action))
    for (const name of ['GET /api/tasks/[id]/body', 'ensureTaskBody', 'setPageFullWidth', 'services.taskPages.getTaskPageView'])
      expect(covered.has(name), `${name} has no authz row`).toBe(true)
    // SPEC §7.7: the M4 routes that now receive TASK page ids (save, lease, files) carry TASK-page rows too
    const taskRows = rows.filter((r) => /^TB-/.test(r.id)).map((r) => r.action)
    for (const name of [
      'GET /api/pages/[id]',
      'PUT /api/pages/[id]/content',
      'GET /api/pages/[id]/lock',
      'POST /api/pages/[id]/lock',
      'DELETE /api/pages/[id]/lock',
      'POST /api/files',
      'GET /api/files/[id]',
      'GET /api/pages/tree',
      'savePageContent',
    ])
      expect(taskRows, `no TASK-page row for ${name}`).toContain(name)
  })

  it('M7.1 (plan/m07.1 S5.1): GET /api/projects/[id]/plan-markers is exported and has rows; the four marker actions have rows', async () => {
    const routes = await exportedRoutes()
    expect(routes).toContain('GET /api/projects/[id]/plan-markers')
    const covered = new Set(rows.map((r) => r.action))
    for (const name of [
      'GET /api/projects/[id]/plan-markers',
      'createPlanMarker',
      'updatePlanMarker',
      'deletePlanMarker',
      'restorePlanMarkerBatch',
    ])
      expect(covered.has(name), `${name} has no authz row`).toBe(true)
    // §7.10: no new route for the chart or the calendar (they read the grid chunk / project tasks / calendar)
    const m71 = routes.filter((r) => /plan-markers|chart|plan-calendar/.test(r))
    expect(m71).toEqual(['GET /api/projects/[id]/plan-markers'])
  })

  it('every exported route handler method has an authz row', async () => {
    const covered = new Set(rows.map((r) => r.action))
    const missing = (await exportedRoutes()).filter((r) => !covered.has(r))
    expect(missing, 'route handlers without an authz row').toEqual([])
  })

  it('every route row names an exported handler (Better Auth paths excepted)', async () => {
    const routes = new Set(await exportedRoutes())
    const unknown = rows
      .filter((r) => {
        const m = ROUTE_ROW.exec(r.action)
        return m !== null && !m[2]!.startsWith('/api/auth/') && !routes.has(r.action)
      })
      .map((r) => `${r.id} ${r.action}`)
    expect(unknown, 'rows naming a route that is not exported').toEqual([])
  })

  it('every loader row names an exported service function', () => {
    const registry = services as unknown as Record<string, Record<string, unknown> | undefined>
    const unknown = rows
      .filter((r) => {
        const m = LOADER_ROW.exec(r.action)
        return m !== null && typeof registry[m[1]!]?.[m[2]!] !== 'function'
      })
      .map((r) => `${r.id} ${r.action}`)
    expect(unknown, 'rows naming a service function that is not exported').toEqual([])
    // and nothing that looks like a loader row slipped past the pattern
    const malformed = rows.filter((r) => r.action.startsWith('services.') && !LOADER_ROW.test(r.action))
    expect(malformed.map((r) => r.id)).toEqual([])
  })
})
