// tests/helpers/request.ts — the fake Next request scope for integration tests (mocked next/headers + next/cache in
// tests/setup/db-worker.ts). Server actions read headers()/cookies() from here; Better Auth's nextCookies() plugin
// writes Set-Cookie into the jar.
import { vi } from 'vitest'

const DEFAULT_HEADERS: Record<string, string> = { 'x-forwarded-for': '127.0.0.1', 'user-agent': 'vitest' }

type CookieOptions = Record<string, unknown>
interface Cookie {
  name: string
  value: string
}

let currentHeaders = new Headers(DEFAULT_HEADERS)
const jar = new Map<string, string>()
const setCookies = new Map<string, string>()

/** Value returned by the mocked `headers()` (a fresh copy per call; includes the jar as a Cookie header). */
export function currentTestHeaders(): Headers {
  const h = new Headers(currentHeaders)
  if (jar.size > 0 && !h.has('cookie')) {
    h.set('cookie', [...jar].map(([n, v]) => `${n}=${v}`).join('; '))
  }
  return h
}

/** Replaces the request headers (defaults are merged under the given ones). */
export function setTestHeaders(init: HeadersInit): void {
  currentHeaders = new Headers(DEFAULT_HEADERS)
  for (const [k, v] of new Headers(init)) currentHeaders.set(k, v)
}

/** Map-backed stand-in for Next's `cookies()` store (get/getAll/has/set/delete). */
export function testCookieJar() {
  return {
    get(name: string): Cookie | undefined {
      const value = jar.get(name)
      return value === undefined ? undefined : { name, value }
    },
    getAll(name?: string): Cookie[] {
      return [...jar]
        .filter(([n]) => name === undefined || n === name)
        .map(([n, value]) => ({ name: n, value }))
    },
    has(name: string): boolean {
      return jar.has(name)
    },
    set(nameOrCookie: string | (Cookie & CookieOptions), value?: string, options?: CookieOptions) {
      const name = typeof nameOrCookie === 'string' ? nameOrCookie : nameOrCookie.name
      const v = typeof nameOrCookie === 'string' ? (value ?? '') : nameOrCookie.value
      const opts = typeof nameOrCookie === 'string' ? options : nameOrCookie
      const maxAge = opts?.maxAge
      if (maxAge === 0 || v === '') jar.delete(name)
      else jar.set(name, v)
      setCookies.set(name, v)
      return this
    },
    delete(name: string) {
      jar.delete(name)
      setCookies.set(name, '')
      return this
    },
  }
}

/** Every cookie written through `cookies().set/delete` since the last reset (name → value; '' = cleared). */
export function getSetCookies(): Map<string, string> {
  return new Map(setCookies)
}

export function resetTestRequest(): void {
  currentHeaders = new Headers(DEFAULT_HEADERS)
  jar.clear()
  setCookies.clear()
}

/** The mocked `next/cache` module. Assert e.g. `expect(testCache.refresh).toHaveBeenCalledTimes(1)`. */
export const testCache = {
  refresh: vi.fn(),
  updateTag: vi.fn(),
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
}
