/**
 * Shared Playwright fixtures (PLAN.md §4.5, plan/m00-scaffold.md S3.4, X91).
 * Every test gets, automatically: the browser clock pinned to `E2E.appNow`, a CSP-violation guard, an
 * external-request guard (NFR-09) and a page-error guard. The guards are named exports so M11's
 * `e2e/perf/fixtures.ts` imports them instead of copying them.
 *
 * Rules every spec inherits (C7): never override `guards` or remove the external-request route; set
 * `allowedConsoleErrors` per `describe` only, as narrowly as the deliberate failure needs
 * (e.g. `test.use({ allowedConsoleErrors: [/status of 404/] })`) — never a catch-all pattern.
 */
import { rmSync } from 'node:fs'
import path from 'node:path'
import { test as base, expect, type Browser, type BrowserContext, type Page } from '@playwright/test'
import { and, desc, eq, isNull } from 'drizzle-orm'
import { createScriptDb, truncateAll } from '../scripts/lib/db'
import {
  addDayExample,
  addMilestones,
  addSyntheticGridProject,
  addSyntheticWorkload,
  applyFixture,
  seedGolden,
  type FixtureId,
} from '../scripts/lib/fixtures'
import { clients, milestones, pages, projects, user } from '../src/server/db/schema'
import type { Tx } from '../src/server/db/types'
import { E2E } from './env'

export type GuardLog = { csp: string[]; external: string[]; errors: string[] }
export const newGuardLog = (): GuardLog => ({ csp: [], external: [], errors: [] })
export const isLocalUrl = (url: URL): boolean => url.hostname === 'localhost' || url.hostname === '127.0.0.1'

/** CSP guard: every `securitypolicyviolation` in any frame of the page is recorded. */
export async function installCspGuard(page: Page, log: GuardLog): Promise<void> {
  await page.exposeFunction('__e2eCspViolation', (v: string) => {
    log.csp.push(v)
  })
  await page.addInitScript(() => {
    document.addEventListener('securitypolicyviolation', (e) => {
      const w = window as unknown as { __e2eCspViolation: (v: string) => Promise<void> }
      void w.__e2eCspViolation(
        `${e.violatedDirective} blocked=${e.blockedURI} at ${e.sourceFile}:${e.lineNumber}`,
      )
    })
  })
}

/** External-request guard (NFR-09): nothing may leave the machine; such requests are aborted and recorded. */
export async function installExternalRequestGuard(
  context: BrowserContext,
  log: GuardLog,
  isAllowed: (url: URL) => boolean = isLocalUrl,
): Promise<void> {
  await context.route(
    (url) => (url.protocol === 'http:' || url.protocol === 'https:') && !isAllowed(url),
    async (route) => {
      log.external.push(route.request().url())
      await route.abort()
    },
  )
}

/** Page-error guard: uncaught errors and console errors not matched by `allowed`. */
export function installPageErrorGuard(page: Page, log: GuardLog, allowed: readonly RegExp[] = []): void {
  page.on('pageerror', (e) => {
    log.errors.push(`pageerror: ${e.message}`)
  })
  page.on('console', (m) => {
    if (m.type() === 'error' && !allowed.some((re) => re.test(m.text())))
      log.errors.push(`console: ${m.text()}`)
  })
}

export function expectGuardsClean(log: GuardLog): void {
  expect(log.csp, 'CSP violations').toEqual([])
  expect(log.external, 'external requests').toEqual([])
  expect(log.errors, 'page errors').toEqual([])
}

type Options = { allowedConsoleErrors: RegExp[] }
type Guards = { guards: GuardLog }

export const test = base.extend<Options & Guards>({
  allowedConsoleErrors: [[], { option: true }],
  guards: [
    async ({ page, context, allowedConsoleErrors }, use) => {
      const log = newGuardLog()
      await installCspGuard(page, log)
      await installExternalRequestGuard(context, log)
      installPageErrorGuard(page, log, allowedConsoleErrors)
      await page.clock.setFixedTime(new Date(E2E.appNow)) // before the first goto (PLAN.md §4.5)
      await use(log)
      expectGuardsClean(log)
    },
    { auto: true },
  ],
})
export { expect }

// ---------------------------------------------------------------------------------------------------------------
// M1: database reset + API login (PLAN.md §4.5, X46, X91; plan/m01-auth-employees.md S4.11)
// ---------------------------------------------------------------------------------------------------------------

