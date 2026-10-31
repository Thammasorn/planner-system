// /api/pages/[id]/lock — edit lease (FR-540–542, SPEC §7.7 lease API, M4-D3, M4-D18). Route handlers by SPEC
// exception (heartbeat). GET: requirePage(view) → state · POST (?takeover=1): assertSameOrigin → requirePage(edit) →
// acquire · DELETE: assertSameOrigin → requirePage(view) → release (a non-holder's DELETE is a no-op) → 204.
// Leases are not audited (X44).
import type { LeaseState } from '@/lib/contracts/pages'
import { leaseQuerySchema } from '@/lib/schemas/pages'
import * as authz from '@/server/authz'
import { db } from '@/server/db/client'
import { assertSameOrigin } from '@/server/http/same-origin'
import { JSON_HEADERS, route } from '@/server/route'
import { acquireLease, getLease, releaseLease } from '@/server/services/page-lease'

export const GET = route<{ id: string }>((_req, { user, params }): Promise<LeaseState> =>
  db.transaction(async (tx) => {
    await authz.requirePage(tx, user, params.id, 'view')
    return getLease(tx, user, params.id)
  }),
)

export const POST = route<{ id: string }, typeof leaseQuerySchema>(
  (req, { user, params, query }): Promise<LeaseState> => {
    assertSameOrigin(req)
    return db.transaction(async (tx) => {
      await authz.requirePage(tx, user, params.id, 'edit') // protected (workers) / archived → 403
      return acquireLease(tx, user, params.id, { takeover: query.takeover === '1' })
    })
  },
  { query: leaseQuerySchema },
)

export const DELETE = route<{ id: string }>(async (req, { user, params }): Promise<Response> => {
  assertSameOrigin(req)
  await db.transaction(async (tx) => {
    await authz.requirePage(tx, user, params.id, 'view')
    await releaseLease(tx, user, params.id)
  })
  return new Response(null, { status: 204, headers: JSON_HEADERS })
})
