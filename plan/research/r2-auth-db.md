# R2 — Auth & DB facts for the implementation plan

Better Auth 1.7.6 · Drizzle ORM 0.45.3 / drizzle-kit 0.31.11 · postgres.js 3.4.9 · PostgreSQL 17.11 · Next.js 16.3.7 (for the integration check)

- **Researched:** 2026-09-30, on macOS arm64 with Node v26.5.0 and npm 11.17.
- **Method:** I installed the real packages in a scratch folder and read their `.d.ts` files and bundled source. I then ran every claim that has a "verified" tag against a throwaway `postgres:17` container. The Better Auth flows ran through `auth.handler(new Request(...))` (the HTTP path) and through `auth.api.*` (the server-action path). I also built a minimal **Next 16.3.7** app and ran it with `next start` and with the `standalone` `server.js`.
- **Scratch evidence:** `r2-auth-db/v2/`
  - `sql/`: the SPEC DDL taken verbatim from SPEC.md, plus the behaviour scripts.
  - `app/` and `kt1/`: the Drizzle schema, `auth.ts`, services, migrations and test scripts.
  - `nx/`: the Next 16 integration app.
  - `gen/`: the Better Auth CLI output.

Confidence tags used below:
- **[V]** verified: read in `.d.ts` or source, or executed here.
- **[L]** likely.
- **[U]** uncertain.

---

## 0. TL;DR — what the plan should say

1. **Pin these versions exactly:**
   - `better-auth@1.7.6`
   - `drizzle-orm@0.45.3` and `drizzle-kit@0.31.11`. **Drizzle 1.0 is still RC (1.0.0-rc.4) and is not stable.** Do not upgrade during the MVP: the migration folder format changes.
   - `postgres@3.4.9`
   - `zod@^4` (Better Auth 1.7.6 depends on `zod ^4.5.4`).
   - The Better Auth CLI is now the **`auth`** package, pinned to the same version: `auth@1.7.6`. `@better-auth/cli` is deprecated and says "Package no longer supported". [V]
2. **Session settings:** `session: { expiresIn: 7d, updateAge: 1d, cookieCache: { enabled: false } }`.
   - `cookieCache` is **off by default**. When on, a revoked or banned session **stays valid for up to `maxAge`**. I proved this empirically, so AC-104 requires it off. [V]
3. **Cookies:** `advanced.useSecureCookies: process.env.SECURE_COOKIES === 'true'`. Better Auth already sets `HttpOnly`, `SameSite=Lax` and `Path=/`, and Max-Age = expiresIn. When secure, the cookie name gets the `__Secure-` prefix. [V]
4. **Login is a server action** calling `auth.api.signInEmail({ body, headers: await headers() })`, with the `nextCookies()` plugin placed **last** in `plugins`. This works end-to-end on Next 16.3.7: 303 + Set-Cookie. [V]
5. **Use `proxy.ts` (Next 16) as the real auth gate.** It calls `auth.api.getSession({ headers: req.headers, returnHeaders: true })`, copies `Set-Cookie` onto the response, and redirects for AC-101 and AC-103.
   - Why: RSC page renders refresh the DB session but **cannot renew the cookie** (verified gap). Without the proxy, FR-103 "renew on use" silently fails for users who only load pages. [V]
6. **Admin plugin with custom roles.** Use `admin({ ac, roles: { manager, worker }, adminRoles: ['manager'], defaultRole: 'worker', bannedUserMessage: <Thai> })`.
   - `adminRoles: ['manager']` **without** `roles` throws `Invalid admin roles: manager`. [V]
   - A banned user's sign-in gets **403 `BANNED_USER`** with the custom message. [V]
7. **Account mutations use app services, one Drizzle transaction each.** This covers create employee, reset password, change own password, deactivate/reactivate and role change. They write Better Auth's tables directly with `hashPassword`/`verifyPassword` from **`better-auth/crypto`**.
   - All of these flows are verified against real Better Auth sign-in and getSession.
   - Why not the admin endpoints: they are not transactional with `work_schedules` or `audit_log`, `setUserPassword` does **not** revoke sessions, and they cannot enforce FR-206.
   - Disable `/api/auth/admin/*` (and sign-up, update-user and the others) with `disabledPaths`. `disabledPaths` only blocks HTTP; `auth.api.*` still works. [V]
8. **FR-106 lockout:** a custom `login_attempts` table plus `hooks.before` and `hooks.after` on `/sign-in/email`.
   - Behaviour: 5 × 401 `INVALID_EMAIL_OR_PASSWORD` produces a 429 `LOGIN_LOCKED` with a Thai message, keyed on IP + email, with a 15-minute window. Hooks run for **both** HTTP and `auth.api` calls. [V]
   - The built-in `rateLimit` cannot include email in its key, applies only to HTTP, and replies in English. Recommend leaving it **off** (see §6.4). [V]
9. **Better Auth tables are hand-written in `schema.ts`.** The CLI output is the starting point, but use **`timestamptz`** columns. The CLI emits `timestamp` without time zone, which I showed to shift by 7 h with `defaultNow()` when the DB TimeZone is not UTC.
   - Validate with **`pnpm exec auth check schema --config src/server/auth.ts`**, which exits 1 on mismatch. [V]
10. **The SPEC §6.2 DDL runs cleanly on PG 17.11,** in one transaction and with `ON_ERROR_STOP`. There are six gaps to fix in the plan (§11.3):
    - `user.ban_expires` and `session.impersonated_by` are missing from the SPEC comment but are required.
    - §6.4 trigram indexes are missing from the DDL.
    - The BR-20b trigger can be bypassed under concurrency unless every allocation write first locks the assignment row (proven, with the fix proven).
    - Restoring a soft-deleted `time_off` can hit 23P01.
    - AM + PM half-days on the same date are rejected.
    - `committed` sums are NULL (not 0) when there are no CONFIRMED rows.

---

## 1. Versions (npm registry, 2026-09-30) [V]

| Package | Pin | Released | Notes |
|---|---|---|---|
| better-auth | **1.7.6** | 2026-09-24 | 1.7.0 = 2026-08-18. `release-1.6` = 1.6.33. Deps: `zod ^4.5.4`, `kysely`, `better-call 1.4.0`, `@better-auth/drizzle-adapter 1.7.6`. Peers: `drizzle-orm ^0.45.2 \|\| >=1.0.0-rc.1 <2`, `drizzle-kit >=0.31.4`, `next ^14\|\|^15\|\|^16`, `react ^18\|\|^19` (all optional). |
| auth (Better Auth CLI) | **1.7.6** | same | bins `auth` and `better-auth`; depends on `better-auth 1.7.6` exactly. |
| @better-auth/cli | do **not** use | latest 1.4.21 | `npm view @better-auth/cli@1.4.21 deprecated` → "Package no longer supported…". |
| drizzle-orm | **0.45.3** (`latest`) | 2026-09-21 | `rc` = 1.0.0-rc.4 (2026-06-27), `beta` = 1.0.0-beta.22. **1.0 is not stable.** |
| drizzle-kit | **0.31.11** (`latest`) | 2026-09-21 | `rc` = 1.0.0-rc.4. |
| postgres (postgres.js) | **3.4.9** | 2026-04-05 | `beta` 3.0.0-rc.3 is an old tag; ignore it. |
| zod | 4.6.5 | | Better Auth requires zod 4. |
| next | 16.3.7 | | used only for the integration test. Peer: react ^18.2 \|\| ^19. Engines: node >= 20.9. |
| PostgreSQL image | `postgres:17` → **17.11** (Debian 17.11-1.pgdg13+2) | | extensions available: `pg_trgm 1.6`, `btree_gist 1.7`, `pgcrypto 1.3`. |

Side findings outside my scope (flag to the toolchain researcher):
- **`typescript@latest` is 7.0.2**, the Go-native release of 2026-07-08. **`typescript-eslint@8.71.0` declares a peer of `typescript >=4.8.4 <6.1.0`.** Pin `typescript@~6.0.3`. [V]
- npm 11.17 (and pnpm 10+) block dependency lifecycle scripts by default. I saw `npm warn allow-scripts esbuild… postinstall`. esbuild still worked through its optional platform package. Remember pnpm's `onlyBuiltDependencies` (or `pnpm approve-builds`). [V for npm; L for pnpm]

Install (pnpm):

```bash
pnpm add better-auth@1.7.6 drizzle-orm@0.45.3 postgres@3.4.9 zod@^4
pnpm add -D drizzle-kit@0.31.11 auth@1.7.6 tsx
```

---

## 2. Better Auth configuration

### 2.1 Final recommended `src/server/auth.ts`

This exact file passed every test in §14 (`auth-tests.ts` ALL PASS; `account-services-test.ts` ALL PASS; `tsc --noEmit` clean; `auth check schema` passed). [V]

```ts
import { betterAuth } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { APIError, createAuthMiddleware, getIP, isAPIError } from 'better-auth/api'
import { nextCookies } from 'better-auth/next-js'
import { admin } from 'better-auth/plugins'
import { createAccessControl } from 'better-auth/plugins/access'
import { adminAc, defaultStatements, userAc } from 'better-auth/plugins/admin/access'
import { and, count, eq, gt, lt, sql } from 'drizzle-orm'
import { th } from '@/i18n/th'
import { db } from './db/client'
import * as schema from './db/schema'

// roles: manager = admin powers, worker = none
const ac = createAccessControl(defaultStatements)
export const roles = {
  manager: ac.newRole({ ...adminAc.statements }),
  worker: ac.newRole({ ...userAc.statements }),
}

// FR-106: 5 failures / 15 min per (IP + email)
export const LOCKOUT = { max: 5, windowMs: 15 * 60 * 1000 }
type HookCtx = Parameters<Parameters<typeof createAuthMiddleware>[0]>[0]
function lockKey(ctx: HookCtx): { email: string; ip: string } | null {
  const body = ctx.body as { email?: unknown } | undefined
  const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : ''
  if (!email) return null
  const src = ctx.request ?? ctx.headers            // HTTP path has request; auth.api path has headers
  const ip = (src ? getIP(src, ctx.context.options) : null) ?? 'unknown'
  return { email, ip }
}

export const auth = betterAuth({
  appName: 'Team Working OS',
  baseURL: process.env.BETTER_AUTH_URL,
  secret: process.env.BETTER_AUTH_SECRET,
  trustedOrigins: (process.env.TRUSTED_ORIGINS ?? '').split(',').map((s) => s.trim()).filter(Boolean),
  database: drizzleAdapter(db, { provider: 'pg', schema }),
  emailAndPassword: {
    enabled: true,
    disableSignUp: true,        // FR-101 / AC-102
    minPasswordLength: 8,       // FR-105 (also enforce ≠ email in zod)
    maxPasswordLength: 128,
    autoSignIn: false,          // irrelevant with sign-up disabled; explicit
  },
  session: {
    expiresIn: 60 * 60 * 24 * 7, // FR-103: 7 days
    updateAge: 60 * 60 * 24,     // slide at most once/day of use
    cookieCache: { enabled: false }, // AC-104: revocation must be immediate
  },
  user: {
    additionalFields: {
      nickname:           { type: 'string',  required: false, input: false },
      positionId:         { type: 'string',  required: false, input: false },
      mustChangePassword: { type: 'boolean', required: true, defaultValue: true, input: false },
      color:              { type: 'string',  required: false, input: false },
      // deactivatedOn is deliberately NOT declared (calendar DATE, app-owned) — see §4
    },
  },
  rateLimit: { enabled: process.env.AUTH_RATE_LIMIT === 'on' }, // default off — see §6.4
  advanced: {
    useSecureCookies: process.env.SECURE_COOKIES === 'true',
    ipAddress: {
      ipAddressHeaders: ['x-forwarded-for'],
      trustedProxies: (process.env.TRUSTED_PROXIES ?? '').split(',').map((s) => s.trim()).filter(Boolean),
    },
  },
  disabledPaths: [
    '/sign-up/email', '/update-user', '/change-email', '/delete-user', '/request-password-reset', '/reset-password',
    '/admin/create-user', '/admin/update-user', '/admin/set-role', '/admin/set-user-password', '/admin/ban-user',
    '/admin/unban-user', '/admin/remove-user', '/admin/impersonate-user', '/admin/stop-impersonating',
    '/admin/list-users', '/admin/get-user', '/admin/list-user-sessions', '/admin/revoke-user-session',
    '/admin/revoke-user-sessions', '/admin/has-permission',
  ],
  hooks: {
    before: createAuthMiddleware(async (ctx) => {
      if (ctx.path !== '/sign-in/email') return
      const k = lockKey(ctx); if (!k) return
      const since = new Date(Date.now() - LOCKOUT.windowMs)
      const [row] = await db.select({ n: count() }).from(schema.loginAttempts).where(and(
        eq(schema.loginAttempts.email, k.email), eq(schema.loginAttempts.ip, k.ip), gt(schema.loginAttempts.attemptedAt, since)))
      if ((row?.n ?? 0) >= LOCKOUT.max)
        throw new APIError('TOO_MANY_REQUESTS', { code: 'LOGIN_LOCKED', message: th.auth.errors.LOGIN_LOCKED })
    }),
    after: createAuthMiddleware(async (ctx) => {
      if (ctx.path !== '/sign-in/email') return
      const k = lockKey(ctx); if (!k) return
      const returned = ctx.context.returned                 // APIError instance when the endpoint threw
      if (isAPIError(returned)) {
        if ((returned.body as { code?: string } | undefined)?.code === 'INVALID_EMAIL_OR_PASSWORD') {
          await db.insert(schema.loginAttempts).values(k)
          await db.delete(schema.loginAttempts).where(lt(schema.loginAttempts.attemptedAt, sql`now() - interval '1 day'`))
        }
        return
      }
      await db.delete(schema.loginAttempts).where(and(eq(schema.loginAttempts.email, k.email), eq(schema.loginAttempts.ip, k.ip)))
    }),
  },
  plugins: [
    admin({ ac, roles, defaultRole: 'worker', adminRoles: ['manager'], bannedUserMessage: th.auth.errors.BANNED_USER }),
    nextCookies(), // MUST be last (Better Auth warns otherwise)
  ],
  telemetry: { enabled: false },
})

export type Session = typeof auth.$Infer.Session
```

