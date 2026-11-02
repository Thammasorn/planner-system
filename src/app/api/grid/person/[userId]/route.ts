// GET /api/grid/person/[userId]?from&to&expand&zoom — one person-grid chunk (§3.2 PERM-22, SPEC §7.4, M9-D12, X85).
// Same query schema as the project grid (includeOthers accepted and ignored). Parse (400) precedes authz; a malformed
// id → 404 (X86); default window −4/+12 weeks around serverToday(); services.grid.buildChunk → buildPersonChunk calls
// authz.requireVisibleUser first (invisible / unknown user → 404).
import { addWeeks, weekStart } from '@/domain/dates'
import type { GridResponse } from '@/lib/contracts/grid'
import { gridQuerySchema } from '@/lib/schemas/grid'
import { zUserId } from '@/lib/schemas/tasks'
import * as authz from '@/server/authz'
import { serverToday } from '@/server/clock'
import { db } from '@/server/db/client'
import { NotFoundError } from '@/server/errors'
import { route } from '@/server/route'
import * as services from '@/server/services'

export const GET = route<{ userId: string }, typeof gridQuerySchema>(
  (_req, { user, params, query }): Promise<GridResponse> => {
    authz.requireUser(user)
    const id = zUserId.safeParse(params.userId)
    if (!id.success) throw new NotFoundError() // X86: a malformed id reveals nothing
    const today = serverToday()
    const from = query.from ?? addWeeks(weekStart(today), -4)
    const to = query.to ?? addWeeks(weekStart(today), 12)
    return db.transaction(
      (tx) =>
        services.grid.buildChunk(
          tx,
          user,
          { kind: 'person', id: id.data },
          { from, to, expand: query.expand, zoom: query.zoom, includeOthers: false },
          today,
        ),
      { isolationLevel: 'repeatable read', accessMode: 'read only' },
    )
  },
  { query: gridQuerySchema },
)
