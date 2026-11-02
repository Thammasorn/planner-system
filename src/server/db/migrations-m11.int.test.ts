// M11-D4 (plan/m11 S0.2): the Drizzle migrator applies every pending migration in ONE transaction, and PostgreSQL
// forbids using an enum value added by `ALTER TYPE … ADD VALUE` in that same transaction (55P04). A fresh install
// therefore runs 0000…<m11> together: this test applies the whole journal in one transaction on a scratch DB.
import type postgres from 'postgres'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  applyJournal,
  createScratchDb,
  dropScratchDb,
  entryStatements,
  readJournal,
} from '../../../tests/helpers/migrate-partial'

const SCRATCH = 'm11_journal'

describe('M11 migration (M11-D4)', () => {
  let sql: postgres.Sql

  beforeAll(async () => {
    sql = (await createScratchDb(SCRATCH)).sql
  })

  afterAll(async () => {
    await dropScratchDb(SCRATCH, sql)
  })

  it('the M11 migration is journaled and adds DB_ROW with ADD VALUE (no enum drop / recreate)', () => {
    const m11 = readJournal().find((e) => /_m11_databases$/.test(e.tag))
    expect(m11).toBeDefined()
    const stmts = entryStatements(m11!.tag)
    expect(stmts.some((s) => /ALTER TYPE "public"\."page_kind" ADD VALUE 'DB_ROW'/.test(s))).toBe(true)
    expect(stmts.some((s) => /DROP TYPE/i.test(s))).toBe(false)
    // Every other use of 'DB_ROW' must compare text, never the enum literal (55P04 in the same transaction).
    const others = stmts.filter((s) => s.includes("'DB_ROW'") && !/ADD VALUE/.test(s))
    expect(others.length).toBeGreaterThan(0)
    for (const s of others) expect(s).toMatch(/::text = 'DB_ROW'/)
  })

  it('applies the whole journal in one transaction on an empty database', async () => {
    const tags = await applyJournal(sql) // no upTo: 0000 … last, one BEGIN/COMMIT
    expect(tags).toEqual(readJournal().map((e) => e.tag))
    const rows = await sql<{ v: string }[]>`select unnest(enum_range(null::page_kind))::text as v`
    expect(rows.map((r) => r.v)).toEqual(['DOC', 'TASK', 'DB_ROW'])
    const [t] = await sql<{ t: string | null }[]>`select to_regclass('public.database_rows')::text as t`
    expect(t?.t).toBe('database_rows')
  })

  it('after commit the new value is usable: a DB_ROW body page can be inserted for a row', async () => {
    const [u] = await sql<{ id: string }[]>`
      insert into "user" (id, name, email, email_verified, created_at, updated_at)
      values ('m11-u', 'U', 'm11@example.test', true, now(), now()) returning id`
    const [p] = await sql<{ id: string }[]>`
      insert into pages (space, position, created_by, updated_by) values ('WORKSPACE', 'a0', ${u!.id}, ${u!.id})
      returning id`
    const [d] = await sql<{ id: string }[]>`
      insert into databases (page_id, created_by, updated_by) values (${p!.id}, ${u!.id}, ${u!.id}) returning id`
    const [r] = await sql<{ id: string }[]>`
      insert into database_rows (database_id, position, created_by, updated_by)
      values (${d!.id}, 'a0', ${u!.id}, ${u!.id}) returning id`
    const [b] = await sql<{ kind: string }[]>`
      insert into pages (space, kind, database_row_id, position, created_by, updated_by)
      values ('WORKSPACE', 'DB_ROW', ${r!.id}, 'a0', ${u!.id}, ${u!.id}) returning kind`
    expect(b?.kind).toBe('DB_ROW')
  })
})
