import { readFileSync } from 'node:fs'
import path from 'node:path'
import postgres from 'postgres'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

describe('database harness and migrations', () => {
  let sql: postgres.Sql

  beforeAll(() => {
    sql = postgres(process.env.DATABASE_URL!, { max: 1, onnotice: () => {} })
  })

  afterAll(async () => {
    await sql.end()
  })

  it('runs on a per-worker clone of the migrated template', async () => {
    const [row] = await sql<{ db: string }[]>`select current_database() as db`
    expect(row?.db).toMatch(/^planner_t_[0-9a-f]{6}_w\d+$/)
  })

  it('has the M0 extensions', async () => {
    const rows = await sql<{ extname: string }[]>`select extname from pg_extension`
    expect(rows.map((r) => r.extname)).toEqual(expect.arrayContaining(['btree_gist', 'pg_trgm', 'pgcrypto']))
  })

  it('applied exactly the journaled migrations', async () => {
    const journal = JSON.parse(
      readFileSync(path.resolve(process.cwd(), 'drizzle/meta/_journal.json'), 'utf8'),
    ) as {
      entries: unknown[]
    }
    const [row] = await sql<{ n: number }[]>`select count(*)::int as n from drizzle.__drizzle_migrations`
    expect(row?.n).toBe(journal.entries.length)
  })

  it('orderKey collation sorts like JS <', async () => {
    const keys = ['a1', 'Zz', 'a0V', 'a0']
    await sql.begin(async (tx) => {
      await tx`create temp table k (p text collate "C") on commit drop`
      for (const p of keys) await tx`insert into k (p) values (${p})`
      const byteOrder = await tx<{ p: string }[]>`select p from k order by p`
      const localeOrder = await tx<{ p: string }[]>`select p from k order by p collate "en_US.utf8"`
      expect(byteOrder.map((r) => r.p)).toEqual(['Zz', 'a0', 'a0V', 'a1'])
      expect(byteOrder.map((r) => r.p)).toEqual([...keys].sort())
      // Why X48 exists: the database default (en_US.utf8) orders fractional-index keys differently.
      expect(localeOrder.map((r) => r.p)).toEqual(['a0', 'a0V', 'a1', 'Zz'])
    })
  })
})
