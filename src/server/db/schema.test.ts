import { getTableConfig, pgTable } from 'drizzle-orm/pg-core'
import { describe, expect, it } from 'vitest'
import { orderKey, timestamptz } from './schema'

describe('schema conventions', () => {
  it('orderKey is text COLLATE "C"', () => {
    const t = pgTable('t', { position: orderKey('position').notNull() })
    expect(getTableConfig(t).columns[0]?.getSQLType()).toBe('text COLLATE "C"')
  })

  it('timestamptz is timestamp with time zone', () => {
    const t = pgTable('t', { createdAt: timestamptz('created_at') })
    expect(getTableConfig(t).columns[0]?.getSQLType()).toBe('timestamp with time zone')
  })
})
