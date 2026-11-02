// GET /api/search?q=&titleOnly=1 — Cmd/Ctrl+K and mention search (FR-1102…1105, X68, M4-D19, M10-D20): projects,
// tasks (M6.1, FR-690), pages, people, clients — ≤ 8 each, visibility in SQL (FR-1104). Read-only transaction with
// SET LOCAL statement_timeout = '500ms'. `titleOnly` (the mention menu) → only `pages` (by title), every other key [].
import { sql } from 'drizzle-orm'
import type { SearchAllResponse } from '@/lib/contracts/search'
import { searchQuerySchema } from '@/lib/schemas/pages'
import { db } from '@/server/db/client'
import { route } from '@/server/route'
import { searchAll } from '@/server/services/search'

export const GET = route<Record<string, never>, typeof searchQuerySchema>(
  (_req, { user, query }): Promise<SearchAllResponse> =>
    db.transaction(
      async (tx) => {
        await tx.execute(sql`set local statement_timeout = '500ms'`)
        return searchAll(tx, user, query.q, { titleOnly: query.titleOnly === '1' })
      },
      { accessMode: 'read only' },
    ),
  { query: searchQuerySchema },
)
