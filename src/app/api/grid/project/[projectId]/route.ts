// GET /api/grid/project/[projectId]?from&to&includeOthers — one planning-grid chunk (§3.2 PERM-06, SPEC §7.4, X65).
// Query parse (400) precedes authz (gridQuerySchema in the wrapper); a malformed id → 404 (X86); default window
// −4/+12 weeks around serverToday(); one REPEATABLE READ read-only tx; services.grid.buildChunk calls
// authz.requireProject(…, 'view') first (archived readable, X42).
import { addWeeks, weekStart } from '@/domain/dates'
import type { GridResponse } from '@/lib/contracts/grid'
import { gridQuerySchema } from '@/lib/schemas/grid'
import { z } from '@/lib/z'
import * as authz from '@/server/authz'
import { serverToday } from '@/server/clock'
import { db } from '@/server/db/client'
import { NotFoundError } from '@/server/errors'
import { route } from '@/server/route'
import * as services from '@/server/services'

const idSchema = z.uuid()

export const GET = route<{ projectId: string }, typeof gridQuerySchema>(
  (_req, { user, params, query }): Promise<GridResponse> => {
    authz.requireUser(user)
    const id = idSchema.safeParse(params.projectId)
    if (!id.success) throw new NotFoundError() // X86: a malformed id reveals nothing
    const today = serverToday()
    const from = query.from ?? addWeeks(weekStart(today), -4)
    const to = query.to ?? addWeeks(weekStart(today), 12)
    return db.transaction(
      (tx) =>
        services.grid.buildChunk(
          tx,
          user,
          { kind: 'project', id: id.data },
          { from, to, expand: [], zoom: 'week', includeOthers: query.includeOthers },
          today,
        ),
      { isolationLevel: 'repeatable read', accessMode: 'read only' },
    )
  },
  { query: gridQuerySchema },
)
