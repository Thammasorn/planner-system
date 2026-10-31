// GET /api/pages/tree?space=&projectId=&parentId= — lazy page-tree children (FR-503, M4-D23). Authz in listTree:
// PROJECT → requireProject(view) (W → 404); parentId → requirePage(view) and the same space/project (else 404).
import type { PageTreeResponse } from '@/lib/contracts/pages'
import { treeQuerySchema } from '@/lib/schemas/pages'
import { db } from '@/server/db/client'
import { route } from '@/server/route'
import { listTree } from '@/server/services/page-tree'

export const GET = route<Record<string, never>, typeof treeQuerySchema>(
  (_req, { user, query }): Promise<PageTreeResponse> => listTree(db, user, query),
  { query: treeQuerySchema },
)