/** Later milestones add option fields only (M6 syntheticGrid, M7 dayExample, M8 milestones, M9 alsoFixtures). */
export type ResetDbOptions = {
  extras?: (tx: Tx) => Promise<unknown>
  /** M6-D22 / G15: adds the "Perf grid" project (200 leaf tasks × 16 WEEK rows from 2026-09-28) after the seed. */
  syntheticGrid?: boolean
  /** M7 (M7-D16): SPEC A.2 "Kickoff workshop" — Jack + Mint 0.5 DAY on 2026-09-07 in Mobile App Revamp. */
  dayExample?: boolean
  /** M8 (M8-D20): the 7 SPEC A.2 milestones (UAT sign-off bound to "ทำ UAT + คู่มือหน้าร้าน"), after dayExample. */
  milestones?: boolean
  /** M9 (M9-D26, X91): further fixtures applied after `fixture`, each with only its own setup (X11), e.g.
   *  `resetDb('F2', { alsoFixtures: ['F3'] })` = the §8.5 mock state. */
  alsoFixtures?: FixtureId[]
  /** M9 (M9-D23): addSyntheticWorkload 95 people × 20 projects × 12 weeks from 2026-09-28 (100 workers on /workload). */
  syntheticWorkload?: boolean
}

/**
 * Truncate every table + `seedGolden` (+ `applyFixture` for F2/F3/F4, M5) + extras in ONE transaction against `planner_e2e`, then empty
 * UPLOAD_DIR. Call as `test.beforeAll(async () => { await resetDb() })` — never `beforeAll(resetDb)` (Playwright
 * would pass its fixtures object as `fixture`).
 */
export async function resetDb(fixture?: FixtureId, opts: ResetDbOptions = {}): Promise<void> {
  const { db, close } = createScriptDb(E2E.databaseUrl)
  try {
    await db.transaction(async (tx) => {
      await truncateAll(tx)
      await seedGolden(tx)
      if (fixture !== undefined) await applyFixture(tx, fixture) // M5 (X11): F1 + that fixture's own setup only
      for (const also of opts.alsoFixtures ?? []) await applyFixture(tx, also) // M9 (M9-D26)
      if (opts.syntheticGrid) await addSyntheticGridProject(tx, { tasks: 200, weeks: 16, from: '2026-09-28' }) // M6
      if (opts.dayExample) await addDayExample(tx) // M7
      if (opts.milestones) await addMilestones(tx) // M8
      if (opts.syntheticWorkload)
        await addSyntheticWorkload(tx, { people: 95, projects: 20, weeks: 12, from: '2026-09-28' }) // M9
      await opts.extras?.(tx)
    })
  } finally {
    await close()
  }
  rmSync(path.resolve(E2E.uploadDir), { recursive: true, force: true })
}

/** Golden users (docs/reference/golden-fixtures.json); all share the dev password. */
export type GoldenLogin = 'manager' | 'cindy' | 'ivy' | 'peter' | 'jack' | 'mint'
export const GOLDEN_PASSWORD = 'demo1234'
export const goldenEmail = (who: GoldenLogin): string => `${who}@example.com`

/** Signs in through Better Auth's HTTP endpoint with `page.request`, so the session cookie lands in the context. */
export async function loginAs(page: Page, who: GoldenLogin): Promise<void> {
  const res = await page.request.post('/api/auth/sign-in/email', {
    data: { email: goldenEmail(who), password: GOLDEN_PASSWORD },
    headers: { origin: E2E.baseUrl },
  })
  expect(res.ok(), `loginAs(${who}) → HTTP ${res.status()}`).toBe(true)
}

export interface GuardedPage {
  page: Page
  context: BrowserContext
  /** Closes the context, then asserts its guards stayed clean. */
  close: () => Promise<void>
}

/**
 * A second browser context ("another device") with the same guards and pinned clock as the auto fixture.
 * Options are passed explicitly so they never depend on config inheritance.
 */
export async function openGuardedPage(
  browser: Browser,
  allowedConsoleErrors: readonly RegExp[] = [],
): Promise<GuardedPage> {
  const context = await browser.newContext({
    baseURL: E2E.baseUrl,
    locale: 'th-TH',
    timezoneId: 'Asia/Bangkok',
    permissions: ['clipboard-read', 'clipboard-write'],
    viewport: { width: 1440, height: 900 },
  })
  const log = newGuardLog()
  const page = await context.newPage()
  await installCspGuard(page, log)
  await installExternalRequestGuard(context, log)
  installPageErrorGuard(page, log, allowedConsoleErrors)
  await page.clock.setFixedTime(new Date(E2E.appNow))
  return {
    page,
    context,
    close: async () => {
      await context.close()
      expectGuardsClean(log)
    },
  }
}

