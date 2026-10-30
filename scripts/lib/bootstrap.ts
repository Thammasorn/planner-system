// scripts/lib/bootstrap.ts — first-run setup (FR-102, SPEC §10.4 steps 1 + 3). Idempotent: creates the first
// manager only when there are no users (never touches existing passwords) and the default positions only when there
// are none. Never prints the password or its hash. M4 adds ensureProjectCharters(), M5 the 4 leave types.
import { hashPassword } from 'better-auth/crypto'
import { createEmployeeInput } from '@/lib/schemas/employees'
import type { Db } from '@/server/db/types'
import * as repo from '@/server/repo'
import * as services from '@/server/services'

export const DEFAULT_POSITIONS = [
  'Project Manager',
  'Developer',
  'Designer',
  'QA',
  'Data',
  'Business Analyst',
] as const

export interface BootstrapResult {
  createdManager: boolean
  seededPositions: number
  warnings: string[]
  /** Set when the run must exit non-zero (e.g. INITIAL_MANAGER_* missing in production or invalid). */
  fatal?: string
}

type Log = Pick<Console, 'info' | 'warn' | 'error'>

export async function runBootstrap(db: Db, env: NodeJS.ProcessEnv, log: Log = console): Promise<BootstrapResult> {
  const result: BootstrapResult = { createdManager: false, seededPositions: 0, warnings: [] }
  const warn = (msg: string) => {
    result.warnings.push(msg)
    log.warn(`[bootstrap] ${msg}`)
  }
  const production = env.NODE_ENV === 'production'
  if (production && (env.ALLOW_TEST_HOOKS === '1' || env.APP_NOW)) {
    warn('ALLOW_TEST_HOOKS/APP_NOW set in production — test-only settings')
  }

  // Validate and hash before the transaction (scrypt is slow); only when a manager may be needed.
  const userCount = await repo.users.countUsers(db)
  let manager: Parameters<typeof services.employees.createEmployee>[2] | null = null
  if (userCount === 0) {
    const email = env.INITIAL_MANAGER_EMAIL?.trim()
    const name = env.INITIAL_MANAGER_NAME?.trim()
    const password = env.INITIAL_MANAGER_PASSWORD
    if (!email || !name || !password) {
      const msg = 'no users and INITIAL_MANAGER_EMAIL/NAME/PASSWORD not all set — first manager not created'
      if (production) {
        result.fatal = msg
        log.error(`[bootstrap] ${msg}`)
        return result
      }
      warn(msg)
    } else {
      const parsed = createEmployeeInput.safeParse({
        name,
        email,
        password,
        role: 'manager',
        positionId: null,
        mustChangePassword: true,
      })
      if (!parsed.success) {
        const fields = [...new Set(parsed.error.issues.map((i) => String(i.path[0] ?? '?')))].join(', ')
        result.fatal = `INITIAL_MANAGER_* invalid: ${fields}` // field names only, never values
        log.error(`[bootstrap] ${result.fatal}`)
        return result
      }
      const { password: plain, ...data } = parsed.data
      manager = { ...data, passwordHash: await hashPassword(plain) }
    }
  }

  await db.transaction(async (tx) => {
    // Re-check inside the tx so two concurrent runs cannot both create a manager / positions.
    if (manager && (await repo.users.countUsers(tx)) === 0) {
      await services.employees.createEmployee(tx, null, manager)
      result.createdManager = true
    }
    if ((await repo.positions.countPositions(tx)) === 0) {
      for (const name of DEFAULT_POSITIONS) await services.positions.createPosition(tx, null, { name })
      result.seededPositions = DEFAULT_POSITIONS.length
    }
  })

  if (userCount > 0) log.info('[bootstrap] users exist — skipped')
  else if (result.createdManager) log.info('[bootstrap] first manager created (must change password at first login)')
  log.info(
    result.seededPositions > 0
      ? `[bootstrap] ${result.seededPositions} default positions created`
      : '[bootstrap] positions exist — skipped',
  )
  return result
}
