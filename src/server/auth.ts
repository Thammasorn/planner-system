// src/server/auth.ts — Better Auth (SPEC §7.1, PLAN.md §1.3, r2 §2.1). Base config from M1 S0.8; S2.3 added the
// FR-106 lockout hooks, the production rate-limit backstop, trusted origins and proxy IP settings.
//
// Rules:
// - No 'server-only' (M1-D4): `pnpm auth:check` (CLI), tsx scripts and the Playwright reset import this module.
// - Read process.env directly — never throw at import, so `next build` and `auth check schema` work without secrets.
// - All account mutations go through our transactional services (M1-D3); every /admin/* HTTP path is disabled.
// - `nextCookies()` MUST stay the last plugin (r2 §2.6).
import { betterAuth } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { nextCookies } from 'better-auth/next-js'
import { APIError, createAuthMiddleware, getIP, isAPIError } from 'better-auth/api'
import { admin } from 'better-auth/plugins'
import { createAccessControl } from 'better-auth/plugins/access'
import { adminAc, defaultStatements, userAc } from 'better-auth/plugins/admin/access'
import { and, count, eq, gt, lt, sql } from 'drizzle-orm'
import { th } from '@/i18n/th'
import { db } from './db/client'
import { account, authLoginFailures, session, user, verification } from './db/schema'
import { csv } from './env'

const ac = createAccessControl(defaultStatements)
export const roles = {
  manager: ac.newRole({ ...adminAc.statements }),
  worker: ac.newRole({ ...userAc.statements }),
}

/**
 * HTTP paths of Better Auth that must not be reachable (FR-101, R-M1-6): sign-up, self-service profile/email/password
 * changes, resets, verification, social, session management (our actions replace it) and every admin endpoint
 * (checked against node_modules/better-auth/dist/plugins/admin/routes.mjs, 1.7.6). `auth.api.*` calls bypass this list.
 */
export const DISABLED_AUTH_PATHS = [
  '/sign-up/email',
  '/update-user',
  '/change-email',
  '/delete-user',
  '/delete-user/callback',
  '/change-password',
  '/request-password-reset',
  '/reset-password',
  '/reset-password/:token',
  '/send-verification-email',
  '/verify-email',
  '/sign-in/social',
  '/link-social',
  '/unlink-account',
  '/list-accounts',
  '/account-info',
  '/get-access-token',
  '/refresh-token',
  '/update-session',
  '/revoke-other-sessions',
  '/revoke-session',
  '/revoke-sessions',
  '/admin/create-user',
  '/admin/update-user',
  '/admin/set-role',
  '/admin/set-user-password',
  '/admin/ban-user',
  '/admin/unban-user',
  '/admin/remove-user',
  '/admin/impersonate-user',
  '/admin/stop-impersonating',
  '/admin/list-users',
  '/admin/get-user',
  '/admin/list-user-sessions',
  '/admin/revoke-user-session',
  '/admin/revoke-user-sessions',
  '/admin/has-permission',
  // Not in the plan's list; found in node_modules/better-auth/dist/api/routes (1.7.6): an unthrottled password
  // oracle (no lockout) and a session listing — our UI uses neither.
  '/verify-password',
  '/list-sessions',
]

/** FR-106: at most 5 failed sign-ins per (email, IP) within 15 minutes (M1-D11). */
export const LOCKOUT = { max: 5, windowMinutes: 15 } as const

type HookCtx = Parameters<Parameters<typeof createAuthMiddleware>[0]>[0]

/** Lockout key: lower(trim(email)) + the client IP Better Auth resolves (or 'unknown'). Null without an email. */
function lockKey(ctx: HookCtx): { email: string; ip: string } | null {
  const body = ctx.body as { email?: unknown } | undefined
  const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : ''
  if (!email) return null
  const src = ctx.request ?? ctx.headers // HTTP path has request; auth.api path has headers
  const ip = (src ? getIP(src, ctx.context.options) : null) ?? 'unknown'
  return { email, ip }
}

const lockWindow = sql.raw(`now() - interval '${LOCKOUT.windowMinutes} minutes'`)

