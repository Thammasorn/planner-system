// Smoke test of the partial-migration harness (plan/m06.1 S0.3): applies the journal in slices to a scratch DB.
import type postgres from 'postgres'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  applyJournal,
  createScratchDb,
  dropScratchDb,
  entryStatements,
  readJournal,
  selectEntries,
} from './migrate-partial'

const tableExists = async (sql: postgres.Sql, name: string): Promise<boolean> => {
  const [r] = await sql<{ t: string | null }[]>`select to_regclass(${`public.${name}`})::text as t`
  return r?.t !== null && r?.t !== undefined
}

describe('migrate-partial', () => {
  let sql: postgres.Sql

  beforeAll(async () => {
    sql = (await createScratchDb('harness')).sql
  })

  afterAll(async () => {
    await dropScratchDb('harness', sql)
  })

  it('reads the journal in order and splits statements on the breakpoint', () => {
    const entries = readJournal()
    expect(entries.map((e) => e.idx)).toEqual(entries.map((_, i) => i))
    expect(entryStatements(entries[0]!.tag).length).toBeGreaterThan(0)
    expect(entryStatements('0003_m3_tasks').every((s) => !s.includes('statement-breakpoint'))).toBe(true)
  })

  it('selects by full tag or numeric prefix, inclusive on both ends', () => {
    const entries = readJournal()
    expect(selectEntries(entries, { upTo: '0002' }).map((e) => e.idx)).toEqual([0, 1, 2])
    expect(selectEntries(entries, { from: '0003_m3_tasks', upTo: '0004' }).map((e) => e.idx)).toEqual([3, 4])
    expect(() => selectEntries(entries, { upTo: '9999' })).toThrow(/not in drizzle/)
    expect(() => selectEntries(entries, { from: '0004', upTo: '0003' })).toThrow(/precedes/)
  })

  it('applies a prefix of the journal, then the rest', async () => {
    expect(await applyJournal(sql, { upTo: '0003' })).toHaveLength(4)
    expect(await tableExists(sql, 'tasks')).toBe(true)
    expect(await tableExists(sql, 'pages')).toBe(false)
    const rest = await applyJournal(sql, { from: '0004' })
    expect(rest[0]).toMatch(/^0004_/)
    expect(await tableExists(sql, 'pages')).toBe(true)
  })
})
