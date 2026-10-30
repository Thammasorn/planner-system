// Better Auth HTTP endpoints (SPEC §7.2). Sign-up, self-service profile/password changes and every /admin/* path
// answer 404 (DISABLED_AUTH_PATHS in src/server/auth.ts). Login/logout in the UI go through server actions.
import { toNextJsHandler } from 'better-auth/next-js'
import { auth } from '@/server/auth'

export const { GET, POST } = toNextJsHandler(auth)
