// GET /api/clients/options?projectId= — client picker options (M2-D04, X61). A malformed projectId → 400 (query
// schema). Authz in services.clients.listClientOptions: without projectId manager only (403); with it
// requireProject(…, 'manage') (404 / 403, archived → 403).
import type { ClientOptionsResponse } from '@/lib/contracts/clients'
import { z } from '@/lib/z'
import { db } from '@/server/db/client'
import { route } from '@/server/route'
import * as services from '@/server/services'

const querySchema = z.object({ projectId: z.uuid().optional() })

export const GET = route(
  async (_req, { user, query }): Promise<ClientOptionsResponse> => ({
    clients: await services.clients.listClientOptions(db, user, query.projectId ?? null),
  }),
  { query: querySchema },
)
