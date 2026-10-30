'use server'
// src/server/actions/auth.ts — login/logout/own password/sign out everywhere (FR-101, FR-105, FR-107).
// Results carry `redirectTo`; the client performs a full navigation (M1-D6, M1-D7). Session lifecycle (login,
// logout) is not audited (M1-D9); password change and sign-out-everywhere are (by the services).
import { hashPassword } from 'better-auth/crypto'
import { headers } from 'next/headers'
import { th } from '@/i18n/th'
import { safeNext } from '@/lib/safe-next'
import { changePasswordInput, loginInput, passwordPolicy } from '@/lib/schemas/account'
import { z } from '@/lib/z'
import { action, publicAction } from '../action'
import { auth } from '../auth'
import { mapAuthApiError } from '../auth-errors'
import * as authz from '../authz'
import { db } from '../db/client'
import { AppError, ValidationError } from '../errors'
import * as services from '../services'

type Redirect = { redirectTo: string }

/** Better Auth sign-in (lockout hooks + ban check apply); nextCookies() writes the session cookie. */
export const login = publicAction(loginInput, async ({ email, password, next }): Promise<Redirect> => {
  let mustChange = false
  try {
    const res = await auth.api.signInEmail({ body: { email, password }, headers: await headers() })
    mustChange = (res.user as { mustChangePassword?: unknown }).mustChangePassword === true
  } catch (e) {
    throw mapAuthApiError(e)
  }
  const target = safeNext(next)
  if (!mustChange) return { redirectTo: target }
  return { redirectTo: `/account/password${target === '/home' ? '' : `?next=${encodeURIComponent(target)}`}` }
})

export const logout = action(
  z.object({}),
  async (_input, { user }): Promise<Redirect> => {
    authz.requireUser(user)
    await auth.api.signOut({ headers: await headers() }) // nextCookies clears the cookies in the action response
    return { redirectTo: '/login' }
  },
  { allowWhenMustChangePassword: true },
)

/** FR-105 / X60: current password required; new ≥ 8, ≠ email (and its local part), ≠ current. Keeps this session. */
export const changeOwnPassword = action(
  changePasswordInput,
  async (input, { user }): Promise<Redirect> => {
    authz.requireUser(user)
    const issues = passwordPolicy(input.newPassword, { email: user.email, currentPassword: input.currentPassword })
    if (issues.length > 0) throw new ValidationError({ newPassword: issues.map((i) => th.account.policy[i]) })
    if (!(await services.account.verifyOwnPassword(db, user.id, input.currentPassword))) {
      throw new AppError('INVALID_PASSWORD', undefined, {
        fieldErrors: { currentPassword: [th.errors.INVALID_PASSWORD] },
      })
    }
    const passwordHash = await hashPassword(input.newPassword) // before the tx (scrypt is slow)
    await db.transaction((tx) => services.account.changeOwnPassword(tx, user, { passwordHash }))
    return { redirectTo: safeNext(input.next) }
  },
  { allowWhenMustChangePassword: true },
)

/** FR-107: deletes every session of the user, this one included (M1-D10). */
export const signOutEverywhere = action(
  z.object({}),
  async (_input, { user }): Promise<Redirect> => {
    authz.requireUser(user)
    await db.transaction((tx) => services.account.signOutEverywhere(tx, user))
    return { redirectTo: '/login' }
  },
  { allowWhenMustChangePassword: true },
)
