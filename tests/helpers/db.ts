import type postgres from 'postgres'

/** Truncates every table in schema public (keeps drizzle.__drizzle_migrations). No-op when there are none (M0). */
export async function truncateAll(sql: postgres.Sql): Promise<void> {
  const rows = await sql<{ tablename: string }[]>`select tablename from pg_tables where schemaname = 'public'`
  if (rows.length === 0) return
  const list = rows.map((r) => `"public"."${r.tablename}"`).join(', ')
  await sql.unsafe(`truncate table ${list} restart identity cascade`)
}
