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
import { createScriptDb, truncateAll } from '../scripts/lib/db'
import { seedGolden, type FixtureId } from '../scripts/lib/fixtures'
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
export type ResetDbOptions = { extras?: (tx: Tx) => Promise<unknown> }

/**
 * Truncate every table + `seedGolden` (+ fixture from M5) + extras in ONE transaction against `planner_e2e`, then empty
 * UPLOAD_DIR. Call as `test.beforeAll(async () => { await resetDb() })` — never `beforeAll(resetDb)` (Playwright
 * would pass its fixtures object as `fixture`).
 */
export async function resetDb(fixture?: FixtureId, opts: ResetDbOptions = {}): Promise<void> {
  const { db, close } = createScriptDb(E2E.databaseUrl)
  try {
    await db.transaction(async (tx) => {
      await truncateAll(tx)
      await seedGolden(tx)
      if (fixture !== undefined) throw new Error('fixtures arrive in M5 (applyFixture)')
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
export async function openGuardedPage(browser: Browser, allowedConsoleErrors: readonly RegExp[] = []): Promise<GuardedPage> {
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
  return page.waitForResponse((r) => r.request().method() === 'POST' && !!r.request().headers()['next-action'])
}
