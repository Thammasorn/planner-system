import { readFileSync } from 'node:fs'
import path from 'node:path'
import postgres from 'postgres'
import { describe, expect, it } from 'vitest'
import { MIGRATIONS_FOLDER, runMigrations } from './migrate'

function databaseUrl(): string {
  const url = process.env.DATABASE_URL
  if (!url) throw new Error('DATABASE_URL is set per worker by tests/setup/db-worker.ts')
  return url
}

async function appliedCount(url: string): Promise<number> {
  const sql = postgres(url, { max: 1, onnotice: () => {} })
  try {
    const [row] = await sql<{ n: number }[]>`select count(*)::int as n from drizzle.__drizzle_migrations`
    return row?.n ?? 0
  } finally {
    await sql.end()
  }
}

describe('runMigrations', () => {
  it('is idempotent on an already-migrated database', async () => {
    const journal = JSON.parse(
      readFileSync(path.join(MIGRATIONS_FOLDER, 'meta', '_journal.json'), 'utf8'),
    ) as { entries: unknown[] }
    const url = databaseUrl()
    expect(await appliedCount(url)).toBe(journal.entries.length) // the worker DB is cloned from the migrated template

    await runMigrations(url)
    await runMigrations(url)

    expect(await appliedCount(url)).toBe(journal.entries.length)
  })

  it('fails loudly on an unreachable database', async () => {
    await expect(runMigrations('postgres://planner:planner@127.0.0.1:1/none')).rejects.toThrow()
  })
})
