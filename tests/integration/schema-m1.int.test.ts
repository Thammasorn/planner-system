// SPEC §6.2 + PLAN §1.3 — M1 tables (Better Auth + admin plugin columns, trigram indexes, timestamptz, checks).
// plan/m01-auth-employees.md §5.S4 (S4.10). The plan puts these in src/server/db/schema.int.test.ts, which is outside
// the test stream's ownership in M1; the orchestrator may move this block there (see the S4 report).
import { sql } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import { db } from '@/server/db/client'
import { pgErrorInfo } from '@/server/errors'
import { makeUser } from '../helpers/factories'

const M1_TABLES = [
  'user',
  'session',
  'account',
  'verification',
  'positions',
  'work_schedules',
  'user_preferences',
  'audit_log',
  'auth_login_failures',
]

async function column(table: string, name: string) {
  const rows = await db.execute<{ data_type: string; column_default: string | null }>(
    sql`select data_type, column_default from information_schema.columns
        where table_schema = 'public' and table_name = ${table} and column_name = ${name}`,
  )
  return rows[0]
}

describe('M1 schema', () => {
  it('T-SCHEMA-01 user has ban_expires timestamptz, deactivated_on date, banned default false; session.impersonated_by exists', async () => {
    expect(await column('user', 'ban_expires')).toMatchObject({ data_type: 'timestamp with time zone' })
    expect(await column('user', 'deactivated_on')).toMatchObject({ data_type: 'date' })
    expect(await column('user', 'banned')).toMatchObject({ data_type: 'boolean', column_default: 'false' })
    expect(await column('session', 'impersonated_by')).toBeDefined()
  })

  it('T-SCHEMA-02 user_name_trgm and user_nickname_trgm are GIN trigram indexes', async () => {
    const rows = await db.execute<{ indexname: string; indexdef: string }>(
      sql`select indexname, indexdef from pg_indexes
          where schemaname = 'public' and indexname in ('user_name_trgm', 'user_nickname_trgm') order by indexname`,
    )
    expect(rows.map((r) => r.indexname)).toEqual(['user_name_trgm', 'user_nickname_trgm'])
    for (const r of rows) {
      expect(r.indexdef).toMatch(/using gin/i)
      expect(r.indexdef).toContain('gin_trgm_ops')
    }
  })

  it('T-SCHEMA-03 every timestamp column of the M1 tables is timestamp with time zone', async () => {
    const rows = await db.execute<{ table_name: string; column_name: string; data_type: string }>(
      sql`select table_name, column_name, data_type from information_schema.columns
          where table_schema = 'public' and data_type like 'timestamp%'`,
    )
    const m1 = rows.filter((r) => M1_TABLES.includes(r.table_name))
    expect(m1.length).toBeGreaterThan(0)
    const naive = m1.filter((r) => r.data_type !== 'timestamp with time zone').map((r) => `${r.table_name}.${r.column_name}`)
    expect(naive).toEqual([])
  })

  it('T-SCHEMA-04 work_schedules rejects weekday 8 and fraction 0 (23514)', async () => {
    const u = await makeUser({ schedule: [] })
    const code = (q: Promise<unknown>) =>
      q.then(
        () => 'ok',
        (e: unknown) => pgErrorInfo(e).code,
      )
    expect(
      await code(db.execute(sql`insert into work_schedules (user_id, weekday, fraction) values (${u.id}, 8, '1.00')`)),
    ).toBe('23514')
    expect(
      await code(db.execute(sql`insert into work_schedules (user_id, weekday, fraction) values (${u.id}, 1, '0')`)),
    ).toBe('23514')
    expect(
      await code(db.execute(sql`insert into work_schedules (user_id, weekday, fraction) values (${u.id}, 7, '0.25')`)),
    ).toBe('ok')
  })

  // T-SCHEMA-05 — `pnpm auth:check` (Better Auth `auth check schema`) runs at G2, not in Vitest.
})
