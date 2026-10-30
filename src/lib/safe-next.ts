/** Post-login redirect target (X32): only same-origin relative paths, never back to the auth pages. Isomorphic. */

const CONTROL = /[\u0000-\u001f\u007f]/
const AUTH_PAGES = /^\/(?:login|account\/password)(?:[/?#]|$)/
const BASE = 'http://same-origin.invalid'

/**
 * Returns `next` when it is a `/`-prefixed same-origin path (no `//`, no backslash, no control characters) that is
 * not `/login*` or `/account/password*` after dot-segment normalisation; otherwise `fallback`.
 */
export function safeNext(next: string | null | undefined, fallback = '/home'): string {
  if (!next || !next.startsWith('/') || next.startsWith('//') || next.includes('\\') || CONTROL.test(next)) {
    return fallback
  }
  let url: URL
  try {
    url = new URL(next, BASE)
  } catch {
    return fallback
  }
  if (url.origin !== BASE || AUTH_PAGES.test(url.pathname)) return fallback
  return next
}

/** A Next.js `searchParams` value → its first string. */
export function firstParam(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v
}
