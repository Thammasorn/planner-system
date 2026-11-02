// GET /api/home — the /home dashboard (FR-1101, M10-D34). Every card applies visibility itself (authz sets inside the
// services); non-managers get `manager: null`. All cards in ONE repeatable-read, read-only snapshot.
import type { HomeResponse } from '@/lib/contracts/home'
import { db } from '@/server/db/client'
import { serverNow, serverToday } from '@/server/clock'
import { route } from '@/server/route'
import { getHome } from '@/server/services/home'

export const GET = route(
  (_req, { user }): Promise<HomeResponse> =>
    db.transaction((tx) => getHome(tx, user, { today: serverToday(), now: serverNow() }), {
      isolationLevel: 'repeatable read',
      accessMode: 'read only',
    }),
)
