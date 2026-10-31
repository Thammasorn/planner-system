import { readFileSync } from 'node:fs'
import path from 'node:path'
import { eq } from 'drizzle-orm'
import { DrizzleQueryError } from 'drizzle-orm/errors'
import postgres from 'postgres'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { makeUser } from '../../../tests/helpers/factories'
import { db } from './client'
import { clients, projectMembers, projects } from './schema'

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

describe('M2 schema (SPEC §6.2 clients / projects / project_members, §6.4)', () => {
  let sql: postgres.Sql

  beforeAll(() => {
    sql = postgres(process.env.DATABASE_URL!, { max: 1, onnotice: () => {} })
  })

  afterAll(async () => {
    await sql.end()
  })

  it('has the trigram indexes', async () => {
    const rows = await sql<{ indexname: string }[]>`
      select indexname from pg_indexes where indexname in
        ('projects_name_trgm', 'clients_name_trgm', 'user_name_trgm', 'user_nickname_trgm', 'project_members_user_id_idx')`
    expect(rows.map((r) => r.indexname).sort()).toEqual([
      'clients_name_trgm',
      'project_members_user_id_idx',
      'projects_name_trgm',
      'user_name_trgm',
      'user_nickname_trgm',
    ])
  })

  it('rejects duplicate client names including archived', async () => {
    await db.insert(clients).values({ name: 'Coral', archivedAt: new Date() })
    const err: unknown = await db
      .insert(clients)
      .values({ name: 'Coral' })
      .then(
        () => null,
        (e: unknown) => e,
      )
    expect(err).toBeInstanceOf(DrizzleQueryError)
    expect((err as DrizzleQueryError).cause).toMatchObject({
      code: '23505',
      constraint_name: 'clients_name_unique',
    })
  })

  it('sets client_id null when a client row is deleted', async () => {
    const u = await makeUser({ role: 'manager' })
    const [c] = await db.insert(clients).values({ name: 'Bluebird' }).returning()
    const [p] = await db.insert(projects).values({ name: 'X', clientId: c!.id, createdBy: u.id }).returning()
    await sql`delete from clients where id = ${c!.id}`
    const [after] = await db.select().from(projects).where(eq(projects.id, p!.id))
    expect(after?.clientId).toBeNull()
  })

  it('cascades project_members on project delete', async () => {
    const u = await makeUser({ role: 'manager' })
    const [p] = await db.insert(projects).values({ name: 'X', createdBy: u.id }).returning()
    await db.insert(projectMembers).values({ projectId: p!.id, userId: u.id, role: 'LEAD', addedBy: u.id })
    await sql`delete from projects where id = ${p!.id}`
    const rows = await db.select().from(projectMembers).where(eq(projectMembers.projectId, p!.id))
    expect(rows).toEqual([])
  })

  it('defaults: colour #2F5597, certainty CONFIRMED, member role MEMBER, timestamps set', async () => {
    const u = await makeUser({ role: 'manager' })
    const [p] = await db.insert(projects).values({ name: 'X', createdBy: u.id }).returning()
    expect(p).toMatchObject({ color: '#2F5597', certainty: 'CONFIRMED', archivedAt: null, deletedAt: null })
    expect(p?.createdAt).toBeInstanceOf(Date)
    const [m] = await db.insert(projectMembers).values({ projectId: p!.id, userId: u.id }).returning()
    expect(m).toMatchObject({ role: 'MEMBER', addedBy: null })
    const [c] = await db.insert(clients).values({ name: 'SCB' }).returning()
    expect(c).toMatchObject({ code: null, color: null, note: null, archivedAt: null })
  })
})
