// src/server/env.ts — no 'server-only' (PLAN.md X56): src/proxy.ts, tsx scripts and Playwright may import it.
import { z } from 'zod'

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }),
  SECURE_COOKIES: z
    .enum(['true', 'false'])
    .default('false')
    .transform((v) => v === 'true'),
  DB_POOL_MAX: z.coerce.number().int().min(1).max(50).default(10),
  // M1 adds BETTER_AUTH_*, TRUSTED_*, ALLOW_TEST_HOOKS, APP_NOW, INITIAL_MANAGER_*; M4 adds UPLOAD_DIR, MAX_*_MB.
})

export type Env = z.output<typeof EnvSchema>
export const ENV_KEYS = Object.keys(EnvSchema.shape) as ReadonlyArray<keyof Env>

/** Validates a raw env object. Messages name the variable and the problem, never the value. */
export function parseEnv(source: Record<string, string | undefined>): Env {
  const result = EnvSchema.safeParse(source)
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
