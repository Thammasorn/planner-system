// GET /api/database-rows/[id]/body — the row body view (SPEC §7.7, FR-1453, M11-D8, PERM-24): requireDbRow(view)
// inside getRowBodyView before any read; `page: null` until the body is first edited. A malformed id is a 404 (X86).
import type { RowBodyView } from '@/lib/contracts/row-pages'
import { rowBodyParamsSchema } from '@/lib/schemas/row-pages'
import { db } from '@/server/db/client'
import { NotFoundError } from '@/server/errors'
import { route } from '@/server/route'
import { getRowBodyView } from '@/server/services/row-pages'

export const GET = route<{ id: string }>((_req, { user, params }): Promise<RowBodyView> => {
  const parsed = rowBodyParamsSchema.safeParse(params)
  if (!parsed.success) throw new NotFoundError()
  return getRowBodyView(db, user, parsed.data.id)
})