/** Resolves when the next server-action POST (header `next-action`) has answered. Start it before the click. */
export function waitForServerAction(page: Page) {
  return page.waitForResponse(
    (r) => r.request().method() === 'POST' && !!r.request().headers()['next-action'],
  )
}

/**
 * The server action whose request body contains `needle` (e.g. the final ISO date). A date typed section by section
 * emits valid intermediate dates (day "2" → 02, then "23"), each saved — wait for the save of the final value.
 */
export function waitForServerActionWith(page: Page, needle: string) {
  return page.waitForResponse(
    (r) =>
      r.request().method() === 'POST' &&
      !!r.request().headers()['next-action'] &&
      (r.request().postData() ?? '').includes(needle),
  )
}

// ---------------------------------------------------------------------------------------------------------------
// M2: id lookups in planner_e2e (plan/m02-clients-projects-authz.md S3.5)
// ---------------------------------------------------------------------------------------------------------------

/** M4 adds 'page' (newest live page with that title — titles are not unique, e.g. "Project Charter"). */
export type IdKind = 'project' | 'client' | 'user' | 'page'

/** Id of a seeded row in `planner_e2e`: projects/clients by `name`, users by `nickname`, pages by `title`. Throws when absent. */
export async function idOf(kind: IdKind, name: string): Promise<string> {
  const { db, close } = createScriptDb(E2E.databaseUrl)
  try {
    if (kind === 'page') {
      const [row] = await db
        .select({ id: pages.id })
        .from(pages)
        .where(and(eq(pages.title, name), isNull(pages.deletedAt)))
        .orderBy(desc(pages.createdAt), desc(pages.id))
        .limit(1)
      if (!row) throw new Error(`idOf(page, ${name}): no live page in ${E2E.dbName}`)
      return row.id
    }
    const rows =
      kind === 'project'
        ? await db.select({ id: projects.id }).from(projects).where(eq(projects.name, name))
        : kind === 'client'
          ? await db.select({ id: clients.id }).from(clients).where(eq(clients.name, name))
          : await db.select({ id: user.id }).from(user).where(eq(user.nickname, name))
    if (rows.length !== 1) throw new Error(`idOf(${kind}, ${name}): ${rows.length} rows in ${E2E.dbName}`)
    return rows[0]!.id
  } finally {
    await close()
  }
}

/** M6 (plan/m06 S0.13): id of the project with that name in `planner_e2e` (golden names are unique). */
export function projectIdByName(name: string): Promise<string> {
  return idOf('project', name)
}

/** M9 (plan/m09 S0.12): id of a golden user by nickname in `planner_e2e` (from the Playwright process). */
export function userIdByNickname(
  nick: 'Manager' | 'Cindy' | 'Ivy' | 'Peter' | 'Jack' | 'Mint',
): Promise<string> {
  return idOf('user', nick)
}

/** M8 (plan/m08 S0.11): id of the single live milestone with that name in `planner_e2e` (A.2 names are unique). */
export async function milestoneIdByName(name: string): Promise<string> {
  const { db, close } = createScriptDb(E2E.databaseUrl)
  try {
    const rows = await db
      .select({ id: milestones.id })
      .from(milestones)
      .where(and(eq(milestones.name, name), isNull(milestones.deletedAt)))
    if (rows.length !== 1) throw new Error(`milestoneIdByName(${name}): ${rows.length} rows in ${E2E.dbName}`)
    return rows[0]!.id
  } finally {
    await close()
  }
}

// ---------------------------------------------------------------------------------------------------------------
// M4: page URLs (plan/m04-pages-editor.md S4.7)
// ---------------------------------------------------------------------------------------------------------------

const PAGE_URL_RE = /\/p\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})(?:[/?#]|$)/

/** The uuid of the current `/p/<uuid>` URL (throws on any other URL). */
export function pageIdFromUrl(page: Page): string {
  const m = PAGE_URL_RE.exec(new URL(page.url()).pathname)
  if (!m) throw new Error(`pageIdFromUrl: ${page.url()} is not a /p/<uuid> URL`)
  return m[1]!
}

/** Waits until the browser is on some `/p/<uuid>` (other than `notId`) and returns that id. */
export async function waitForPageUrl(page: Page, notId?: string): Promise<string> {
  await page.waitForURL((u) => {
    const m = PAGE_URL_RE.exec(u.pathname)
    return m !== null && m[1] !== notId
  })
  return pageIdFromUrl(page)
}