### 2.2 `emailAndPassword` [V]

Source: `node_modules/@better-auth/core/dist/types/init-options.d.mts` lines 684–826.

- `enabled` defaults to false.
- `disableSignUp` defaults to false.
- `minPasswordLength` defaults to 8; `maxPasswordLength` defaults to 128.
- `autoSignIn` defaults to true.
- `revokeSessionsOnPasswordReset` defaults to false. It applies only to the reset-token flow, which we don't use.
- `password.{hash,verify}` override the hashing. By default Better Auth uses scrypt.

Sign-up behaviour:
- `disableSignUp: true` makes both HTTP and `auth.api.signUpEmail` throw `400 EMAIL_PASSWORD_SIGN_UP_DISABLED` ("Email and password sign up is not enabled").
- With `/sign-up/email` also listed in `disabledPaths`, the HTTP POST returns **404 "Not Found"**. Either result satisfies AC-102. [V executed]

Sign-in errors, from `dist/api/routes/sign-in.mjs` [V]:
- Unknown email, or no credential account: `401 INVALID_EMAIL_OR_PASSWORD`. Better Auth still hashes a dummy value, so timing is equal.
- Wrong password: `401 INVALID_EMAIL_OR_PASSWORD`.
- An email that fails `z.email()` gets `400 INVALID_EMAIL`. **This includes an email with a trailing space, because Better Auth does NOT trim.** The login action must `trim().toLowerCase()` the email first. [V executed]
- The email lookup is `findUserByEmail(email.toLowerCase())`, a case-sensitive `=` on the stored value. Better Auth stores emails lower-cased, so direct inserts **must** store `lower(trim(email))`. [V source + executed]
- Password length over max: 400.
- Banned user with the **correct** password: 403 `BANNED_USER`. With a wrong password the user gets 401, because the ban is checked in the session-create hook after the password check. [V executed]

### 2.3 Session: expiry, refresh and cookie cache [V]

- The defaults are `expiresIn` 7 d and `updateAge` 1 d.
- Refresh rule, from `dist/api/routes/session.mjs`: `shouldBeUpdated = expiresAt − expiresIn + updateAge <= now`. When true, `expiresAt` becomes `now + expiresIn` and the cookie is re-sent with `Max-Age=expiresIn`.
- Executed checks:
  - A session "2 days old" was extended to now+7d, with a new Set-Cookie.
  - A session "12 h old" was not touched and got no Set-Cookie.
- `cookieCache` (`session.cookieCache.enabled`, default **false**, `maxAge` default 300 s, strategies `compact|jwt|jwe`). When enabled, `getSession` trusts the signed `session_data` cookie until `maxAge` without reading the DB. **Executed** (`scripts/cookiecache-test.ts`): with cookieCache ON, I deleted the DB session row and `auth.api.getSession` **still returned the session**. With `query: { disableCookieCache: true }` it returned `null`. **So keep it OFF for AC-104.**
- `getAuthoritativeSessionFromCtx` (used by admin endpoints and `changePassword`) bypasses the cache. Normal `getSession` calls do not.
- With the cache off, every `getSession` costs about 2 small queries (session by token, then user by id; joins are off by default). At 100 users this is fine.
- `freshAge` defaults to 1 d. It is only used by `freshSessionMiddleware` (for example deleteUser), not by `changePassword`.

### 2.4 Cookie attributes [V]

From `dist/cookies/index.mjs` `createCookieGetter`:

- The defaults are `{ secure: <computed>, sameSite: 'lax', path: '/', httpOnly: true }`. `advanced.defaultCookieAttributes` and `advanced.cookies[name].attributes` can override them.
- `secure` / name prefix is decided in this order:
  1. `advanced.useSecureCookies` if it is defined, **including `false`**;
  2. otherwise, with a dynamic baseURL, its protocol;
  3. otherwise, whether the `baseURL` string starts with `https://`;
  4. otherwise `NODE_ENV === 'production'`.
- When secure, **the cookie name is `__Secure-better-auth.session_token`**.
- Executed results:
  - `SECURE_COOKIES=false`: `better-auth.session_token=…; Max-Age=604800; Path=/; HttpOnly; SameSite=Lax`.
  - `SECURE_COOKIES=true` (NODE_ENV=production, http baseURL): `__Secure-better-auth.session_token=…; Max-Age=604800; Path=/; HttpOnly; Secure; SameSite=Lax`.
  - `SECURE_COOKIES=false` with `BETTER_AUTH_URL=https://…` and production: no `Secure` and no prefix. The explicit `false` wins.
- Other cookies:
  - `better-auth.session_data` is only set with cookieCache.
  - `better-auth.dont_remember` is only set with `rememberMe:false`.
  - `admin_session` is only set during impersonation.
- `getSessionCookie(req)` from `better-auth/cookies` checks both `__Secure-` and plain names. It only tests presence; it does not validate.

### 2.5 `baseURL`, `trustedOrigins` and CSRF [V source + executed]

- `baseURL` falls back to `BETTER_AUTH_URL` and similar env vars. If it is unset, you get a WARN and the origin is derived from each request.
- **Origin validation only runs for HTTP requests through the router** (`ctx.request` present, POST, with a Cookie header present). The sign-in `formCsrfMiddleware` also validates Origin or Referer when there is no cookie.
- An untrusted Origin on a cookie-bearing POST returns **403 `INVALID_ORIGIN`**. [V executed]
- **`auth.api.*` calls from server actions skip Better Auth's origin checks** because there is no `ctx.request`. Next.js's own Server Action CSRF check (Origin vs Host / `x-forwarded-host`) applies instead.
  - In the Next test, login through a server action succeeded while `BETTER_AUTH_URL=http://localhost:3107` and the browser origin was `http://127.0.0.1:3107`.
  - A request whose Origin did not match the Host was silently rejected by Next: no cookie was set. [V executed]
- Recommendation:
  - Set `BETTER_AUTH_URL` to the URL users actually open.
  - Add `TRUSTED_ORIGINS` (comma list) for alternates, such as an IP URL.
  - Behind a proxy that does not set `X-Forwarded-Host`, configure Next's `serverActions.allowedOrigins` (Next researcher to confirm).
- **Secret:** a missing secret or the default secret in production throws `BetterAuthError: You are using the default secret…`. A secret under 32 characters, or with low entropy, logs a warning. Generate one with `openssl rand -base64 32` or `npx auth secret`. [V source]

### 2.6 Next.js integration: `toNextJsHandler`, `nextCookies` and reading the session [V executed on Next 16.3.7]

Route handler (SPEC `api/auth/[...all]`):

```ts
// src/app/api/auth/[...all]/route.ts
import { toNextJsHandler } from 'better-auth/next-js'
import { auth } from '@/server/auth'
export const { GET, POST } = toNextJsHandler(auth)   // returns GET/POST/PATCH/PUT/DELETE
```

Reading the session:

```ts
// src/server/session.ts  (RSC / layouts / pages)
import 'server-only'
import { headers } from 'next/headers'
import { cache } from 'react'
import { auth } from './auth'
export const getCurrentSession = cache(async () => auth.api.getSession({ headers: await headers() }))
// server actions and route handlers: auth.api.getSession({ headers: await headers() })  (same call)
```

Login server action. Executed: a wrong password rendered the Thai message inline; a correct password returned **303 + `Set-Cookie`**; `mustChangePassword` redirected to `/account/password`.

```ts
'use server'
import { APIError } from 'better-auth/api'
import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { auth } from '@/server/auth'
import { th } from '@/i18n/th'
export async function loginAction(_prev: unknown, formData: FormData) {
  const email = String(formData.get('email') ?? '').trim().toLowerCase()
  const password = String(formData.get('password') ?? '')
  let mustChange = false
  try {
    const res = await auth.api.signInEmail({ body: { email, password }, headers: await headers() })
    mustChange = Boolean((res.user as { mustChangePassword?: boolean }).mustChangePassword)
  } catch (e) {
    if (e instanceof APIError) {
      const code = String((e.body as { code?: string } | undefined)?.code ?? e.status)
      return { ok: false as const, code, message: (th.auth.errors as Record<string, string>)[code] ?? e.message }
    }
    throw e
  }
  redirect(mustChange ? '/account/password' : '/home')
}
```

`nextCookies()` internals, from `dist/integrations/next-js.mjs` [V source]:

- The **after** hook copies every Set-Cookie into `cookies().set()`. In RSC, errors are swallowed.
- The **before** hook on `/get-session` marks "skip refresh" when the request is an RSC request (`RSC: 1` and no `next-action`).
- A guard warns if the plugin is not last among plugins that have after-hooks.

**The RSC cookie-renewal gap [V executed].** A full-page (document) request carries no `RSC` header, so Better Auth refreshes the DB session during the RSC render. `cookies().set` then fails silently.

Result: the DB `expires_at` moved to now+7d, but **the response had no Set-Cookie**. A route handler in the same day found nothing left to refresh, so it sent no cookie either. The browser cookie therefore keeps its original Max-Age and expires 7 days after login, even with daily use. This breaks FR-103.

