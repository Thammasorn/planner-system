// src/server/env.ts — no 'server-only' (PLAN.md X56, M1-D4): src/proxy.ts, tsx scripts and Playwright may import it.
// `src/server/auth.ts` reads process.env directly (never throws at import, so `next build` and
// `auth check schema` work without secrets); everything else validates through getEnv().
import { z } from 'zod'

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }),
  /** true behind HTTPS (cookie `Secure` + `__Secure-` prefix, CSP upgrade-insecure-requests). */
  SECURE_COOKIES: z
    .enum(['true', 'false'])
    .default('false')
    .transform((v) => v === 'true'),
  DB_POOL_MAX: z.coerce.number().int().min(1).max(50).default(10),
  // M1 — auth (SPEC §10.3, PLAN.md §3.12). Optional here but validated when set: getEnv() also serves the DB client
  // and the proxy's CSP, which do not need them; auth.ts reads process.env itself and Better Auth refuses a missing
  // or default secret in production.
  BETTER_AUTH_SECRET: z.string().min(32).optional(),
  BETTER_AUTH_URL: z.url().optional(),
  TRUSTED_ORIGINS: z.string().default(''),
  TRUSTED_PROXIES: z.string().default(''),
  /** Test-only: '1' enables APP_NOW (X45) and disables the auth rate limit (M1-D11). */
  ALLOW_TEST_HOOKS: z.enum(['0', '1']).optional(),
  APP_NOW: z.iso.datetime({ offset: true }).optional(),
  INITIAL_MANAGER_EMAIL: z.string().optional(),
  INITIAL_MANAGER_NAME: z.string().optional(),
  INITIAL_MANAGER_PASSWORD: z.string().optional(),
  // M4 — uploads (SPEC §7.6, §10.3, M4-D15, DEP-07).
  UPLOAD_DIR: z.string().min(1).default('./uploads'),
  MAX_IMAGE_MB: z.coerce.number().int().min(1).max(100).default(10),
  MAX_ATTACHMENT_MB: z.coerce.number().int().min(1).max(200).default(25),
})

export type Env = z.output<typeof EnvSchema>
export const ENV_KEYS = Object.keys(EnvSchema.shape) as ReadonlyArray<keyof Env>

/** Validates a raw env object. Empty values count as unset (`KEY=` lines in .env). Messages name the variable and
 *  the problem, never the value. */
export function parseEnv(source: Record<string, string | undefined>): Env {
  const present = Object.fromEntries(Object.entries(source).filter(([, v]) => v !== undefined && v !== ''))
  const result = EnvSchema.safeParse(present)
  if (!result.success) {
    const issues = result.error.issues.map((i) => `${i.path.join('.')}: ${i.code}`).join('; ')
    throw new Error(`Invalid environment: ${issues}`)
  }
  return result.data
}

let cached: Env | undefined

/** Lazy: nothing is validated at import time, so `next build` works without DATABASE_URL (PLAN.md §3.12). */
export function getEnv(): Env {
  cached ??= parseEnv(process.env)
  return cached
}

/** Tests only. */
export function resetEnvCache(): void {
  cached = undefined
}

/** Upload size limits in bytes (M4-D15); the editor receives them as props for its client pre-check. */
export function uploadLimits(): { imageBytes: number; attachmentBytes: number } {
  const env = getEnv()
  return { imageBytes: env.MAX_IMAGE_MB * 1024 * 1024, attachmentBytes: env.MAX_ATTACHMENT_MB * 1024 * 1024 }
}

/** Comma-separated env value → trimmed, non-empty items (`TRUSTED_ORIGINS`, `TRUSTED_PROXIES`). */
export function csv(value: string | undefined): string[] {
  return (value ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
}
