// tests/helpers/as-user.ts — who the mocked getSessionUser() returns (tests/setup/db-worker.ts).
// Stored on globalThis so every module instance in the worker sees the same value.
import type { SessionUser } from '@/server/session'
import type { TestUser } from './factories'

type G = typeof globalThis & { __testSessionUser?: SessionUser | null }
const g = globalThis as G

export function toSessionUser(u: TestUser, o?: { mustChangePassword?: boolean }): SessionUser {
  return {
    id: u.id,
    email: u.email,
    name: u.name,
    nickname: u.nickname,
    role: u.role,
    positionId: u.positionId,
    color: u.color,
    mustChangePassword: o?.mustChangePassword ?? u.mustChangePassword,
    sessionId: u.sessionId,
    sessionToken: u.sessionToken,
  }
}

/** Following actions/routes run as `u` (optionally forcing the must-change-password gate). */
export function asUser(u: TestUser, o?: { mustChangePassword?: boolean }): SessionUser {
  const s = toSessionUser(u, o)
  g.__testSessionUser = s
  return s
}

/** Following actions/routes run without a session. */
export function asNobody(): void {
  g.__testSessionUser = null
}

export function currentTestUser(): SessionUser | null {
  return g.__testSessionUser ?? null
}

/** The user set by asUser() — lets matrix rows call page loaders (`getProjectOverview(db, await currentUser(), …)`). */
export async function currentUser(): Promise<SessionUser> {
  const u = currentTestUser()
  if (!u) throw new Error('currentUser(): no user set — call asUser() first')
  return u
}
