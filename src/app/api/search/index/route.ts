// GET /api/search/index — the palette's local index: visible projects, people and clients (M10-D21, X81). No query.
// Visibility is applied in SQL by searchIndex (authz sets first); one read-only snapshot.
import type { SearchIndexResponse } from '@/lib/contracts/search'
import { db } from '@/server/db/client'
import { route } from '@/server/route'
import { searchIndex } from '@/server/services/search'

export const GET = route(
  (_req, { user }): Promise<SearchIndexResponse> =>
    db.transaction((tx) => searchIndex(tx, user), { isolationLevel: 'repeatable read', accessMode: 'read only' }),
)
