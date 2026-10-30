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
import { test as base, expect, type BrowserContext, type Page } from '@playwright/test'
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
// M1 adds resetDb(fixture?, opts?) and loginAs(page, who) (PLAN.md §4.5, X91).
