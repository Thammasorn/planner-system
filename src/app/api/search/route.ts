// GET /api/search?q=&titleOnly=1 — Cmd/Ctrl+K and mention search (FR-1102…1105, X68, M4-D19); pages only in M4.
// Read-only transaction with SET LOCAL statement_timeout = '500ms'; searchPages filters by visibleProjectIds.
import { sql } from 'drizzle-orm'
import type { SearchResponse } from '@/lib/contracts/search'
import { searchQuerySchema } from '@/lib/schemas/pages'
import { db } from '@/server/db/client'
import { route } from '@/server/route'
import { searchPages } from '@/server/services/search'

export const GET = route<Record<string, never>, typeof searchQuerySchema>(
  (_req, { user, query }): Promise<SearchResponse> =>
    db.transaction(
      async (tx) => {
        await tx.execute(sql`set local statement_timeout = '500ms'`)
        return { pages: await searchPages(tx, user, query.q, { titleOnly: query.titleOnly === '1' }) }
      },
      { accessMode: 'read only' },
    ),
  { query: searchQuerySchema },
)
