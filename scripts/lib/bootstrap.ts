// scripts/lib/bootstrap.ts — first-run setup (FR-102, SPEC §10.4 steps 1 + 3). Idempotent: creates the first
// manager only when there are no users (never touches existing passwords) and the default positions only when there
// are none; backfills the default task statuses of older projects (M3, X70). Never prints the password or its hash.
// M4 adds ensureProjectCharters() (scripts/bootstrap.ts); M5 (§10.4 step 2, M5-D12) the 4 default leave types when
// the table is empty. Holidays are never seeded (§10.4 step 4 / DEP-11: imported by the manager, X64).
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
  /** Default leave types created on this run (4 on an empty table, else 0 — M5-D12). */
  seededLeaveTypes: number
  /** Projects that got the FR-621 default statuses on this run (X70). */
  backfilledStatusProjects: number
  warnings: string[]
  /** Set when the run must exit non-zero (e.g. INITIAL_MANAGER_* missing in production or invalid). */
  fatal?: string
}

type Log = Pick<Console, 'info' | 'warn' | 'error'>

export async function runBootstrap(
  db: Db,
  env: NodeJS.ProcessEnv,
  log: Log = console,
): Promise<BootstrapResult> {
  const result: BootstrapResult = {
    createdManager: false,
    seededPositions: 0,
    seededLeaveTypes: 0,
    backfilledStatusProjects: 0,
    warnings: [],
  }
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
    // §10.4 step 2 (M5-D12): ลาพักร้อน, ลาป่วย, ลากิจ, อบรม/สัมมนา — only when there is no leave type at all.
    result.seededLeaveTypes = await services.leaveTypes.ensureDefaultLeaveTypes(tx, null)
    // X70: projects created before M3 get the 5 default task statuses (idempotent).
    result.backfilledStatusProjects = await services.taskStatuses.ensureAllProjectStatuses(tx)
  })

  if (userCount > 0) log.info('[bootstrap] users exist — skipped')
  else if (result.createdManager)
    log.info('[bootstrap] first manager created (must change password at first login)')
  log.info(
    result.seededPositions > 0
      ? `[bootstrap] ${result.seededPositions} default positions created`
      : '[bootstrap] positions exist — skipped',
  )
  log.info(
    result.seededLeaveTypes > 0
      ? `[bootstrap] ${result.seededLeaveTypes} default leave types created`
      : '[bootstrap] leave types exist — skipped',
  )
  return result
}
