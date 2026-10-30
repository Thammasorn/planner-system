// tests/helpers/auth-http.ts — real Better Auth calls for the M1 security suites (plan/m01-auth-employees.md §5.S4).
// `signInHttp` goes through the HTTP router (`auth.handler`, like the browser does) and yields real signed cookies;
// `signInApi` goes through `auth.api.signInEmail` (like the login server action does). Both run the lockout hooks.
import { isAPIError } from 'better-auth/api'
import { auth } from '@/server/auth'

/** Must equal BETTER_AUTH_URL of tests/setup/db-worker.ts (a trusted origin). */
export const AUTH_ORIGIN = 'http://localhost:3100'
export const DEFAULT_TEST_IP = '10.0.0.1'

export interface AuthRequestInit {
  method?: 'GET' | 'POST'
  body?: unknown
  /** Value of the Cookie header (see cookieHeaderFrom). */
  cookie?: string
  ip?: string
}

/** A request to `/api/auth<path>` through Better Auth's HTTP router. */
export function authRequest(path: string, init: AuthRequestInit = {}): Promise<Response> {
  const method = init.method ?? 'POST'
  const headers = new Headers({ origin: AUTH_ORIGIN, 'x-forwarded-for': init.ip ?? DEFAULT_TEST_IP })
  if (method === 'POST') headers.set('content-type', 'application/json')
  if (init.cookie) headers.set('cookie', init.cookie)
  return auth.handler(
    new Request(`${AUTH_ORIGIN}/api/auth${path}`, {
      method,
      headers,
      ...(method === 'POST' ? { body: JSON.stringify(init.body ?? {}) } : {}),
    }),
  )
}

/** POST /api/auth/sign-in/email over HTTP. */
export function signInHttp(email: string, password: string, ip: string = DEFAULT_TEST_IP): Promise<Response> {
  return authRequest('/sign-in/email', { body: { email, password }, ip })
}

/** Set-Cookie headers of a response → the `Cookie` header a browser would send next (cleared cookies dropped). */
export function cookieHeaderFrom(res: Response): string {
  return res.headers
    .getSetCookie()
    .map((c) => c.split(';')[0]!.trim())
    .filter((pair) => !pair.endsWith('='))
    .join('; ')
}

/** Signs in over HTTP and returns the Cookie header; fails loudly when the sign-in is not 200. */
export async function signInCookie(email: string, password: string, ip?: string): Promise<string> {
  const res = await signInHttp(email, password, ip)
  if (res.status !== 200) throw new Error(`sign-in for test setup failed: ${res.status}`)
  const cookie = cookieHeaderFrom(res)
  if (!cookie.includes('session_token=')) throw new Error('sign-in for test setup set no session cookie')
  return cookie
}

/** The raw session token inside a signed session cookie (`<token>.<signature>`, URL-encoded). */
export function sessionTokenFromCookie(cookie: string): string {
  const pair = cookie.split('; ').find((c) => c.includes('session_token='))
  if (!pair) throw new Error('no session_token cookie')
  const value = decodeURIComponent(pair.slice(pair.indexOf('=') + 1))
  return value.split('.')[0]!
}

/** auth.api.getSession with the given Cookie header (null = no valid session). */
export function getSessionByCookie(cookie: string) {
  return auth.api.getSession({ headers: new Headers({ cookie }) })
}

export interface SignInApiOutcome {
  status: number
  code?: string
  message?: string
}

/** auth.api.signInEmail with explicit headers (the server-action path). */
export async function signInApiOutcome(
  email: string,
  password: string,
  ip: string = DEFAULT_TEST_IP,
): Promise<SignInApiOutcome> {
  try {
    await auth.api.signInEmail({ body: { email, password }, headers: new Headers({ 'x-forwarded-for': ip }) })
    return { status: 200 }
  } catch (e) {
    if (!isAPIError(e)) throw e
    const body = e.body as { code?: string; message?: string } | undefined
    return { status: e.statusCode, code: body?.code, message: body?.message }
  }
}

/** '200' on success, otherwise '<status>:<code>' (e.g. '401:INVALID_EMAIL_OR_PASSWORD', '429:LOGIN_LOCKED'). */
export async function signInApi(email: string, password: string, ip: string = DEFAULT_TEST_IP): Promise<string> {
  const o = await signInApiOutcome(email, password, ip)
  return o.status === 200 ? '200' : `${o.status}:${o.code ?? ''}`
}
