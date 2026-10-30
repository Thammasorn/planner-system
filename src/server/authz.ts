// src/server/authz.ts — every permission decision lives here (SPEC §3.4 AZ-1, PLAN.md §3.4.4).
// Each milestone's S0 adds signatures; the backend stream writes the bodies. M1: role helpers only (M2 adds
// projectAccess/requireProject/visibleUserIds…). Not visible → NotFoundError (404); visible but not allowed → ForbiddenError.
import { ForbiddenError, UnauthenticatedError } from './errors'
import type { SessionUser } from './session'

export type SystemRole = 'manager' | 'worker'

/** Better Auth types `user.role` as `string | null`; only exactly 'manager' is a manager. */
export function narrowRole(role: string | null | undefined): SystemRole {
  return role === 'manager' ? 'manager' : 'worker'
}

export function requireUser(user: SessionUser | null | undefined): asserts user is SessionUser {
  if (!user) throw new UnauthenticatedError()
}

export function isManager(user: Pick<SessionUser, 'role'>): boolean {
  return user.role === 'manager'
}

/** Manager-only global actions (§3.2 PERM-01, PERM-02): workers get FORBIDDEN (X41). */
export function requireManager(user: SessionUser): void {
  requireUser(user)
  if (!isManager(user)) throw new ForbiddenError()
}
