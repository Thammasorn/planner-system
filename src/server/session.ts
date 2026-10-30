// src/server/session.ts — the request's signed-in user (PLAN.md §3.4, M1 S0.8). Server-only: reads request headers.
// Integration tests replace getSessionUser/requirePageUser through tests/setup/db-worker.ts (asUser/asNobody).
import 'server-only'
import { headers } from 'next/headers'
import { notFound, redirect } from 'next/navigation'
import { cache } from 'react'
import type { CurrentUserDTO } from '@/lib/contracts/users'
import { displayName } from '@/lib/display-name'
import { auth } from './auth'
import { isManager, narrowRole, type SystemRole } from './authz'

export interface SessionUser {
  id: string
  email: string
  name: string
  nickname: string | null
  role: SystemRole
  positionId: string | null
  color: string | null
  mustChangePassword: boolean
  /** Never sent to the client. */
  sessionId: string
  /** Never sent to the client (used to keep the current session on password change). */
  sessionToken: string
}

/** Once per request (React cache). Null when there is no valid session or the user is deactivated (banned). */
export const getSessionUser: () => Promise<SessionUser | null> = cache(async () => {
  const res = await auth.api.getSession({ headers: await headers() })
  if (!res) return null
  const u = res.user as typeof res.user & { banned?: boolean | null }
  if (u.banned === true) return null
  return {
    id: u.id,
    email: u.email,
    name: u.name,
    nickname: u.nickname ?? null,
    role: narrowRole(u.role),
    positionId: u.positionId ?? null,
    color: u.color ?? null,
    mustChangePassword: u.mustChangePassword === true,
    sessionId: res.session.id,
    sessionToken: res.session.token,
  }
})

/** Pages/layouts: redirect to /login without a session; to /account/password while a password change is due. */
export async function requirePageUser(opts?: { allowMustChange?: boolean }): Promise<SessionUser> {
  const user = await getSessionUser()
  if (!user) redirect('/login')
  if (user.mustChangePassword && !opts?.allowMustChange) redirect('/account/password')
  return user
}

/** Manager-only pages (/settings/*): workers get notFound() (X41) — decided before any Suspense boundary. */
export async function requireManagerPage(): Promise<SessionUser> {
  const user = await requirePageUser()
  if (!isManager(user)) notFound()
  return user
}

/** Drops the session fields (never sent to the client). */
export function toCurrentUserDTO(u: SessionUser): CurrentUserDTO {
  return {
    id: u.id,
    email: u.email,
    name: u.name,
    nickname: u.nickname,
    displayName: displayName(u),
    role: u.role,
    color: u.color,
  }
}