export const auth = betterAuth({
  appName: 'Team Working OS',
  baseURL: process.env.BETTER_AUTH_URL,
  secret: process.env.BETTER_AUTH_SECRET,
  trustedOrigins: [process.env.BETTER_AUTH_URL ?? '', ...csv(process.env.TRUSTED_ORIGINS)].filter(Boolean),
  database: drizzleAdapter(db, { provider: 'pg', schema: { user, session, account, verification } }),
  emailAndPassword: {
    enabled: true,
    disableSignUp: true, // FR-101 / AC-102
    minPasswordLength: 8,
    maxPasswordLength: 128,
    autoSignIn: false,
  },
  session: {
    expiresIn: 60 * 60 * 24 * 7, // FR-103: 7 days
    updateAge: 60 * 60 * 24, // slide at most once per day of use
    cookieCache: { enabled: false }, // AC-104: revocation must be immediate (R-M1-2)
  },
  user: {
    additionalFields: {
      nickname: { type: 'string', required: false, input: false },
      positionId: { type: 'string', required: false, input: false },
      mustChangePassword: { type: 'boolean', required: true, defaultValue: true, input: false },
      color: { type: 'string', required: false, input: false },
      // deactivatedOn deliberately NOT declared (calendar DATE, BR-04) — r2 §4
    },
  },
  advanced: {
    useSecureCookies: process.env.SECURE_COOKIES === 'true', // NFR-08b
    ipAddress: { ipAddressHeaders: ['x-forwarded-for'], trustedProxies: csv(process.env.TRUSTED_PROXIES) },
  },
  // Backstop only (FR-106 is the hooks below); off under test hooks because e2e signs in often (M1-D11, R-M1-9).
  rateLimit: {
    enabled: process.env.NODE_ENV === 'production' && process.env.ALLOW_TEST_HOOKS !== '1',
    window: 60,
    max: 100,
    customRules: { '/sign-in/email': { window: 60, max: 30 } },
  },
  disabledPaths: DISABLED_AUTH_PATHS,
  // Same hooks run for HTTP sign-ins and for auth.api.signInEmail (the login server action) — r2 §6.1.
  // Attempts while locked are not recorded, so the lock ends 15 minutes after the 5th failure; unknown emails count
  // the same (no enumeration); a banned user's correct password (BANNED_USER) records nothing.
  hooks: {
    before: createAuthMiddleware(async (ctx) => {
      if (ctx.path !== '/sign-in/email') return
      const k = lockKey(ctx)
      if (!k) return
      const [row] = await db
        .select({ n: count() })
        .from(authLoginFailures)
        .where(
          and(
            eq(authLoginFailures.email, k.email),
            eq(authLoginFailures.ip, k.ip),
            gt(authLoginFailures.createdAt, lockWindow),
          ),
        )
      if (Number(row?.n ?? 0) >= LOCKOUT.max) {
        throw new APIError('TOO_MANY_REQUESTS', { code: 'LOGIN_LOCKED', message: th.auth.errors.LOGIN_LOCKED })
      }
    }),
    after: createAuthMiddleware(async (ctx) => {
      if (ctx.path !== '/sign-in/email') return
      const k = lockKey(ctx)
      if (!k) return
      const returned = ctx.context.returned // the APIError instance when the endpoint threw
      if (isAPIError(returned)) {
        if ((returned.body as { code?: string } | undefined)?.code === 'INVALID_EMAIL_OR_PASSWORD') {
          await db.insert(authLoginFailures).values(k)
          await db.delete(authLoginFailures).where(lt(authLoginFailures.createdAt, sql`now() - interval '1 day'`))
        }
        return
      }
      await db
        .delete(authLoginFailures)
        .where(and(eq(authLoginFailures.email, k.email), eq(authLoginFailures.ip, k.ip)))
    }),
  },
  plugins: [
    admin({
      ac,
      roles,
      defaultRole: 'worker',
      adminRoles: ['manager'],
      bannedUserMessage: th.auth.errors.ACCOUNT_DEACTIVATED,
    }),
    nextCookies(), // MUST stay last
  ],
  telemetry: { enabled: false },
})

export type AuthSession = typeof auth.$Infer.Session
