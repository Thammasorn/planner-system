// tests/authz/_support/leak.ts — the masking assertion of SPEC §11.2 / PLAN §4.4 (MASK-7).
import { expect } from 'vitest'

/** `JSON.stringify(body).includes(s) === false` for every forbidden name / id. */
export function assertNoLeak(body: unknown, forbidden: readonly string[]): void {
  const json = JSON.stringify(body)
  for (const s of forbidden) {
    expect(s.length, 'forbidden strings must be non-empty').toBeGreaterThan(0)
    expect(json.includes(s), `payload leaks ${JSON.stringify(s)}`).toBe(false)
  }
}

/** The opposite check, so a leak test cannot pass on an empty payload. */
export function assertContains(body: unknown, required: readonly string[]): void {
  const json = JSON.stringify(body)
  for (const s of required) expect(json.includes(s), `payload lacks ${JSON.stringify(s)}`).toBe(true)
}