**Fix (verified):** a DB-validating `proxy.ts` (Next 16's renamed middleware, Node runtime by default).

```ts
// src/proxy.ts
import { NextResponse, type NextRequest } from 'next/server'
import { auth } from '@/server/auth'
export async function proxy(req: NextRequest) {
  const { headers: authHeaders, response: session } = await auth.api.getSession({ headers: req.headers, returnHeaders: true })
  const path = req.nextUrl.pathname
  let res: NextResponse
  if (!session) res = NextResponse.redirect(new URL('/login', req.url))                                   // AC-101
  else if (session.user.mustChangePassword && path !== '/account/password')
    res = NextResponse.redirect(new URL('/account/password', req.url))                                    // AC-103
  else res = NextResponse.next()
  for (const c of authHeaders?.getSetCookie?.() ?? []) res.headers.append('set-cookie', c)                // FR-103 cookie renewal
  return res
}
export const config = { matcher: ['/((?!api|login|_next/static|_next/image|favicon.ico).*)'] }
// plan: also exclude self-hosted fonts/images in public/ from the matcher to avoid DB hits
```

What I checked against the standalone `server.js` [V]:
- No cookie: 307 to `/login`.
- `mustChangePassword`: 307 to `/account/password`, and `/account/password` itself returns 200.
- A stale session on a document GET: `set-cookie: better-auth.session_token=…` and the DB `expires_at` moves to now+7d. A second request the same day sets no cookie.
- An RSC navigation (`RSC: 1`): refreshed as well, with the cookie on the 307 `/?_rsc` response.
- A deleted session (for example, deactivated): 307 `/login` and all three cookies cleared (`Max-Age=0`).

Caveats:
- Server actions and route handlers are **not** covered by the proxy matcher above. The `action()` wrapper and route handlers must re-check the session and `mustChangePassword` in `authz.ts`. Allow-list only the change-password action and sign-out.
- Each navigation costs about 2 queries in the proxy plus about 2 in the page (React `cache` deduplicates within the render only). This is fine at the target scale.
- **Build-time environment [V executed]:** `next build` imports route modules ("Collecting page data").
  - A DB client that `throw`s on a missing `DATABASE_URL` **fails the build**: `Error: Failed to collect configuration for /api/auth/[...all] … DATABASE_URL is required`. Make the client lazy (postgres.js connects lazily) or give it a placeholder URL.
  - Without `BETTER_AUTH_SECRET` the build succeeds but logs `BetterAuthError: You are using the default secret` several times.
  - In the Docker **builder** stage, set placeholder `DATABASE_URL`, `BETTER_AUTH_SECRET` (32+ chars) and `BETTER_AUTH_URL` values. The real `.env` values override them at run time through `env_file`.

### 2.7 `disabledPaths` [V source + executed]

- It is enforced only in the router `onRequest` (`dist/api/index.mjs` ~L166): `if (disabledPaths.includes(normalizedPath)) return new Response("Not Found", { status: 404 })`.
- `auth.api.*` server calls do **not** pass through it. I confirmed `auth.api.banUser` and `setUserPassword` still work.
- Why disable `/update-user`: every `additionalFields` entry with `input !== false` would otherwise be user-writable. With `input:false` the server-side `auth.api.updateUser` rejects the write anyway (`400 FIELD_NOT_ALLOWED`).
- Why disable `/admin/*`: a manager's browser could otherwise call `/admin/remove-user` (hard delete, which cascades), `/admin/set-role` (bypassing FR-206) or `/admin/impersonate-user` directly.

### 2.8 Telemetry and offline operation [V source]

`@better-auth/telemetry` is enabled only if `telemetry.enabled` is set or `BETTER_AUTH_TELEMETRY=1`, and it is off in tests. The default is off, so there are no runtime network calls. `telemetry: { enabled: false }` just makes that explicit.

---

## 3. Admin plugin (`better-auth/plugins` → `admin`) [V]

Sources:
- `node_modules/better-auth/dist/plugins/admin/{admin.mjs, routes.mjs, schema.mjs, types.d.mts, error-codes.mjs, access/statement.mjs}`

### 3.1 Options (`types.d.mts`)

| Option | Default | Notes |
|---|---|---|
| `defaultRole` | `'user'` | Set to `'worker'`. The user.create.before hook sets `role` when absent. |
| `adminRoles` | `['admin']` | **Every name must exist in `roles`** (or in the default admin/user roles). `admin({ adminRoles:['manager'] })` without `roles` throws `BetterAuthError: Invalid admin roles: manager. Admin roles must be defined in the 'roles' configuration.` [V executed] |
| `ac`, `roles` | default `{ admin: adminAc, user: userAc }` | Custom roles: `createAccessControl(defaultStatements)`, then `manager = ac.newRole({...adminAc.statements})` and `worker = ac.newRole({...userAc.statements})`. |
| `defaultBanReason` | none | `banUser` without a reason stores `'No reason'`. |
| `defaultBanExpiresIn` | undefined (never) | Seconds. |
| `bannedUserMessage` | "You have been banned from this application. Please contact support if you believe this is an error." | A string or a function. Use Thai. |
| `impersonationSessionDuration` | 3600 s | Unused. |
| `adminUserIds` | none | Overrides roles. Unused. |
| `schema` | | Rename fields or tables. |

The permission statements are `user: [create, list, set-role, ban, impersonate, impersonate-admins, delete, set-password, set-email, get, update]` and `session: [list, revoke, delete]`. `adminAc` holds all of them except `impersonate-admins`; `userAc` holds none.

### 3.2 Schema the plugin adds (`schema.mjs`)

**The plugin requires these columns.** A missing one makes the Better Auth schema check fail; I proved this with `session.impersonatedBy`.

- `user.role` string, `required:false`, `input:false`
- `user.banned` boolean, `defaultValue:false`, `input:false`
- `user.banReason` string
- `user.banExpires` **date**, which maps to timestamp
- `session.impersonatedBy` string

### 3.3 Server API (all under `auth.api.*`, HTTP path `/api/auth/admin/...`)

| Server method | Path | Body / query | Auth requirement (source) | Side effects |
|---|---|---|---|---|
| `createUser` | POST `/admin/create-user` | `{ email, password?, name, role?: string\|string[], data?: Record<string,any> }` | **No session and no headers: allowed without any permission check.** Headers present but no session: `401`. With a session, needs `user:create` (+`set-role` if role given, +`ban` if ban fields). [V executed] | Lower-cases the email; rejects duplicates (`USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL`). `internalAdapter.createUser` then `linkAccount({providerId:'credential', accountId:user.id, password: hash})`. **Two separate writes, no transaction.** `data` may set `input:false` additional fields (verified: `mustChangePassword:false`, `nickname`). Default id = 32-char random string. |
| `setUserPassword` | POST `/admin/set-user-password` | `{ userId, newPassword }` | admin session (`adminMiddleware`) + `user:set-password` | Hashes and updates (or creates) the credential account. **Does NOT revoke sessions** [V executed]. Checks min/max length. |
| `setRole` | POST `/admin/set-role` | `{ userId, role }` | admin session + `user:set-role` | With custom `roles`, an unknown role gets `400 YOU_ARE_NOT_ALLOWED_TO_SET_NON_EXISTENT_VALUE` [V]. The TS type of `role` is `'manager' \| 'worker'`. |
| `banUser` | POST `/admin/ban-user` | `{ userId, banReason?, banExpiresIn?: seconds }` | admin session + `user:ban` | Sets `banned=true`, `banReason`, and `banExpires` (null = **permanent**), **then `deleteUserSessions`** [V executed]. Banning yourself gets `400 YOU_CANNOT_BAN_YOURSELF`; a worker gets `403 YOU_ARE_NOT_ALLOWED_TO_BAN_USERS` [V]. |
| `unbanUser` | POST `/admin/unban-user` | `{ userId }` | admin session + `user:ban` | Sets banned=false, banReason/banExpires = null. |
| `revokeUserSessions` | POST `/admin/revoke-user-sessions` | `{ userId }` | admin session + `session:revoke` | Deletes every session of the user [V]. |
| `revokeUserSession` | POST `/admin/revoke-user-session` | `{ sessionToken }` | same | |
| `listUsers` | GET `/admin/list-users` | query `searchValue, searchField: 'email'\|'name', searchOperator: contains\|starts_with\|ends_with, limit, offset, sortBy, sortDirection, filterField, filterValue, filterOperator` | admin session + `user:list` | Returns `{ users, total, limit, offset }`. **It cannot search by nickname or position,** so use our own Drizzle query for FR-209. |
| `adminUpdateUser` | POST `/admin/update-user` | `{ userId, data }` | `user:update` (+ set-role, ban or set-email for those keys) | `banned:true` also deletes sessions. A password key is rejected. |
| `removeUser` | POST `/admin/remove-user` | `{ userId }` | `user:delete` | **Hard delete.** Never use; disabled. |
| `impersonateUser` / `stopImpersonating` | | | | Unused; disabled. |
| `userHasPermission` | POST `/admin/has-permission` | | works without a session if `role` or `userId` is given | Unused. |

Server-side calls that need an admin session take `headers: await headers()`. `adminMiddleware` uses `getAuthoritativeSessionFromCtx`, which bypasses any cookie cache.

### 3.4 What a banned user gets [V executed]

Source: `admin.mjs` `init().options.databaseHooks.session.create.before`.

- If the user is `banned`, the hook throws `APIError.from('FORBIDDEN', { message: bannedUserMessage, code: 'BANNED_USER' })`. The HTTP response is **403** `{"message":"บัญชีนี้ถูกปิดใช้งาน กรุณาติดต่อผู้จัดการ","code":"BANNED_USER"}`.
- If `banExpires` is in the past, the hook auto-unbans and allows the sign-in.
- The hook runs only when there is an endpoint context: `if (!ctx) return`.
- Existing sessions are **not** checked for ban on every request. Deactivation must delete the sessions, which `banUser` does and our service does too.

---

## 4. `user.additionalFields` [V]

Source: `@better-auth/core/dist/db/type.d.mts`.

- `DBFieldType` is one of `"string" | "number" | "boolean" | "date" | "json" | "string[]" | "number[]" | LiteralString[]` (enum).
- `"date"` means a **JS `Date` / timestamp**. The CLI generates `timestamp()`, and the adapter converts strings to `Date`. It is therefore **wrong for `deactivated_on DATE`**, whose value is a calendar date and which BR-04 forbids from being a JS Date.
  - **Recommendation (verified):** don't declare `deactivatedOn` to Better Auth. Keep it as an app-owned column, `date('deactivated_on', { mode: 'string' })`, in the same `user` table.
  - The Drizzle schema check only flags missing columns and NOT-NULL columns without a default. Better Auth's `transformInput`/`transformOutput` iterate only its known fields. So an undeclared nullable column is harmless and **does not appear on `session.user`** (checked at runtime and with a `@ts-expect-error` type probe).
- `input: false`:
  - User-facing endpoints (`signUp`, `updateUser`) either ignore the value (when there is a `defaultValue` on create) or throw `400 FIELD_NOT_ALLOWED` ("… is not allowed to be set").
  - Internal paths (`internalAdapter.createUser` via admin `createUser` `data`) **do** accept it. I verified `mustChangePassword:false` and `nickname`.
- `defaultValue` is applied by Better Auth on create only. It does not become a DB default, so the Drizzle schema also sets `.default(...)` for our direct inserts.
- `required` only affects TS output types and sign-up input validation.
- Inferred types (`typeof auth.$Infer.Session['user']`, checked with `tsc` probes):
  - `mustChangePassword` (`required:true, defaultValue:true, input:false`) is **`boolean`**.
  - `role`, `nickname`, `positionId`, `color` and `banReason` are `string | null | undefined`.
  - `banned` is `boolean | null | undefined`.
  - `banExpires` is `Date | null | undefined`.
  - `session.impersonatedBy` is `string | null | undefined`.
  - **`role` is not narrowed to `'manager'|'worker'`**, so narrow it in `authz.ts`, for example `u.role === 'manager' ? 'manager' : 'worker'`.
- Additional fields **do** appear on `session.user` at runtime. Keys returned by `/get-session`: `name, email, emailVerified, image, createdAt, updatedAt, role, banned, banReason, banExpires, nickname, positionId, mustChangePassword, color, id`.
- A `positionId` declared as `string` maps onto a `uuid` Drizzle column. The schema check does not compare types, and the value passes through as a string.

---

## 5. Change password (FR-105) and sign out everywhere (FR-107) [V executed]

- `auth.api.changePassword({ body: { currentPassword, newPassword, revokeOtherSessions?: boolean }, headers })`, or POST `/change-password`:
  - Uses `sensitiveSessionMiddleware` (authoritative session; no freshness requirement).
  - A wrong current password gets `400 INVALID_PASSWORD` ("Invalid password"). A new password shorter than 8 gets `400 PASSWORD_TOO_SHORT`.
  - `revokeOtherSessions:true` actually **deletes all of the user's sessions, then creates a new one and sets a new cookie**. The response includes `token`. The old token of the current device becomes invalid, and only the cookie in the response is valid.
  - It **does not clear `mustChangePassword`**, so the app must do that.
- `auth.api.revokeSessions({ headers })`, or POST `/revoke-sessions`, deletes **every** session of the user, including the current one. It returns `{ status: true }`. This satisfies FR-107; follow it with a redirect to `/login`.
- `/sign-out` deletes the current session and clears cookies. **In a Next server action**, `await auth.api.signOut({ headers: await headers() }); redirect('/login')` returned `303 Location: /login` with three `Set-Cookie: …=; Max-Age=0` headers (session_token, session_data, dont_remember), and the DB session count went from 1 to 0 [V executed on the Next 16.3.7 standalone server].
- **Recommendation:** implement FR-105 as our own single transaction (§7.3, `changeOwnPassword`). In one transaction it:
  - verifies the current password with `verifyPassword`,
  - updates the hash,
  - sets `must_change_password=false`,
  - deletes the other sessions (`token <> currentToken`),
  - writes the audit row.

  The current session stays valid without re-issuing a cookie, and `getSession` reflects `mustChangePassword=false` immediately. [V executed]
- FR-107: `auth.api.revokeSessions({ headers: await headers() })` then `redirect('/login')`. That is a single write, so no transaction is needed.

---

## 6. FR-106 lockout (5 failures in 15 min per IP + email)

### 6.1 Hook mechanics [V source + executed]

- `hooks.before` and `hooks.after` are single `AuthMiddleware`s created with `createAuthMiddleware(async ctx => …)`.
  - Source: `dist/api/dispatch.mjs`.
  - User hooks run before plugin hooks.
- **The same hooks run for `auth.api.*` calls and for HTTP router calls.** A server-action login (`auth.api.signInEmail`) was locked (`429:LOGIN_LOCKED`). [V executed]
- In the after hook, if the endpoint threw, **`ctx.context.returned` is the `APIError` instance**. Detect failures with `isAPIError(returned) && returned.body?.code === 'INVALID_EMAIL_OR_PASSWORD'`. An after hook that throws an `APIError` replaces the response.
- In the before hook, a thrown `APIError` aborts the request, and after hooks do not run.
- `ctx.body` is already parsed in both hooks (JSON and form-urlencoded). `ctx.path` is `'/sign-in/email'`.
- `throw new APIError('TOO_MANY_REQUESTS', { code: 'LOGIN_LOCKED', message: '<ไทย>' })` returns HTTP 429 with body `{"code":"LOGIN_LOCKED","message":"…"}`. On the server-action path it is thrown as an `APIError` whose `statusCode` is 429 and `body.code` is `LOGIN_LOCKED`.

### 6.2 Client IP [V source + executed]

- `getIP(requestOrHeaders, options)` is exported from `better-auth/api`. It walks `advanced.ipAddress.ipAddressHeaders`, default `['x-forwarded-for']`.
- **Without `trustedProxies`, only a single-value header is trusted.** Multi-hop values such as `a, b` resolve to `null`.
- With `trustedProxies` (IPs or CIDRs), it walks right to left, skipping trusted hops.
- IPv4-mapped IPv6 addresses are unmapped. IPv6 is masked to `/64` (`ipv6Subnet`).
- In dev and test, the fallback is `127.0.0.1`. **In production the result is `null`, which our key stores as `'unknown'`.**

Executed table (`scripts/ip-test.ts`, NODE_ENV=production):

| X-Forwarded-For | no trustedProxies | trustedProxies=['10.0.0.254','172.18.0.0/16'] |
|---|---|---|
| `203.0.113.7` | 203.0.113.7 | 203.0.113.7 |
| `203.0.113.7, 10.0.0.254` | **null** | 203.0.113.7 |
| `198.51.100.1, 203.0.113.7, 172.18.0.5` | null | 203.0.113.7 |
| `::ffff:192.0.2.1` | 192.0.2.1 | 192.0.2.1 |
| `::1` | 0000:…:0000 (/64) | same |

What the Next server sends in `x-forwarded-for` [V executed]:
- **Next 16 (`next start` and standalone `server.js`) adds `x-forwarded-for` = socket address** when the client did not send one (`::1` / `127.0.0.1` observed).
- **If the client sends its own XFF, Next keeps it**, which makes it spoofable. With direct access (no proxy), an attacker can rotate fake single-value XFF headers to bypass the per-IP part of the key.
- Mitigations:
  - Deploy behind Caddy (profile `tls`) or the company proxy. Caddy ≥ 2.5 ignores client XFF unless `trusted_proxies` is configured [L].
  - Optionally add a per-email global cap as defense in depth. Record it as a Decision if added.
  - Set `TRUSTED_PROXIES` when the company proxy **appends** to XFF.

### 6.3 Final design (verified)

Table (in the Drizzle schema):

```ts
export const loginAttempts = pgTable('login_attempts', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  email: text('email').notNull(),                 // lower(trim(email))
  ip: text('ip').notNull(),                       // normalized IP or 'unknown'
  attemptedAt: timestamp('attempted_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index('login_attempts_email_ip_at_idx').on(t.email, t.ip, t.attemptedAt)])
```

The hooks are in §2.1.

Executed results (`scripts/auth-tests.ts` section 4):
- 5 wrong passwords from `10.0.0.9` each returned `401:INVALID_EMAIL_OR_PASSWORD`.
- The 6th attempt returned **429 LOGIN_LOCKED** with the Thai message, even with the correct password.
- The same email from `10.0.0.10` was allowed (200).
- The server-action path was also locked.
- After shifting the attempts back 16 minutes, the correct password was allowed, and a success clears that key's rows.
- An unknown email returns the same 401 code, so there is no enumeration.

Known limits:
- Attempts made while locked are not recorded, because the before hook throws first. The lock therefore lasts 15 minutes from the 5th failure.
- Parallel bursts can overshoot by a few attempts.
- Rows older than 1 day are pruned on each failure.

### 6.4 The built-in `rateLimit` [V source + executed]

- Options:
  - `enabled` defaults to `NODE_ENV==='production'`.
  - `window` defaults to 10 s and `max` to 100.
  - `storage` is `'memory'|'database'|'secondary-storage'`. `'database'` needs a `rateLimit` table (`key`, `count`, `lastRequest` bigint).
  - `customRules` maps a path to a rule, `false`, or `fn(request, currentRule)`.
  - `customStorage.consume(key, rule)` is available.
- Built-in special rules: `/sign-in*`, `/sign-up*`, `/change-password*` and `/change-email*` get **window 10 s, max 3**.
- **The key is `${ip}|${path}`.** Email cannot be part of it, and `customRules` can only change window and max.
- **It runs only in the HTTP router's `onRequest`.** `auth.api.signInEmail` was called 6 times with 200 each; 6 HTTP sign-ins gave `200,200,200,429,429,429`.
- The 429 body is English: `{"message":"Too many requests. Please try again later."}` with an `X-Retry-After` header.
- In production without a resolvable IP, all clients share one `no-trusted-ip|path` bucket and a warning is logged.
- **Recommendation: leave it off** (`AUTH_RATE_LIMIT` unset). Reasons:
  - FR-106 is fully covered by the hooks.
  - Login goes through a server action, so the limiter would never see it.
  - A shared-NAT or proxy IP would cause false 429s on `/get-session` or `/sign-out`.
  - Its message cannot be localized.
  - Record this as a Decision.

---

## 7. Password hashing and direct inserts

### 7.1 Hashing [V]

- Exports: `import { hashPassword, verifyPassword } from 'better-auth/crypto'`. The signatures are:
  - `hashPassword(password: string): Promise<string>`
  - `verifyPassword({ hash, password }): Promise<boolean>`
- Algorithm: **scrypt**, via `node:crypto` under Node (`@better-auth/utils/dist/password.node.mjs`), with `N=16384, r=16, p=1, dkLen=64`. The password is NFKC-normalized.
- Format: `saltHex(16 bytes = 32 hex chars) + ":" + keyHex(64 bytes = 128 hex chars)`, 161 characters in total.
- Timing on this Mac: hash 48 ms, verify 44 ms, 6 parallel hashes 97 ms. Seeds can hash `demo1234` once and reuse the result.
- The SPEC's "hash with Better Auth defaults" is satisfied when we call these same functions. If `emailAndPassword.password.hash` is ever customized, route all hashing through one module.

### 7.2 Is a single-transaction direct insert safe? Yes [V executed]

What I ran: `user` + `account` (with `providerId:'credential'`, `accountId: user.id`, `password: await hashPassword(pw)`) + `work_schedules` + `audit_log`, all inside one `db.transaction`. The results:
- The user signs in through Better Auth.
- `getSession` shows `role` and `mustChangePassword`.
- Ban, reset and change-password flows all behave correctly (§7.3).

Requirements when writing Better Auth tables directly:
- `email = lower(trim(email))`.
- `id` is any unique text; `randomUUID()` works. Better Auth's own ids are 32-char random strings, and ids are never parsed.
- `account.accountId = user.id` and `providerId = 'credential'`. `signInEmail` looks for exactly `providerId==='credential' && accountId===user.id`.
- `createdAt`/`updatedAt` come from DB defaults. Use timestamptz (see §8.2).
- Set `role` explicitly. The admin plugin's user.create hook does not run for direct inserts.
- `emailVerified` does not matter (`requireEmailVerification` is off).
- No secondary storage and no cookie cache, so deleting `session` rows is authoritative.

**Recommendation:**
- **(a) `scripts/bootstrap.ts` and the seeds:** call the shared service `createEmployee(actorId|null, input, tx?)`, which runs one transaction. The alternative, `auth.api.createUser({ body })` without headers, does work: it skips permission checks when there is no session and no headers (verified). But it does 2 writes outside any transaction and cannot include `work_schedules`, so prefer the service.
- **(b) The manager's "create employee" server action:** the same `createEmployee` service after `authz.requireManager`, with the audit row in the same transaction. This follows CLAUDE.md's rule that multi-table writes happen in one transaction.

Deviation note for the plan: SPEC §7.1 says the admin plugin "provides createUser / setUserPassword / setRole / ban / revokeSessions". Record in PROGRESS.md › Decisions that we **keep** the plugin for its schema, its ban enforcement at sign-in and `auth.api` access. Account mutations go through transactional services because the plugin's endpoints are non-transactional and can't enforce FR-206. Also, `setUserPassword` does not revoke sessions, which FR-204 needs.

### 7.3 Services (verified with `scripts/account-services-test.ts`: ALL PASS)

```ts
// src/server/services/accounts.ts  (authz is the caller's job)
import { hashPassword, verifyPassword } from 'better-auth/crypto'
import { and, eq, ne } from 'drizzle-orm'
import { randomUUID } from 'node:crypto'
import { db, type Tx } from '../db/client'
import * as s from '../db/schema'

export class DomainError extends Error {
  constructor(public code: 'LAST_MANAGER' | 'SELF_DEACTIVATE' | 'EMAIL_TAKEN' | 'INVALID_PASSWORD' | 'NOT_FOUND') { super(code) }
}

export async function createEmployee(actorId: string | null, input: {
  email: string; name: string; nickname?: string | null; positionId?: string | null
  role: 'manager' | 'worker'; password: string; mustChangePassword: boolean
  schedule?: { weekday: number; fraction: string }[]
}, tx?: Tx) {
  const run = async (t: Tx) => {
    const email = input.email.trim().toLowerCase()
    if ((await t.select({ id: s.user.id }).from(s.user).where(eq(s.user.email, email))).length) throw new DomainError('EMAIL_TAKEN')
    const id = randomUUID()
    await t.insert(s.user).values({ id, email, name: input.name, nickname: input.nickname ?? null, positionId: input.positionId ?? null,
      role: input.role, mustChangePassword: input.mustChangePassword, emailVerified: true })
    await t.insert(s.account).values({ id: randomUUID(), userId: id, accountId: id, providerId: 'credential', password: await hashPassword(input.password) })
    const schedule = input.schedule ?? [1, 2, 3, 4, 5].map((weekday) => ({ weekday, fraction: '1.00' }))
    if (schedule.length) await t.insert(s.workSchedules).values(schedule.map((r) => ({ userId: id, ...r })))
    await t.insert(s.auditLog).values({ actorId, entity: 'user', entityId: id, action: 'create', summary: `สร้างพนักงาน ${email}` })
    return id
  }
  return tx ? run(tx) : db.transaction(run)
}

export async function resetPassword(actorId: string, userId: string, newPassword: string) {       // FR-204
  const hash = await hashPassword(newPassword)                                                   // hash before opening the tx
  return db.transaction(async (t) => {
    const upd = await t.update(s.account).set({ password: hash, updatedAt: new Date() })
      .where(and(eq(s.account.userId, userId), eq(s.account.providerId, 'credential'))).returning({ id: s.account.id })
    if (!upd.length) throw new DomainError('NOT_FOUND')
    await t.update(s.user).set({ mustChangePassword: true }).where(eq(s.user.id, userId))
    await t.delete(s.session).where(eq(s.session.userId, userId))
    await t.insert(s.auditLog).values({ actorId, entity: 'user', entityId: userId, action: 'update', summary: 'รีเซ็ตรหัสผ่าน' })
  })
}

export async function changeOwnPassword(userId: string, currentSessionToken: string, currentPassword: string, newPassword: string) {
  const [acc] = await db.select().from(s.account).where(and(eq(s.account.userId, userId), eq(s.account.providerId, 'credential')))
  if (!acc?.password || !(await verifyPassword({ hash: acc.password, password: currentPassword }))) throw new DomainError('INVALID_PASSWORD')
  const hash = await hashPassword(newPassword)
  await db.transaction(async (t) => {
    await t.update(s.account).set({ password: hash, updatedAt: new Date() }).where(eq(s.account.id, acc.id))
    await t.update(s.user).set({ mustChangePassword: false }).where(eq(s.user.id, userId))
    await t.delete(s.session).where(and(eq(s.session.userId, userId), ne(s.session.token, currentSessionToken)))
    await t.insert(s.auditLog).values({ actorId: userId, entity: 'user', entityId: userId, action: 'update', summary: 'เปลี่ยนรหัสผ่าน' })
  })
}

export async function deactivate(actorId: string, userId: string, todayBangkok: string) {          // FR-205/206, AC-104
  if (actorId === userId) throw new DomainError('SELF_DEACTIVATE')
  return db.transaction(async (t) => {
    const managers = await t.select({ id: s.user.id }).from(s.user)
      .where(and(eq(s.user.role, 'manager'), eq(s.user.banned, false))).for('update')             // serializes FR-206 checks
    if (managers.some((m) => m.id === userId) && managers.length <= 1) throw new DomainError('LAST_MANAGER')
    const upd = await t.update(s.user).set({ banned: true, banReason: 'deactivated', deactivatedOn: todayBangkok })
      .where(eq(s.user.id, userId)).returning({ id: s.user.id })
    if (!upd.length) throw new DomainError('NOT_FOUND')
    await t.delete(s.session).where(eq(s.session.userId, userId))
    await t.insert(s.auditLog).values({ actorId, entity: 'user', entityId: userId, action: 'update', summary: 'ปิดใช้งาน' })
  })
}

export async function reactivate(actorId: string, userId: string) {
  await db.transaction(async (t) => {
    await t.update(s.user).set({ banned: false, banReason: null, banExpires: null, deactivatedOn: null }).where(eq(s.user.id, userId))
    await t.insert(s.auditLog).values({ actorId, entity: 'user', entityId: userId, action: 'update', summary: 'เปิดใช้งาน' })
  })
}
```

Executed assertions, all PASS:
- A duplicate email with different case is rejected.
- `work_schedules` gets Mon–Fri `'1.00'`.
- AC-201/AC-103: a new worker logs in with the initial password and the session has `mustChangePassword=true`.
- A wrong current password gets `INVALID_PASSWORD`.
- After changing the password:
  - the current session survives and shows `false` immediately;
  - the other sessions are revoked;
  - the old password is rejected and the new one accepted.
- FR-204:
  - the reset drops all sessions;
  - the next login shows `mustChangePassword=true`.
- FR-206:
  - a manager cannot deactivate themselves;
  - the last active manager cannot be deactivated.
- AC-104: after deactivation the session is gone and sign-in returns `BANNED_USER`.
- `deactivated_on` is stored as `'2026-09-30'`.
- FR-205: reactivation lets the user sign in again.

The FR-206 race was checked with psql [V]:
- Transaction A locked `{mA, mB}` with `SELECT … FOR UPDATE`, slept, then deactivated mB.
- Transaction B started meanwhile. After waiting for the lock, it saw only `{mA}`, so it would reject deactivating mA.

A role change (demoting a manager) needs the same `FOR UPDATE` guard.

---

## 8. Drizzle adapter and the Better Auth CLI

### 8.1 Adapter [V]

Source: `@better-auth/drizzle-adapter/dist/index.mjs`.

- Usage: `drizzleAdapter(db, { provider: 'pg', schema })`.
- `schema` must have keys **`user`, `session`, `account`, `verification`**, matching the model names. Passing the whole `import * as schema` module works.
- Other options:
  - `usePlural` (false)
  - `camelCase` (affects CLI generation only)
  - `transaction` (default **false**: Better Auth's multi-step operations are not wrapped in a DB transaction)
  - `debugLogs`
- Field mapping is by **Drizzle property name**, so keep camelCase properties with snake_case column names.
- The adapter uses `db.select().from(table)` and `returning()`. With `advanced.database.joins` false (the default), joins run as separate queries, so no Drizzle `relations()` are needed.
- **Runtime schema check** (`advanced.database.validateSchema`, default true) runs at init and before the first request. It fails on:
  - a missing table,
  - a missing column (any field Better Auth writes, including plugin fields),
  - a NOT-NULL column without a default that Better Auth never writes ("Inserts into … will fail").

  **Column types are not checked.**
- CLI check command [V executed]:
  - `pnpm exec auth check schema --config src/server/auth.ts` prints "Schema check passed against the configured Drizzle schema." and exits **0**.
  - With `session.impersonatedBy` removed and a NOT-NULL extra column added, it printed "Drizzle schema mismatch / Missing columns session.impersonatedBy / Required columns Better Auth never writes user.requiredExtra" and exited **1**.
  - Put it in CI or `pnpm check`. It needs the env for `auth.ts` to import.

### 8.2 CLI generate [V executed]

Command:

```bash
pnpm exec auth generate --config src/server/auth.ts --output /tmp/auth-schema.ts --yes   # auth@1.7.6
```

It printed the ERROR "Drizzle schema mismatch — Missing tables user, session, account, verification" because the tables didn't exist yet, then "🚀 Schema was generated successfully!". The output (for core + admin + additionalFields) was:

```ts
export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").default(false).notNull(),
  image: text("image"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().$onUpdate(() => new Date()).notNull(),
  role: text("role"), banned: boolean("banned").default(false), banReason: text("ban_reason"), banExpires: timestamp("ban_expires"),
  nickname: text("nickname"), positionId: text("position_id"),
  mustChangePassword: boolean("must_change_password").default(true).notNull(),
  color: text("color"), deactivatedOn: timestamp("deactivated_on"),
});
// session: id, expiresAt(timestamp), token unique, createdAt, updatedAt, ipAddress, userAgent, userId → user (cascade), impersonatedBy; index session_userId_idx
// account: id, accountId, providerId, userId → user (cascade), accessToken, refreshToken, idToken, accessTokenExpiresAt, refreshTokenExpiresAt, scope, password, createdAt, updatedAt; index account_userId_idx
// verification: id, identifier, value, expiresAt, createdAt, updatedAt; index verification_identifier_idx
// + relations(user↔session/account)
```

Findings from the generated output:
- Column names are **snake_case** and properties camelCase.
- Ids are text, and table names are the singular `"user"`, `"session"`, `"account"`, `"verification"`.
- **Timestamps are `timestamp` WITHOUT time zone.** On a DB whose `TimeZone` isn't UTC, `defaultNow()` then stores the wall-clock time, which Drizzle reads back as UTC. I observed a 7 h shift: `tsn: "2026-09-30T13:45:38Z"` at 06:45Z with the DB in Asia/Bangkok.
  - **Use `timestamp(..., { withTimezone: true })`** for all Better Auth timestamps. Better Auth works unchanged; the whole test suite ran on timestamptz.
- `role` is nullable without a default, `positionId` is text, and `deactivatedOn` is a timestamp. **Hand-edit these** (see §12).
- The generated `relations` are optional. Better Auth doesn't need them with joins off.

### 8.3 Final Drizzle definitions for the auth tables

These are verified: migrated, run by all tests, and passing `auth check schema`. They are part of the full schema in §12.

---

## 9. Drizzle ORM 0.45.3 and drizzle-kit 0.31.11

### 9.1 1.0 status [V]

- `latest` is 0.45.3 / 0.31.11. 1.0 exists only as `rc` (1.0.0-rc.4, 2026-06-27) and `beta` (1.0.0-beta.22).
- 1.0 changes, checked in the unpacked rc.4 package:
  - relations v2 (`defineRelations`);
  - a new migrations layout, one folder per migration with `migration.sql` and no `meta/_journal.json`.
- The 1.0 migrator **throws** if `meta/_journal.json` exists: "We detected that you have old drizzle-kit migration folders. You must upgrade drizzle-kit and run "drizzle-kit up"".
- **Stay on 0.45/0.31 for the MVP.**

### 9.2 Feature verification (schema in §12; SQL in §9.4) [V executed, applied to PG 17]

| Feature | API (0.45) | Result |
|---|---|---|
| enum | `pgEnum('certainty', ['CONFIRMED','TENTATIVE'])` | `CREATE TYPE "public"."certainty" AS ENUM(...)` |
| check | `check('name', sql\`${t.col} …\`)` in the 3rd-arg array | `CONSTRAINT "…" CHECK ("tbl"."col" …)` |
| generated stored | `date('completed_week', {mode:'string'}).generatedAlwaysAs(sql\`(date_trunc('week', completed_on::timestamp)::date)\`)` | `GENERATED ALWAYS AS (...) STORED`. Writing it gives `428C9 column "completed_week" can only be updated to DEFAULT`. |
| partial index | `index('n').on(a,b).where(sql\`${t.deletedAt} is null\`)` | `CREATE INDEX … WHERE "tbl"."deleted_at" is null` (table-qualified; valid) |
| GIN + opclass | `index('n').using('gin', t.title.op('gin_trgm_ops'))` | `USING gin ("title" gin_trgm_ops)` |
| unique partial | `uniqueIndex('one_charter_per_project').on(t.projectId).where(sql\`${t.isCharter} and ${t.deletedAt} is null\`)` | ok |
| DATE as string | `date('d', { mode: 'string' })` (**string is the default mode for `date()` in 0.45**; still write it explicitly) | round-trips `'YYYY-MM-DD'` under TZ=UTC, Asia/Bangkok and America/Los_Angeles |
| numeric(4,2) | `numeric('person_days', { precision: 4, scale: 2 })` → **string** `'2.50'` (modes: `'string'` default, `'number'`, `'bigint'`) | ok |
| composite PK | `primaryKey({ columns: [t.userId, t.weekday] })` | `CONSTRAINT "work_schedules_user_id_weekday_pk" PRIMARY KEY(...)` |
| self FK | `uuid('parent_id').references((): AnyPgColumn => tasks.id, { onDelete: 'cascade' })` | FK emitted as `ALTER TABLE … ADD CONSTRAINT` after all tables |
| circular FK (pages↔files) | `(): AnyPgColumn => files.id` | fine: all FKs are emitted after all CREATE TABLEs |
| exclusion constraint | **no API in drizzle-orm 0.45** (nothing in `pg-core/*.d.ts`) | goes in a custom migration |
| extensions | no API | goes in a custom migration **before** the first schema migration |
| unique constraint name | `.unique()` → `"<table>_<col>_unique"`; `unique('name').on(...)` for multi-column | |
| `index()` name | optional in 0.45 (`index(name?: string)`); **always pass names** so they match SPEC and are stable | |
| bigserial | `bigserial('id', { mode: 'number' })` → JS number | |
| desc in index | `t.createdAt.desc()` → `"created_at" DESC NULLS LAST` | |

### 9.3 Migration workflow (verified)

```bash
# once, before any table exists (M0):
pnpm exec drizzle-kit generate --custom --name=extensions   # -> drizzle/0000_extensions.sql (empty) + journal + snapshot(=previous: 0 tables)
#   fill with: CREATE EXTENSION IF NOT EXISTS pgcrypto; pg_trgm; btree_gist  (separate with --> statement-breakpoint)
# every schema change:
pnpm exec drizzle-kit generate --name=<milestone_topic>     # e.g. 0001_auth_positions (M1)
# things drizzle can't express (EXCLUDE, triggers, functions), AFTER the tables exist:
pnpm exec drizzle-kit generate --custom --name=time_off_exclusion   # M5
pnpm exec drizzle-kit generate --custom --name=week_day_trigger     # M6
pnpm exec drizzle-kit check                                  # "Everything's fine 🐶🔥" — detect journal/snapshot collisions
```

- **`--custom` does NOT swallow pending schema diffs.** The custom snapshot copies the previous one: 0 tables in `0000_snapshot.json`. The next normal `generate` still emitted every table.
- A second `generate` with no changes says "No schema changes, nothing to migrate 😴". It is idempotent, with no spurious diffs from checks or generated columns.
- A later change to `time_off` (adding a column) produced only `ALTER TABLE … ADD COLUMN`. **drizzle-kit never touches the custom EXCLUDE or trigger**, because generate diffs snapshots, not the live DB.
- **Never use `drizzle-kit push`.** It introspects the DB and would fight the custom objects [L].
- CLAUDE.md mentions `drizzle/9999_triggers.sql`. A hand-named file is **not** run unless it is in `meta/_journal.json`, so use `generate --custom` instead.

Migrator semantics, from `drizzle-orm/pg-core/dialect.js` `migrate()` [V source + executed]:
- It creates `drizzle.__drizzle_migrations(id serial, hash text, created_at bigint)` in schema **`drizzle`**.
- It reads only the **last** applied row (`order by created_at desc limit 1`).
- It runs every journal entry whose `when` (folderMillis) is greater than that row's `created_at`, **all in ONE transaction**.
- **The hash is not compared. Editing an applied file does nothing, and a migration whose `when` is older than the last applied one is silently SKIPPED.** Multi-agent rule: only one agent (the integrator) runs `drizzle-kit generate`, sequentially on the main branch, never in parallel worktrees. Never edit applied migrations.
- The SQL is split on `--> statement-breakpoint`. With postgres.js, a multi-statement chunk without breakpoints also ran fine, but keep the breakpoints.
- `CREATE EXTENSION` inside the migration transaction works (verified).

Programmatic migrator for `pnpm db:migrate` and the docker `migrate` service [V executed; idempotent re-run, 93 ms then 18 ms]:

```ts
// scripts/migrate.ts
import { drizzle } from 'drizzle-orm/postgres-js'
import { migrate } from 'drizzle-orm/postgres-js/migrator'
import postgres from 'postgres'
const url = process.env.DATABASE_URL
if (!url) throw new Error('DATABASE_URL is required')
const sql = postgres(url, { max: 1, onnotice: () => {} })
try { await migrate(drizzle(sql), { migrationsFolder: './drizzle' }) } finally { await sql.end() }
```

`drizzle-kit migrate` (CLI) works too and produced the same result on a second DB.

`.env` loading [V executed]:
- **drizzle-kit 0.31 auto-loads `.env`** from the cwd (bundled dotenv): the config saw DATABASE_URL SET with `.env` present and UNSET without it.
- **`tsx` does not.** Use `tsx --env-file=.env scripts/x.ts` (verified), or `--env-file-if-exists=.env`, which Node supports since 22.9 [L for 22.x].

`drizzle.config.ts` (verified shape):

```ts
import { defineConfig } from 'drizzle-kit'
export default defineConfig({
  dialect: 'postgresql',
  schema: './src/server/db/schema.ts',
  out: './drizzle',
  dbCredentials: { url: process.env.DATABASE_URL! },
  strict: true,
  verbose: true,
  // migrations: { table: '__drizzle_migrations', schema: 'drizzle' }   // defaults
})
```

### 9.4 Custom migration contents (verified applied)

`drizzle/0000_extensions.sql`:

```sql
-- Custom SQL migration: extensions must exist before gin_trgm_ops / EXCLUDE USING gist
CREATE EXTENSION IF NOT EXISTS pgcrypto;--> statement-breakpoint
CREATE EXTENSION IF NOT EXISTS pg_trgm;--> statement-breakpoint
CREATE EXTENSION IF NOT EXISTS btree_gist;
```

On PG ≥ 13, `gen_random_uuid()` is a core function and works without pgcrypto (verified: `works_without_pgcrypto = t`). Keeping pgcrypto is harmless.

`drizzle/00NN_constraints_triggers.sql` (for M5/M6 split it: EXCLUDE with time_off, trigger with allocations):

```sql
ALTER TABLE "time_off" ADD CONSTRAINT "time_off_no_overlap"
  EXCLUDE USING gist ("user_id" WITH =, daterange("start_date", "end_date", '[]') WITH &&)
  WHERE ("deleted_at" IS NULL);
--> statement-breakpoint
CREATE OR REPLACE FUNCTION enforce_week_day_exclusivity() RETURNS trigger AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM allocations
    WHERE task_assignment_id = NEW.task_assignment_id AND week_start = NEW.week_start
      AND granularity <> NEW.granularity AND id <> NEW.id
  ) THEN
    RAISE EXCEPTION 'WEEK_DAY_CONFLICT: assignment % week %', NEW.task_assignment_id, NEW.week_start USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER trg_week_day_exclusivity BEFORE INSERT OR UPDATE ON allocations
  FOR EACH ROW EXECUTE FUNCTION enforce_week_day_exclusivity();
```

---

## 10. postgres.js 3.4.9

### 10.1 Pool and client [V]

- Defaults (`src/index.js` / `types/index.d.ts`): `max` 10, `idle_timeout` null (never), `connect_timeout` 30 s, `max_lifetime` random 30–60 min, `prepare` true.
- Connections open lazily, so importing the client does not connect.
- Recommended client:

```ts
// src/server/db/client.ts
import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import * as schema from './schema'
// postgres.js connects lazily -> importing during `next build` must not throw when DATABASE_URL is absent
const url = process.env.DATABASE_URL ?? 'postgres://invalid:invalid@127.0.0.1:1/unset'
const g = globalThis as unknown as { __pgClient?: ReturnType<typeof postgres> }
export const pg = g.__pgClient ?? postgres(url, { max: Number(process.env.DB_POOL_MAX ?? 10), idle_timeout: 20, connect_timeout: 10, onnotice: () => {} })
if (process.env.NODE_ENV !== 'production') g.__pgClient = pg      // survive dev HMR
export const db = drizzle(pg, { schema })
export type DB = typeof db
export type Tx = Parameters<Parameters<DB['transaction']>[0]>[0]
```

- Scripts and the migrator: `max: 1`, and always `await pg.end()`.
- `onnotice: () => {}` silences NOTICE spam, such as `IF NOT EXISTS` notices.

### 10.2 Type mapping (executed: `scripts/pgjs-types.ts`)

| SQL type | raw postgres.js client (not wrapped) | same client after `drizzle(client)` / via Drizzle |
|---|---|---|
| `date` | **JS `Date` at UTC midnight** (`2026-10-05T00:00:00.000Z`, whatever the process TZ) | **string `'2026-10-05'`**. `drizzle()` *mutates the client's parsers* for OIDs 1082/1114/1184/1083/1186/… into pass-through strings, so raw `pg\`...\`` queries on the same client also return strings. |
| `numeric(4,2)` | string `'2.50'` | string (`mode:'number'` gives a number) |
| `sum(numeric)` | string `'2.00'` | string |
| `bigint`/`count(*)` | string `'2'` | string with `db.execute`. Drizzle's `count()` helper or `sql<number>\`count(*)\`.mapWith(Number)` gives a number. `bigserial({mode:'number'})` gives a number. |
| `timestamptz` | `Date` | Drizzle column gives `Date` (correct instant). `db.execute` gives string `'2026-09-30 13:45:22.757159+07'`. |
| `timestamp` (no tz) + `defaultNow()` | | **wrong by the DB TimeZone offset** when that isn't UTC (see §8.2), so avoid it |

Results under `TZ=UTC`, `Asia/Bangkok` and `America/Los_Angeles`:
- `date(mode:'string')` insert, returning, select and `eq(col,'2026-10-05')` were identical.
- By contrast, `date(mode:'date')` with the Bangkok-midnight `Date` `2026-10-05T00:00+07:00` **stored `'2026-10-04'`**. This proves BR-04 (never use JS `Date` for plan dates).

Converting BR-02 values to cd with `Math.round(parseFloat(v)*100)` gave 2.50→250, 0.29→29, 1.15→115, 4.35→435, 0.07→7 and 99.99→9999. All correct.

Plain string params work for `date` comparisons (postgres.js sends untyped params, and PG infers the type), both in `db.execute(sql\`… >= ${'2026-09-28'}\`)` and in builder `gte(col, '2026-09-28')`.

### 10.3 Error shape [V executed: `scripts/pg-errors.ts`]

- **Drizzle 0.45 wraps driver errors in `DrizzleQueryError`**, importable from `'drizzle-orm/errors'`. Its `message` is `"Failed query: <sql>\nparams: …"`, and **`cause` is the postgres.js `PostgresError`**, which carries `code`, `constraint_name`, `table_name`, `detail` and `message`.
- **The error mapper must read `e.cause?.code ?? e.code`.**
- Avoid logging `DrizzleQueryError.message` for auth tables: the params include password hashes.

| Case | `cause.code` | `cause.constraint_name` / message |
|---|---|---|
| overlapping time_off | `23P01` | `time_off_no_overlap` · detail `Key (user_id, daterange(...))=(…, [2026-10-06,2026-10-08)) conflicts with existing key (…, [2026-10-05,2026-10-07))` |
| duplicate email | `23505` | `user_email_unique` |
| FK violation | `23503` | `user_position_id_positions_id_fk` |
| check violation | `23514` | `time_off_half_check` |
| BR-20b trigger (inside `db.transaction`) | `P0001` | message `WEEK_DAY_CONFLICT: assignment <uuid> week 2026-10-05` (no constraint name) |

---

## 11. SPEC §6.2/§6.3/§6.5 DDL validated on real PostgreSQL 17.11

### 11.1 Commands

```bash
docker run -d --name r2authdb-v2-pg17-a64f -e POSTGRES_USER=planner -e POSTGRES_PASSWORD=planner -e POSTGRES_DB=planner -e TZ=Asia/Bangkok -p 127.0.0.1:55433:5432 postgres:17
awk 'NR>=601 && NR<=855' SPEC.md > 62_ddl.sql     # verbatim §6.2
awk 'NR>=861 && NR<=878' SPEC.md > 63_trigger.sql # verbatim §6.3
printf 'create table "user" (id text primary key);\n' > 00_stub_user.sql
cat 00_stub_user.sql 62_ddl.sql 63_trigger.sql | docker exec -i … psql -U planner -d spec_ddl2 -v ON_ERROR_STOP=1 -q -1
# -> "ALL OK in single transaction (-1) with ON_ERROR_STOP=1"; 18 tables, 40 indexes; extensions btree_gist 1.7, pg_trgm 1.6, pgcrypto 1.3
```

**Every CREATE EXTENSION, TYPE, TABLE, INDEX and ALTER statement and the trigger succeeded with no changes.** The exclusion constraint was named `time_off_user_id_daterange_excl` automatically.

### 11.2 Behaviour checks (`sql/90_behavior.sql`, `sql/65_run.sql`) — exact results

| # | Check | Result |
|---|---|---|
| T1 | overlapping time_off for the same user (10-05..06, then 10-06..08) | **ERROR 23P01** `conflicting key value violates exclusion constraint "time_off_user_id_daterange_excl"` ✓ |
| T1b | adjacent range 10-07..08 (`'[]'` bounds) | inserted ✓ |
| T1c | other user, same dates | inserted ✓ |
| T2 | soft-delete (deleted_at set), then overlapping insert | inserted ✓ (the `WHERE deleted_at IS NULL` predicate works) |
| **T2b** | **restoring the soft-deleted row (deleted_at = null) after an overlapping row was added** | **ERROR 23P01**, so undo/restore of time_off can fail. The restore action must catch it. |
| **T3** | **AM half-day and PM half-day on the same date (two rows)** | **second row rejected with 23P01** (both are `[d,d]`). This is a product decision: record "record a full day instead" or change the constraint. |
| T3b | `half='AM'` with start ≠ end | ERROR 23514 `time_off_check1` ✓ |
| T3c | end < start | ERROR 23514 `time_off_check` ✓ |
| T4 | generated `completed_week` | Wed 2026-10-07 → **2026-10-05**; Sun 2026-10-11 → 2026-10-05; Mon 2026-10-05 → 2026-10-05; Fri 2027-01-01 → **2026-12-28**; NULL → NULL; isodow is always 1 ✓ |
| T4b/c | writing the generated column / updating completed_on | `428C9 column "completed_week" can only be updated to DEFAULT`; recomputed (10-15 → 10-12) ✓ |
| T5 | `date_trunc('week', d::timestamp)::date` for 2026-09-28..10-04 | all → **2026-09-28** (ISO Monday; Sunday belongs to the previous Monday) ✓ |
| T6a | WEEK on Monday | ok |
| T6b | week_start on a Tuesday | 23514 `allocations_week_start_check` ✓ |
| T6c | WEEK with period_start ≠ week_start | 23514 `allocations_check` ✓ |
| T6d | WEEK 7.25 | 23514 ✓ |
| T6e | DAY on the next Monday (outside the week) | 23514 ✓ |
| T6f | DAY 1.25 | 23514 ✓ |
| T6g | DAY on the Sunday (week_start+6) | ok ✓ |
| T6h | person_days 0 | 23514 `allocations_person_days_check` ✓. `0.125` is **silently rounded to 0.13** (no error). `100` gives 22003 `numeric field overflow` ✓ |
| T7 | DAY in a week that already has WEEK, and the reverse | **P0001 `WEEK_DAY_CONFLICT: assignment <id> week 2026-10-05`** ✓ |
| T7c | BR-22 DELETE then INSERT in one transaction | ok ✓ |
| T7d | INSERT before DELETE in one transaction | P0001 (order matters) ✓ |
| T7e | UPDATE one DAY row to WEEK while other DAY rows exist | P0001 ✓ |
| **T9** | **race: tx A inserts WEEK (sleeps 2 s before commit); tx B inserts DAY for the same assignment/week** | **both commit; the week holds both WEEK and DAY, so BR-20b is violated**. The BEFORE trigger cannot see uncommitted rows under READ COMMITTED. |
| T9-fix | both transactions first run `UPDATE task_assignments SET version = version + 1 WHERE id = $1 [AND version = $base]` | B blocks on A's row lock, then its trigger sees A's committed row and raises **P0001** (or gets a 0-row version mismatch, which is VERSION_CONFLICT) ✓ |
| Q | §6.5 query, PREPAREd with `(date,date)` and with untyped params, `('2026-09-28','2026-11-02')` | `u1 2026-10-05 total 3.75 committed 2.50; u1 2026-10-12 total 1.38 committed 0.63` ✓. The plan uses `allocations_task_assignment_id_week_start_idx` with the week range in the Index Cond. |
| Q-completed | completed_on = Wed 10-07 | week 10-12 rows from that task are excluded; the remaining week showed **`committed` = NULL** (the FILTER sum over the empty set is NULL) |

### 11.3 Problems and corrections for the plan

1. **`user` columns the admin plugin requires but the SPEC comment omits.** Add `ban_expires timestamptz` on `"user"` and **`impersonated_by text` on `"session"`**. Without them, Better Auth's schema check fails and every auth request throws `SchemaMismatchError` [V].
   - Corrected `"user"` column list: `role text not null default 'worker'`, `banned boolean not null default false`, `ban_reason text`, `ban_expires timestamptz`, `nickname text`, `position_id uuid references positions(id)`, `must_change_password boolean not null default true`, `color text`, `deactivated_on date`.
2. **§6.4 promises trigram indexes the §6.2 DDL never creates.** Add them:
   ```sql
   create index projects_name_trgm on projects using gin (name gin_trgm_ops);
   create index clients_name_trgm  on clients  using gin (name gin_trgm_ops);
   create index user_name_trgm     on "user"   using gin (name gin_trgm_ops);
   create index user_nickname_trgm on "user"   using gin (nickname gin_trgm_ops);
   ```
   Thai check [V]: `'ย้ายข้อมูลลูกค้า' ilike '%ลูกค้า%'` is true and used a Bitmap Index Scan on the GIN trgm index over 20 k rows. `similarity(...)` = 0.2778. `'%คู่มือ%'` and `'%ค้า%'` also matched. DB collation/ctype was `en_US.utf8`.
3. **BR-20b is not race-safe with the trigger alone** (T9). Rule: **every transaction that writes `allocations` must first lock the assignment row.** This covers `saveAllocations`, BR-22/23/24/25, restore, moving the assignment to a child task (BR-31) and deleting assignments. Do it with the `version` bump (`UPDATE … SET version = version + 1 WHERE id = $1 AND version = $2 RETURNING version`), which also provides VERSION_CONFLICT, or with `SELECT … FOR UPDATE`. The trigger stays as the backstop.
4. **Restoring time_off can violate the exclusion** (T2b). `restoreTimeOff(batch)` must catch `23P01` and return a Thai message, for example "กู้คืนไม่ได้ เพราะทับกับวันลาที่บันทึกภายหลัง". FR-905 needs the name of the conflicting entry, but the DB error only gives key ranges. Pre-query overlapping rows (`daterange(start,end,'[]') && daterange($1,$2,'[]') AND deleted_at IS NULL`) for the message, and keep the constraint as the race-proof backstop (on 23P01, re-query).
5. **AM + PM on the same date is rejected** (T3). Record a Decision: the user must record a full day instead. If AM+PM must be allowed, the constraint needs a `half`-aware range, which is out of scope for the MVP.
6. **§6.5 `committed` is NULL** when no row is CONFIRMED. Use `coalesce(sum(...) filter (...), 0)`; verified it returns `"0"`.
7. **`numeric(4,2)` silently rounds** extra decimals (0.125 → 0.13). The app always writes `cd/100`, which has at most 2 decimals, so this is harmless. Don't rely on the DB to reject 3-decimal input.
8. **Better Auth timestamps.** Use `timestamptz` rather than the CLI's `timestamp` (§8.2).
9. `pgcrypto` isn't needed for `gen_random_uuid()` on PG 17. It is harmless to keep.
10. The SPEC's unnamed indexes (`create index on …`) must be **explicitly named** in Drizzle. §12 uses stable names.
11. `"user"` is a reserved word. Drizzle always quotes it; raw SQL must write `"user"`.
12. DB `TimeZone`: the compose `db` service gets no `TZ`, so it runs in `Etc/UTC`. With timestamptz everywhere and `date` for calendar values this no longer matters. I ran the DB in Asia/Bangkok, and everything verified still passed.

---

## 12. Full verified Drizzle schema (0.45.3)

It generates cleanly, migrates on PG 17.11 and passes `auth check schema`. The runtime tests used it.

```ts
import { sql } from 'drizzle-orm'
import { type AnyPgColumn, bigserial, boolean, check, date, index, integer, jsonb, numeric, pgEnum, pgTable, primaryKey,
  smallint, text, timestamp, unique, uniqueIndex, uuid } from 'drizzle-orm/pg-core'

export const certainty = pgEnum('certainty', ['CONFIRMED', 'TENTATIVE'])
export const granularity = pgEnum('granularity', ['WEEK', 'DAY'])
export const projectRole = pgEnum('project_role', ['LEAD', 'MEMBER'])
export const pageSpace = pgEnum('page_space', ['WORKSPACE', 'PROJECT'])
export const halfDay = pgEnum('half_day', ['AM', 'PM'])

const tstz = (name: string) => timestamp(name, { withTimezone: true })
const createdAt = () => tstz('created_at').notNull().defaultNow()
const updatedAt = () => tstz('updated_at').notNull().defaultNow()

// ── Better Auth (shape from `auth generate`, hand-edited: timestamptz, role default, uuid FK, app-only DATE)
export const user = pgTable('user', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  emailVerified: boolean('email_verified').notNull().default(false),
  image: text('image'),
  createdAt: createdAt(),
  updatedAt: updatedAt().$onUpdate(() => new Date()),
  role: text('role').notNull().default('worker'),
  banned: boolean('banned').notNull().default(false),
  banReason: text('ban_reason'),
  banExpires: tstz('ban_expires'),
  nickname: text('nickname'),
  positionId: uuid('position_id').references((): AnyPgColumn => positions.id),
  mustChangePassword: boolean('must_change_password').notNull().default(true),
  color: text('color'),
  deactivatedOn: date('deactivated_on', { mode: 'string' }),         // NOT declared to Better Auth
}, (t) => [
  index('user_name_trgm').using('gin', t.name.op('gin_trgm_ops')),
  index('user_nickname_trgm').using('gin', t.nickname.op('gin_trgm_ops')),
])

export const session = pgTable('session', {
  id: text('id').primaryKey(),
  expiresAt: tstz('expires_at').notNull(),
  token: text('token').notNull().unique(),
  createdAt: createdAt(),
  updatedAt: updatedAt().$onUpdate(() => new Date()),
  ipAddress: text('ip_address'),
  userAgent: text('user_agent'),
  userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
  impersonatedBy: text('impersonated_by'),
}, (t) => [index('session_user_id_idx').on(t.userId)])

export const account = pgTable('account', {
  id: text('id').primaryKey(),
  accountId: text('account_id').notNull(),
  providerId: text('provider_id').notNull(),
  userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
  accessToken: text('access_token'), refreshToken: text('refresh_token'), idToken: text('id_token'),
  accessTokenExpiresAt: tstz('access_token_expires_at'), refreshTokenExpiresAt: tstz('refresh_token_expires_at'),
  scope: text('scope'), password: text('password'),
  createdAt: createdAt(), updatedAt: updatedAt().$onUpdate(() => new Date()),
}, (t) => [index('account_user_id_idx').on(t.userId)])

export const verification = pgTable('verification', {
  id: text('id').primaryKey(), identifier: text('identifier').notNull(), value: text('value').notNull(),
  expiresAt: tstz('expires_at').notNull(), createdAt: createdAt(), updatedAt: updatedAt().$onUpdate(() => new Date()),
}, (t) => [index('verification_identifier_idx').on(t.identifier)])

export const loginAttempts = pgTable('login_attempts', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  email: text('email').notNull(), ip: text('ip').notNull(),
  attemptedAt: tstz('attempted_at').notNull().defaultNow(),
}, (t) => [index('login_attempts_email_ip_at_idx').on(t.email, t.ip, t.attemptedAt)])

export const positions = pgTable('positions', {
  id: uuid('id').primaryKey().defaultRandom(), name: text('name').notNull().unique(),
  position: text('position').notNull(), createdAt: createdAt(),
})

export const userPreferences = pgTable('user_preferences', {
  userId: text('user_id').primaryKey().references(() => user.id, { onDelete: 'cascade' }),
  data: jsonb('data').notNull().default({}),
})

export const workSchedules = pgTable('work_schedules', {
  userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
  weekday: smallint('weekday').notNull(),
  fraction: numeric('fraction', { precision: 3, scale: 2 }).notNull(),
}, (t) => [
  primaryKey({ columns: [t.userId, t.weekday] }),
  check('work_schedules_weekday_check', sql`${t.weekday} between 1 and 7`),
  check('work_schedules_fraction_check', sql`${t.fraction} > 0 and ${t.fraction} <= 1`),
])

export const holidays = pgTable('holidays', {
  id: uuid('id').primaryKey().defaultRandom(), date: date('date', { mode: 'string' }).notNull().unique(), name: text('name').notNull(),
})

export const leaveTypes = pgTable('leave_types', {
  id: uuid('id').primaryKey().defaultRandom(), name: text('name').notNull().unique(),
  color: text('color').notNull().default('#94A3B8'), position: text('position').notNull(), archivedAt: tstz('archived_at'),
})

export const timeOff = pgTable('time_off', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
  leaveTypeId: uuid('leave_type_id').notNull().references(() => leaveTypes.id),
  startDate: date('start_date', { mode: 'string' }).notNull(),
  endDate: date('end_date', { mode: 'string' }).notNull(),
  half: halfDay('half'), note: text('note'),
  createdBy: text('created_by').notNull().references(() => user.id),
  createdAt: createdAt(), updatedAt: updatedAt(), deletedAt: tstz('deleted_at'), deletedBatch: uuid('deleted_batch'),
}, (t) => [
  check('time_off_range_check', sql`${t.endDate} >= ${t.startDate}`),
  check('time_off_half_check', sql`${t.half} is null or ${t.startDate} = ${t.endDate}`),
  index('time_off_user_id_start_date_end_date_idx').on(t.userId, t.startDate, t.endDate).where(sql`${t.deletedAt} is null`),
  // EXCLUDE constraint: custom migration
])

export const clients = pgTable('clients', {
  id: uuid('id').primaryKey().defaultRandom(), name: text('name').notNull().unique(), code: text('code'),
  color: text('color'), note: text('note'), archivedAt: tstz('archived_at'), createdAt: createdAt(), updatedAt: updatedAt(),
}, (t) => [index('clients_name_trgm').using('gin', t.name.op('gin_trgm_ops'))])

export const projects = pgTable('projects', {
  id: uuid('id').primaryKey().defaultRandom(),
  clientId: uuid('client_id').references(() => clients.id, { onDelete: 'set null' }),
  name: text('name').notNull(), code: text('code'), color: text('color').notNull().default('#2F5597'),
  certainty: certainty('certainty').notNull().default('CONFIRMED'), certaintyNote: text('certainty_note'),
  archivedAt: tstz('archived_at'), deletedAt: tstz('deleted_at'),
  createdBy: text('created_by').notNull().references(() => user.id), createdAt: createdAt(), updatedAt: updatedAt(),
}, (t) => [index('projects_name_trgm').using('gin', t.name.op('gin_trgm_ops'))])

export const projectMembers = pgTable('project_members', {
  projectId: uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
  role: projectRole('role').notNull().default('MEMBER'),
  addedBy: text('added_by').references(() => user.id), addedAt: tstz('added_at').notNull().defaultNow(),
}, (t) => [primaryKey({ columns: [t.projectId, t.userId] }), index('project_members_user_id_idx').on(t.userId)])

export const pages = pgTable('pages', {
  id: uuid('id').primaryKey().defaultRandom(),
  space: pageSpace('space').notNull(),
  projectId: uuid('project_id').references(() => projects.id, { onDelete: 'cascade' }),
  parentId: uuid('parent_id').references((): AnyPgColumn => pages.id, { onDelete: 'cascade' }),
  depth: smallint('depth').notNull().default(0),
  title: text('title').notNull().default(''), icon: text('icon'),
  coverFileId: uuid('cover_file_id').references((): AnyPgColumn => files.id, { onDelete: 'set null' }),
  content: jsonb('content').notNull().default([]), contentText: text('content_text').notNull().default(''),
  isCharter: boolean('is_charter').notNull().default(false), locked: boolean('locked').notNull().default(false),
  version: integer('version').notNull().default(1), position: text('position').notNull(),
  createdBy: text('created_by').notNull().references(() => user.id), updatedBy: text('updated_by').notNull().references(() => user.id),
  createdAt: createdAt(), updatedAt: updatedAt(), deletedAt: tstz('deleted_at'), deletedBatch: uuid('deleted_batch'),
}, (t) => [
  check('pages_depth_check', sql`${t.depth} between 0 and 9`),
  check('pages_space_project_check', sql`(${t.space} = 'PROJECT') = (${t.projectId} is not null)`),
  index('pages_tree_idx').on(t.space, t.projectId, t.parentId, t.position).where(sql`${t.deletedAt} is null`),
  uniqueIndex('one_charter_per_project').on(t.projectId).where(sql`${t.isCharter} and ${t.deletedAt} is null`),
  index('pages_title_trgm').using('gin', t.title.op('gin_trgm_ops')),
  index('pages_content_trgm').using('gin', t.contentText.op('gin_trgm_ops')),
])

export const pageLocks = pgTable('page_locks', {
  pageId: uuid('page_id').primaryKey().references(() => pages.id, { onDelete: 'cascade' }),
  userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
  expiresAt: tstz('expires_at').notNull(),
})

export const files = pgTable('files', {
  id: uuid('id').primaryKey().defaultRandom(), storageKey: text('storage_key').notNull().unique(),
  originalName: text('original_name').notNull(), mime: text('mime').notNull(), sizeBytes: integer('size_bytes').notNull(),
  kind: text('kind', { enum: ['IMAGE', 'ATTACHMENT'] }).notNull(),
  pageId: uuid('page_id').references((): AnyPgColumn => pages.id, { onDelete: 'set null' }),
  projectId: uuid('project_id').references(() => projects.id, { onDelete: 'cascade' }),
  uploadedBy: text('uploaded_by').notNull().references(() => user.id), createdAt: createdAt(),
}, (t) => [check('files_kind_check', sql`${t.kind} in ('IMAGE','ATTACHMENT')`)])

export const milestones = pgTable('milestones', {
  id: uuid('id').primaryKey().defaultRandom(),
  projectId: uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  name: text('name').notNull(), date: date('date', { mode: 'string' }).notNull(), description: text('description'),
  completedOn: date('completed_on', { mode: 'string' }),
  createdBy: text('created_by').notNull().references(() => user.id), createdAt: createdAt(), updatedAt: updatedAt(),
  deletedAt: tstz('deleted_at'), deletedBatch: uuid('deleted_batch'),
}, (t) => [index('milestones_project_id_date_idx').on(t.projectId, t.date).where(sql`${t.deletedAt} is null`)])

export const tasks = pgTable('tasks', {
  id: uuid('id').primaryKey().defaultRandom(),
  projectId: uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  parentId: uuid('parent_id').references((): AnyPgColumn => tasks.id, { onDelete: 'cascade' }),
  depth: smallint('depth').notNull().default(0), name: text('name').notNull(), notes: text('notes'),
  startDate: date('start_date', { mode: 'string' }), dueDate: date('due_date', { mode: 'string' }),
  certaintyOverride: certainty('certainty_override'),
  milestoneId: uuid('milestone_id').references(() => milestones.id, { onDelete: 'set null' }),
  completedOn: date('completed_on', { mode: 'string' }),
  completedWeek: date('completed_week', { mode: 'string' }).generatedAlwaysAs(sql`(date_trunc('week', completed_on::timestamp)::date)`),
  completedBy: text('completed_by').references(() => user.id), position: text('position').notNull(),
  createdBy: text('created_by').notNull().references(() => user.id), createdAt: createdAt(), updatedAt: updatedAt(),
  deletedAt: tstz('deleted_at'), deletedBatch: uuid('deleted_batch'),
}, (t) => [
  check('tasks_depth_check', sql`${t.depth} between 0 and 2`),
  check('tasks_name_check', sql`length(trim(${t.name})) > 0`),
  check('tasks_dates_check', sql`${t.dueDate} is null or ${t.startDate} is null or ${t.dueDate} >= ${t.startDate}`),
  index('tasks_tree_idx').on(t.projectId, t.parentId, t.position).where(sql`${t.deletedAt} is null`),
  index('tasks_name_trgm').using('gin', t.name.op('gin_trgm_ops')),
])

export const taskAssignments = pgTable('task_assignments', {
  id: uuid('id').primaryKey().defaultRandom(),
  taskId: uuid('task_id').notNull().references(() => tasks.id, { onDelete: 'cascade' }),
  userId: text('user_id').notNull().references(() => user.id),
  version: integer('version').notNull().default(1), createdAt: createdAt(),
  deletedAt: tstz('deleted_at'), deletedBatch: uuid('deleted_batch'),
}, (t) => [
  uniqueIndex('task_assignments_active').on(t.taskId, t.userId).where(sql`${t.deletedAt} is null`),
  index('task_assignments_user_id_idx').on(t.userId).where(sql`${t.deletedAt} is null`),
])

export const allocations = pgTable('allocations', {
  id: uuid('id').primaryKey().defaultRandom(),
  taskAssignmentId: uuid('task_assignment_id').notNull().references(() => taskAssignments.id, { onDelete: 'cascade' }),
  granularity: granularity('granularity').notNull(),
  periodStart: date('period_start', { mode: 'string' }).notNull(),
  weekStart: date('week_start', { mode: 'string' }).notNull(),
  personDays: numeric('person_days', { precision: 4, scale: 2 }).notNull(),
  updatedAt: updatedAt(),
}, (t) => [
  unique('allocations_ta_granularity_period_key').on(t.taskAssignmentId, t.granularity, t.periodStart),
  check('allocations_person_days_check', sql`${t.personDays} > 0`),
  check('allocations_week_start_check', sql`extract(isodow from ${t.weekStart}) = 1`),
  check('allocations_period_check', sql`(${t.granularity} = 'WEEK' and ${t.periodStart} = ${t.weekStart} and ${t.personDays} <= 7) or
    (${t.granularity} = 'DAY' and ${t.periodStart} >= ${t.weekStart} and ${t.periodStart} < ${t.weekStart} + 7 and ${t.personDays} <= 1)`),
  index('allocations_week_start_ta_idx').on(t.weekStart, t.taskAssignmentId),
  index('allocations_ta_week_start_idx').on(t.taskAssignmentId, t.weekStart),
])

export const auditLog = pgTable('audit_log', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  actorId: text('actor_id').references(() => user.id),
  entity: text('entity').notNull(), entityId: text('entity_id').notNull(), action: text('action').notNull(),
  projectId: uuid('project_id'), summary: text('summary'), before: jsonb('before'), after: jsonb('after'),
  createdAt: createdAt(),
}, (t) => [
  index('audit_log_project_id_created_at_idx').on(t.projectId, t.createdAt.desc()),
  index('audit_log_entity_idx').on(t.entity, t.entityId),
])
```

Incremental milestones should add these tables when their milestone needs them:
- M1: `user`, `session`, `account`, `verification`, `login_attempts`, `positions`, `work_schedules`, `user_preferences`, `audit_log`
- M2: `clients`, `projects`, `project_members`
- M3: `tasks`, `task_assignments`
- M4: `pages`, `page_locks`, `files`
- M5: `holidays`, `leave_types`, `time_off`, plus the exclusion custom migration
- M6: `allocations`, plus the trigger custom migration
- M8: `milestones`, together with the `tasks.milestone_id` FK. Either create `milestones` in M3 so the FK exists from the start, or add the column in M8.

The §6.5 query works both as raw SQL (`db.execute(sql\`…\`)`) and in the query builder, using `alias(tasks,'p1')` and `alias(tasks,'p2')` [V executed: identical rows, cd 375/250 and 75/0].

---

## 13. Environment variables to add or confirm (§10.3)

| Var | Use |
|---|---|
| `BETTER_AUTH_SECRET` | ≥ 32 random chars (`openssl rand -base64 32`). Required in production; a placeholder is needed at build time. |
| `BETTER_AUTH_URL` | The URL users open. It drives origin checks and cookie defaults. |
| `SECURE_COOKIES` | `true` or `false` → `advanced.useSecureCookies` (the `__Secure-` prefix when true). |
| `TRUSTED_ORIGINS` (new, optional) | Extra origins, comma-separated. |
| `TRUSTED_PROXIES` (new, optional) | IPs or CIDRs of proxies that append XFF. |
| `AUTH_RATE_LIMIT` (new, optional) | `on` enables Better Auth's HTTP limiter. Default off. |
| `DB_POOL_MAX` (new, optional) | postgres.js `max` (default 10). |

---

## 14. How to re-run the evidence

Scratch base: `/private/tmp/…/scratchpad/r2-auth-db/`. The shared `node_modules` holds `better-auth 1.7.6`, `auth 1.7.6`, `drizzle-orm 0.45.3`, `drizzle-kit 0.31.11`, `postgres 3.4.9`, `zod 4.6.5`, `typescript 6.0.3`, `tsx 4.23.15`, `next 16.3.7` and `react 19.3.0`.

```bash
cd v2/kt1
export DATABASE_URL=postgres://planner:planner@127.0.0.1:55433/planner_v2 BETTER_AUTH_URL=http://localhost:3000 BETTER_AUTH_SECRET=0123456789abcdef0123456789abcdef SECURE_COOKIES=false NODE_ENV=development
npx tsx scripts/migrate.ts                 # programmatic migrator
npx tsx scripts/auth-tests.ts              # 49 assertions — ALL PASS (also with SECURE_COOKIES=true NODE_ENV=production, and https baseURL)
npx tsx scripts/account-services-test.ts   # 15 assertions — ALL PASS
npx tsx scripts/cookiecache-test.ts        # cookieCache revocation delay + adminRoles validation
npx tsx scripts/ratelimit-test.ts          # AUTH_RATE_LIMIT=on NODE_ENV=production
npx tsx scripts/pgjs-types.ts              # TZ=UTC|Asia/Bangkok|America/Los_Angeles
npx tsx scripts/pg-errors.ts ; npx tsx scripts/workload-query.ts ; NODE_ENV=production npx tsx scripts/ip-test.ts
npx tsc -p tsconfig.json --noEmit          # clean (includes $Infer probes)
npx auth check schema --config src/server/auth.ts   # exit 0
cd ../nx && npx next build && node .next/standalone/v2/nx/server.js   # PORT=3107; curl tests in §2.6
```

---

## 15. Risks and open issues

1. **FR-103 cookie renewal depends on the `proxy.ts` pattern** (§2.6). If the plan gates only in layouts, active users are silently logged out 7 days after login. [V]
2. **XFF is spoofable without a reverse proxy.** The per-IP half of the FR-106 key can then be bypassed. Recommend deploying behind Caddy or the company proxy, and optionally a per-email cap. [V Next behaviour; L Caddy]
3. **The BR-20b trigger race** needs the assignment-row lock in every allocation writer, as a mandatory pattern plus a test. [V]
4. **Time_off:** restore can fail with 23P01, and AM+PM on the same day is rejected. Both need product and UX decisions. [V]
5. **The Drizzle migrator runs "newer than last applied" by the journal `when`.** Parallel agents generating migrations can cause silent skips, so centralize migration generation. [V]
6. **Better Auth hooks run on every sign-in** (one extra DB query before and one after). This is negligible. [V]
7. **Build-time env for `next build`:** use a lazy DB client and placeholder secret and URL in the Docker builder stage. [V]
8. The SPEC §7.1 wording about admin plugin endpoints differs from the recommended transactional services. Record it as a Decision. [V]
9. `session.user.role` is typed as `string | null | undefined`, so it must be narrowed in `authz.ts`. [V]
10. Out of scope but important: TypeScript 7 vs typescript-eslint (<6.1) → pin TS 6.0.x. [V]
11. `@better-auth/cli` is deprecated. The plan must use the `auth` package, matching the `better-auth` version. [V]
12. (resolved) Sign-out through a server action with `nextCookies` was verified in Next 16.3.7 standalone: 303, cookies cleared, session row deleted. [V]

---

## 16. Cleanup

- I removed both test containers:
  - `r2authdb-v2-pg17-a64f`, which this run created.
  - `r2authdb-pg17-a64f`, left behind by an earlier, unfinished attempt at this same task that used the same scratch folder. It had been idle for more than 2 h with no client connections.
- I left other agents' containers alone (`r4-collate-test`, `r6b-pg17-verify`).
- No Next.js server processes remain; port 3107 is free.
- To re-run the evidence in §14, first start a fresh `postgres:17` on 127.0.0.1:55433 and run `scripts/migrate.ts`.
