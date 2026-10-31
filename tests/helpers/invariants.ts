// tests/helpers/invariants.ts — data invariants asserted after integration tests (plan/m03 S0.15, S2.6, R22).
import { sql } from 'drizzle-orm'
import { expect } from 'vitest'
import { db } from '@/server/db/client'
import type { DbOrTx } from '@/server/db/types'

/** BR-80 / R22: a task has `completed_on` exactly when its status is in the DONE category (deleted tasks included). */
export async function assertCompletionInvariant(tx: DbOrTx = db): Promise<void> {
  const rows = await tx.execute<{
    id: string
    name: string
    category: string
    completed_on: string | null
  }>(sql`
    select t.id, t.name, s.category::text as category, t.completed_on::text as completed_on
    from tasks t join task_statuses s on s.id = t.status_id
    where (s.category = 'DONE') <> (t.completed_on is not null)
    order by t.id`)
  expect([...rows], 'tasks whose completed_on disagrees with their status category (BR-80)').toEqual([])
}
