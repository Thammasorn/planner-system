// GET /api/pages/[id] — PageView for the editor's re-fetch (FR-505, FR-543 reload). getPageView runs
// requirePage(view) first; a malformed, missing, deleted or invisible id is a 404 (X86).
import type { PageView } from '@/lib/contracts/pages'
import { db } from '@/server/db/client'
import { route } from '@/server/route'
import { getPageView } from '@/server/services/pages'

export const GET = route<{ id: string }>((_req, { user, params }): Promise<PageView> =>
  getPageView(db, user, params.id),
)
