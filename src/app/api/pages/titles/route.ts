// GET /api/pages/titles?ids= — mention / sub-page chip titles (FR-528/529, M4-D20/D32). Invisible ids → visible:false;
// visibility comes from authz.visibleProjectIds inside getPageTitles.
import type { PageTitlesResponse } from '@/lib/contracts/pages'
import { titlesQuerySchema } from '@/lib/schemas/pages'
import { db } from '@/server/db/client'
import { route } from '@/server/route'
import { getPageTitles } from '@/server/services/pages'

export const GET = route<Record<string, never>, typeof titlesQuerySchema>(
  (_req, { user, query }): Promise<PageTitlesResponse> => getPageTitles(db, user, query.ids),
  { query: titlesQuerySchema },
)
