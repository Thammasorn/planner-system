// BA-* — Better Auth HTTP endpoints that would bypass our policy/authz (FR-101, AC-102, M1-D3, R-M1-6) must be
// unreachable for everyone: disabledPaths answers 404. Rows authenticate with real cookies (signInHttp); the matrix
// skips asUser and the nobody/mustChange loops for BA-* ids.
import { randomUUID } from 'node:crypto'
import { authRequest, signInCookie } from '../../helpers/auth-http'
import { TEST_PASSWORD, type TestUser } from '../../helpers/factories'
import type { World } from '../../helpers/world'
import { defineRow, type AuthzRow } from '../types'

const NONE = { M: '404', L: '404', Me: '404', W: '404' } as const

/** A disabled endpoint called with the actor's real session cookie. */
function withCookie(id: string, path: string, body: (w: World) => unknown): AuthzRow {
  return defineRow({
    id,
    spec: `FR-101/M1-D3 POST /api/auth${path} disabled`,
    action: `POST /api/auth${path}`,
    mutates: false,
    expect: NONE,
    run: async (w: World, _ctx: unknown, actor: TestUser) =>
      authRequest(path, { body: body(w), cookie: await signInCookie(actor.email, TEST_PASSWORD) }),
  })
}

export const rows: AuthzRow[] = [
  defineRow({
    id: 'BA-01',
    spec: 'AC-102 POST /api/auth/sign-up/email (no cookie)',
    action: 'POST /api/auth/sign-up/email',
    mutates: false,
    expect: NONE,
    run: () =>
      authRequest('/sign-up/email', {
        body: { email: `x-${randomUUID()}@example.com`, password: 'Abcdef-123', name: 'X' },
      }),
  }),
  withCookie('BA-02', '/update-user', () => ({ name: 'x' })),
  withCookie('BA-03', '/change-password', () => ({
    currentPassword: TEST_PASSWORD,
    newPassword: 'Bypass-pass-123',
  })),
  withCookie('BA-04', '/admin/set-role', (w) => ({ userId: w.outsider.id, role: 'manager' })),
  withCookie('BA-05', '/admin/create-user', () => ({
    email: `admin-made-${randomUUID()}@example.com`,
    password: 'Abcdef-123',
    name: 'Admin Made',
    role: 'worker',
  })),
  withCookie('BA-06', '/admin/ban-user', (w) => ({ userId: w.outsider.id })),
  withCookie('BA-07', '/admin/remove-user', (w) => ({ userId: w.outsider.id })),
  withCookie('BA-08', '/revoke-sessions', () => ({})),
]
