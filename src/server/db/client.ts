// src/server/db/client.ts — the app's lazy Drizzle client over postgres.js.
//
// Rules for later milestones:
// - No 'server-only' here (PLAN.md X56): tsx scripts, `auth check schema` and Playwright's resetDb import this module
//   (and services that use it). tsx compiles scripts as CommonJS, so this file must stay free of top-level await
//   and `import.meta`. One-shot scripts that only migrate/seed may still open their own `postgres(url, { max: 1 })`
//   client (see scripts/lib/migrate.ts) and must call closeDb() / end() before exiting.
// - Never log a `DrizzleQueryError.message` for auth tables: its params contain password hashes and tokens.
// - Nothing connects at import time; the pool is created on first use so `next build` works without DATABASE_URL.
import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import { getEnv } from '@/server/env'
import * as schema from './schema'
import type { Db } from './types'

export type { Db, DbOrTx, Schema, Tx } from './types'

type Holder = { sql?: postgres.Sql; db?: Db }
// globalThis survives Next dev HMR, so one pool per process.
const holder = ((globalThis as typeof globalThis & { __plannerDb?: Holder }).__plannerDb ??= {})

/** Creates the pool on first use (postgres.js connects lazily too). */
export function getDb(): Db {
  if (!holder.db) {
    const env = getEnv()
    holder.sql = postgres(env.DATABASE_URL, {
      max: env.DB_POOL_MAX,
      idle_timeout: 20,
      connect_timeout: 5,
      onnotice: () => {},
    })
    holder.db = drizzle(holder.sql, { schema })
  }
  return holder.db
}

/** Lazy `db` export used by actions/services (`db.transaction(...)`); every property is forwarded to getDb(). */
export const db: Db = new Proxy({} as Db, {
  get(_target, prop) {
    const real = getDb()
    const value: unknown = Reflect.get(real, prop, real)
    return typeof value === 'function' ? (value as (...args: unknown[]) => unknown).bind(real) : value
  },
})

/** Ends the pool (tests, scripts). The next getDb() opens a fresh one. */
export async function closeDb(): Promise<void> {
  const current = holder.sql
  holder.sql = undefined
  holder.db = undefined
  await current?.end({ timeout: 0 })
}
