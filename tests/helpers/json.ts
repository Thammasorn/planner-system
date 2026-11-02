// tests/helpers/json.ts — JSON-body checks for M9 responses (plan/m09 S0.11): BR-03 integer cd everywhere and
// §3.3 "no hidden name / id ever leaves the server" leak probes.

/** True when every number anywhere in `body` (nested arrays / objects) is an integer (BR-03). */
export function allNumbersInteger(body: unknown): boolean {
  if (typeof body === 'number') return Number.isInteger(body)
  if (Array.isArray(body)) return body.every(allNumbersInteger)
  if (body !== null && typeof body === 'object') return Object.values(body).every(allNumbersInteger)
  return true
}

/** The needles found in `JSON.stringify(body)` (empty = no leak). */
export function containsAny(body: unknown, needles: readonly string[]): string[] {
  const text = JSON.stringify(body) ?? ''
  return needles.filter((n) => n.length > 0 && text.includes(n))
}
