import { sql } from 'drizzle-orm'
import { afterAll, describe, expect, it } from 'vitest'
import { closeDb, db, getDb } from '@/server/db/client'

afterAll(closeDb)

describe('db client', () => {
  it('runs a query', async () => {
    const [row] = await getDb().execute<{ one: number }>(sql`select 1::int as one`)
    expect(row?.one).toBe(1)
  })

  it('lazy db proxy forwards to the real instance', async () => {
    await expect(db.execute(sql`select 1`)).resolves.toBeDefined()
    expect(typeof db.transaction).toBe('function')
    const value = await db.transaction(async (tx) => {
      const [row] = await tx.execute<{ two: number }>(sql`select 2::int as two`)
      return row?.two
    })
    expect(value).toBe(2)
  })

  it('runs sessions in UTC (X52)', async () => {
    const [row] = await getDb().execute<{ tz: string }>(sql`select current_setting('TimeZone') as tz`)
    expect(row?.tz).toBe('UTC')
  })

  it('uses the en_US.utf8 ctype needed for Thai trigrams', async () => {
    const [row] = await getDb().execute<{ datctype: string }>(
      sql`select datctype from pg_database where datname = current_database()`,
    )
    expect(row?.datctype).toBe('en_US.utf8')
  })

  it('produces Thai trigrams', async () => {
    const [row] = await getDb().execute<{ n: number | null }>(
      sql`select array_length(show_trgm('สวัสดี'), 1) as n`,
    )
    expect(row?.n ?? 0).toBeGreaterThan(0)
  })

  it('closeDb resets the singleton', async () => {
    const before = getDb()
    await closeDb()
    const after = getDb()
    expect(after).not.toBe(before)
    const [row] = await after.execute<{ one: number }>(sql`select 1::int as one`)
    expect(row?.one).toBe(1)
  })
})
