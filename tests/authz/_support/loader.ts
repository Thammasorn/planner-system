// tests/authz/_support/loader.ts — M2-only helpers for authz rows and visibility tests (plan/m02 §4: S3 puts its
// helpers here, tests/helpers/** belongs to S0).
import { requirePageUser, type SessionUser } from '@/server/session'
import { outcomeOfCall } from '../../helpers/outcome'
import type { Outcome } from '../types'

/** Redirects thrown by the mocked page gate (tests/setup/db-worker.ts) and the outcome a page answers with. */
const PAGE_REDIRECT_OUTCOME: Record<string, Outcome> = {
  'TEST_REDIRECT:/login': '401',
  'TEST_REDIRECT:/account/password': '403',
}

/**
 * Outcome of a page loader (`services.projects.getProjectOverview`, …) the way an RSC page calls it: the page gate
 * `requirePageUser()` first (no session → /login = '401'; must change password → '403'), then the loader through
 * `outcomeOfCall` (NotFoundError → '404', ForbiddenError → '403', a resolved value → 'allow'). NOT_IMPLEMENTED stubs
 * and other errors are rethrown, so a missing implementation fails the row instead of matching an expectation.
 */
export async function loaderOutcome(fn: (user: SessionUser) => Promise<unknown>): Promise<Outcome> {
  let user: SessionUser
  try {
    user = await requirePageUser()
  } catch (e) {
    const o = e instanceof Error ? PAGE_REDIRECT_OUTCOME[e.message] : undefined
    if (!o) throw e
    return o
  }
  return outcomeOfCall(() => fn(user))
}
