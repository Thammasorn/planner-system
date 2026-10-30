import path from 'node:path'
import { drizzle } from 'drizzle-orm/postgres-js'
import { migrate } from 'drizzle-orm/postgres-js/migrator'
import postgres from 'postgres'

/** Folder of journaled migrations. Every caller runs from the repo root (Vitest, Playwright, pnpm scripts, Docker /app). */
export const MIGRATIONS_FOLDER = path.resolve(process.cwd(), 'drizzle')

/** Applies every journal entry newer than the last applied one, in one transaction (Drizzle 0.45 semantics). */
export async function runMigrations(
  databaseUrl: string,
  migrationsFolder: string = MIGRATIONS_FOLDER,
): Promise<void> {
  const sql = postgres(databaseUrl, { max: 1, onnotice: () => {} })
  try {
    await migrate(drizzle(sql), { migrationsFolder })
  } finally {
    await sql.end()
  }
}
