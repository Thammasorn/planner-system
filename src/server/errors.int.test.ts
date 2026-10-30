import { DrizzleQueryError } from 'drizzle-orm/errors'
import { describe, expect, it } from 'vitest'
import { db } from './db/client'
import { positions } from './db/schema'
import { mapDbError, pgErrorInfo } from './errors'

describe('Postgres error mapping (real DB)', () => {
  it('T-ERR-01 a duplicate positions.name insert → DrizzleQueryError → CONFLICT, constraint positions_name_unique', async () => {
    await db.insert(positions).values({ name: 'QA', position: 'a0' })
    let caught: unknown
    try {
      await db.insert(positions).values({ name: 'QA', position: 'a1' })
    } catch (e) {
      caught = e
    }
    expect(caught).toBeInstanceOf(DrizzleQueryError)
    expect(mapDbError(caught)?.code).toBe('CONFLICT')
    expect(pgErrorInfo(caught)).toEqual({ code: '23505', constraint: 'positions_name_unique' })
  })
})
