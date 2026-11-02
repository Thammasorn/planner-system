// GET /api/pages/[id]/databases/[databaseId] — one database of an owner page (SPEC §7.9, FR-1464, M11-D7).
// Params parsed first (malformed → 404, X86); getDatabase runs requireDatabase(view, { pageId }) before any read, and
// every failure (page invisible, deleted, mismatch, database missing) is the same NotFoundError → identical body.
import type { DatabaseResponse } from '@/lib/contracts/databases'
import { databaseParamsSchema } from '@/lib/schemas/databases'
import { db } from '@/server/db/client'
import { NotFoundError } from '@/server/errors'
import { route } from '@/server/route'
import { getDatabase } from '@/server/services/databases'

export const GET = route<{ id: string; databaseId: string }>(
  (_req, { user, params }): Promise<DatabaseResponse> => {
    const parsed = databaseParamsSchema.safeParse(params)
    if (!parsed.success) throw new NotFoundError()
    return getDatabase(db, user, { pageId: parsed.data.id, databaseId: parsed.data.databaseId })
  },
)
