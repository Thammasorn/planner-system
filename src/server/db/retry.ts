// src/server/db/retry.ts — one retry on a Postgres deadlock (40P01) for plan writers (M6-D3, PLAN §1.3 BR-20b, r6b E11).
// Writers lock `task_assignments` rows in id order, so a deadlock should never happen; the retry is a cheap backstop.
// `fn` must open its own transaction (the whole transaction is replayed). No 'server-only' (M1-D4).
import { pgErrorInfo } from '../errors'

export const DEADLOCK_CODE = '40P01'

export async function withDeadlockRetry<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn()
  } catch (e) {
    if (pgErrorInfo(e).code !== DEADLOCK_CODE) throw e
    return fn()
  }
}
