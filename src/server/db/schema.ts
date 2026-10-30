import { customType, timestamp } from 'drizzle-orm/pg-core'

/**
 * Fractional-index key column (SPEC §6.1, PLAN.md X48): byte-order collation so ORDER BY matches the JS `<`
 * comparison of fractional-indexing keys (the default en_US.utf8 collation mis-orders them).
 * Use for every user-ordered `position` column; sort with ORDER BY position, id.
 */
export const orderKey = customType<{ data: string; driverData: string }>({
  dataType() {
    return 'text COLLATE "C"'
  },
})

/** Every timestamp is timestamptz (PLAN.md §1.3); plan dates use date({ mode: 'string' }) instead. */
export const timestamptz = (name: string) => timestamp(name, { withTimezone: true, mode: 'date' })

// Tables arrive with their milestone (PLAN.md X10): none in M0.
