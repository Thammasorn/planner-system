// scripts/lib/db.ts — DB access for tsx scripts and the Playwright reset (PLAN.md §3.13). No 'server-only' and no
// getEnv() (scripts need only DATABASE_URL). Callers must `await close()` before exiting.
import { sql } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import * as schema from '@/server/db/schema'
import type { Db, DbOrTx } from '@/server/db/types'

export function createScriptDb(url: string | undefined = process.env.DATABASE_URL): {
  db: Db
  close: () => Promise<void>
} {
  if (!url) throw new Error('DATABASE_URL is required (copy .env.example to .env)')
  const client = postgres(url, { max: 1, onnotice: () => {} })
  return { db: drizzle(client, { schema }), close: () => client.end({ timeout: 5 }) }
}

/** Every table in schema public → TRUNCATE … RESTART IDENTITY CASCADE (drizzle.__drizzle_migrations untouched). */
export async function truncateAll(tx: DbOrTx): Promise<void> {
  const rows = await tx.execute<{ tablename: string }>(
    sql`select tablename from pg_tables where schemaname = 'public' order by tablename`,
  )
  if (rows.length === 0) return
  const list = rows.map((r) => `"public"."${r.tablename.replaceAll('"', '""')}"`).join(', ')
  await tx.execute(sql.raw(`truncate table ${list} restart identity cascade`))
}

/** Seeds and resets are dev/test only. */
export function assertNotProduction(): void {
  if (process.env.NODE_ENV === 'production') throw new Error('refusing to run with NODE_ENV=production')
}
