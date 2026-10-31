// GET /api/people/options — the people directory for any logged-in user (X09, X12, M2-D16): no email.
// Authz (AZ-2): authz.requireUser before the directory is read — any authenticated user; the route() wrapper's
// session + must-change gates run first. No project data is returned.
import type { PeopleOptionsResponse } from '@/lib/contracts/people'
import * as authz from '@/server/authz'
import { db } from '@/server/db/client'
import { route } from '@/server/route'
import * as services from '@/server/services'

export const GET = route(async (_req, { user }): Promise<PeopleOptionsResponse> => {
  authz.requireUser(user)
  return { people: await services.people.listPeopleOptions(db) }
})
