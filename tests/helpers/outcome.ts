// tests/helpers/outcome.ts — normalises an action result or a Response to a matrix Outcome (PLAN.md §4.4, X91).
// Codes map through ERROR_STATUS, so codes added later (M4 TOO_LARGE 413, UNSUPPORTED_TYPE 415, M7 NEEDS_CHOICE 409)
// need no change here. 500/INTERNAL and 3xx throw: an INTERNAL result is a test failure, never an expectation.
import { ERROR_STATUS, type ActionResult } from '@/lib/action-result'
import type { Outcome } from '../authz/types'

const BY_STATUS: Record<number, Outcome> = {
  400: '400',
  401: '401',
  403: '403',
  404: '404',
  409: '409',
  413: '413',
  415: '415',
  429: '429',
}

export function outcomeOf(r: ActionResult<object> | Response): Outcome {
  if (r instanceof Response) {
    if (r.status >= 200 && r.status < 300) return 'allow'
    const o = BY_STATUS[r.status]
    if (!o) throw new Error(`unexpected HTTP status ${r.status}`)
    return o
  }
  if (r.ok) return 'allow'
  const status = ERROR_STATUS[r.code] as number | undefined
  const o = status === undefined ? undefined : BY_STATUS[status]
  if (!o) throw new Error(`unexpected action error ${r.code}: ${r.message}`)
  return o
}
