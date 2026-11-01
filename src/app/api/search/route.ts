// GET /api/search?q=&titleOnly=1 — Cmd/Ctrl+K and mention search (FR-1102…1105, X68, M4-D19); pages + tasks (M6.1,
// FR-690, M6.1-D14). Read-only transaction with SET LOCAL statement_timeout = '500ms'; both searches filter by
// visibleProjectIds in SQL. `titleOnly` (the mention menu) → `tasks: []`.
import { sql } from 'drizzle-orm'
import type { SearchResponse } from '@/lib/contracts/search'
import { searchQuerySchema } from '@/lib/schemas/pages'
import { db } from '@/server/db/client'
import { route } from '@/server/route'
import { searchPages, searchTasks } from '@/server/services/search'

export const GET = route<Record<string, never>, typeof searchQuerySchema>(
  (_req, { user, query }): Promise<SearchResponse> =>
    db.transaction(
      async (tx) => {
        await tx.execute(sql`set local statement_timeout = '500ms'`)
        const titleOnly = query.titleOnly === '1'
        const pages = await searchPages(tx, user, query.q, { titleOnly })
        const tasks = titleOnly ? [] : await searchTasks(tx, user, query.q)
        return { pages, tasks }
      },
      { accessMode: 'read only' },
    ),
  { query: searchQuerySchema },
)
