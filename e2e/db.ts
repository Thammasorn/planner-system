import postgres from 'postgres'
import { runMigrations } from '../scripts/lib/migrate'
import { E2E } from './env'

/**
 * Idempotent: create `planner_e2e` if missing, then apply pending migrations (M0-D18).
 * Never drops — from M1 `resetDb` truncates + reseeds per spec file.
 */
export async function prepareE2eDb(): Promise<void> {
  const admin = postgres(E2E.adminUrl, { max: 1, onnotice: () => {} })
  try {
    const [row] = await admin<{ exists: boolean }[]>`
      select exists(select 1 from pg_database where datname = ${E2E.dbName}) as exists`
    if (!row?.exists) await admin.unsafe(`create database ${E2E.dbName}`)
  } finally {
    await admin.end()
  }
  await runMigrations(E2E.databaseUrl)
}
