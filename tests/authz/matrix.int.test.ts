// tests/authz/matrix.int.test.ts — rows × roles (PLAN.md §4.4, SPEC §11.2). Rows live in tests/authz/rows/*.ts.
import { readdirSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { asNobody, asUser } from '../helpers/as-user'
import { auditCount, auditRowsAfter } from '../helpers/audit'
import { outcomeOf } from '../helpers/outcome'
import { createWorld, expandParts, type World } from '../helpers/world'
import { rows } from './rows'
import type { AuthzRow, Outcome, Role } from './types'

const USER_OF: Record<Role, 'manager' | 'lead' | 'member' | 'outsider'> = {
  M: 'manager',
  L: 'lead',
  Me: 'member',
  W: 'outsider',
}
const ROLES = ['M', 'L', 'Me', 'W'] as const
const isBetterAuthRow = (id: string) => id.startsWith('BA-')

/** Loader rows (M2) already return an Outcome; action and route rows go through outcomeOf. */
const outcomeOfRun = (r: Awaited<ReturnType<AuthzRow['run']>>): Outcome =>
  typeof r === 'string' ? r : outcomeOf(r)

/** Exported actions covered outside the matrix because they need real cookies (tests/integration/auth.int.test.ts,
 *  tests/integration/lockout.int.test.ts, src/server/actions/auth.int.test.ts). */
const ACTION_ALLOWLIST = ['login', 'logout'] as const
const ACTIONS_DIR = path.resolve(process.cwd(), 'src/server/actions')
/** Route rows ('<METHOD> /api/…') and loader rows ('services.…') are checked by M2's AZ-2, not here. */
const isActionName = (action: string) => /^[a-z][A-Za-z0-9]*$/.test(action)

async function exportedActions(): Promise<Map<string, string>> {
  const out = new Map<string, string>() // name → file
  const files = readdirSync(ACTIONS_DIR).filter((f) => f.endsWith('.ts') && !f.includes('.test.'))
  for (const file of files) {
    const mod = (await import(path.join(ACTIONS_DIR, file))) as Record<string, unknown>
    for (const [name, value] of Object.entries(mod)) if (typeof value === 'function') out.set(name, file)
  }
  return out
}

describe('authz matrix', () => {
  it('T-META-01 every exported server action has a matrix row (or is allowlisted), and every action row exists', async () => {
    const actions = await exportedActions()
    expect(actions.size).toBeGreaterThan(0)
    const covered = new Set<string>([...rows.map((r) => r.action), ...ACTION_ALLOWLIST])
    const missing = [...actions].filter(([name]) => !covered.has(name)).map(([n, f]) => `${f} › ${n}`)
    expect(missing, 'actions without an authz row').toEqual([])
    const unknown = rows.filter((r) => isActionName(r.action) && !actions.has(r.action)).map((r) => r.id)
    expect(unknown, 'rows naming an action that is not exported').toEqual([])
  })

  it('rows have unique ids and every mutating row declares audit', () => {
    const ids = rows.map((r) => r.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const r of rows) {
      if (r.mutates) expect(r.audit, `${r.id} must declare audit (or audit: false)`).toBeDefined()
      for (const role of ROLES) expect(r.expect[role], `${r.id} expect.${role}`).toBeDefined()
    }
  })

  it('M4 meta (plan/m04 S4.1): PERM-16…19 each have rows; M4 rows need world parts and declare audit', () => {
    for (const perm of ['PERM-16', 'PERM-17', 'PERM-18', 'PERM-19'])
      expect(rows.some((r) => new RegExp(`\\b${perm}\\b`).test(r.spec)), `${perm} has no row`).toBe(true)
    const m4 = rows.filter((r) => /^(PG|WK|FL|SR)-/.test(r.id))
    expect(m4.length).toBeGreaterThan(0)
    for (const r of m4) {
      // implied parts count (M6.1 SR-TASKS-* rows run on 'taskBodies', which implies 'pages')
      expect([...expandParts(r.with ?? [])], `${r.id} needs the pages world`).toContain('pages')
      if (r.mutates) expect(r.audit, `${r.id} must declare audit (or audit: false)`).toBeDefined()
    }
  })

  it('M5 meta (plan/m05 §7.2): PERM-02f…02p, PERM-20a…e, PERM-21a…g and PERM-22a exist; M5 rows need the timeOff world', () => {
    const ids = new Set(rows.map((r) => r.id))
    const want = [
      ...'fghijklmnop'.split('').map((c) => `PERM-02${c}`),
      ...'abcde'.split('').map((c) => `PERM-20${c}`),
      ...'abcdefg'.split('').map((c) => `PERM-21${c}`),
      'PERM-22a',
      'LT-READ',
      'TO-400',
      'CAL-400',
    ]
    expect(want.filter((id) => !ids.has(id)), 'missing M5 rows').toEqual([])
    const m5 = rows.filter((r) => /^(PERM-02[f-p]|PERM-2[0-2][a-z]|LT-|TO-|CAL-)/.test(r.id))
    for (const r of m5) expect(r.with ?? [], `${r.id} needs the timeOff world`).toContain('timeOff')
  })

  it('M6 meta (plan/m06 §7.2): every GR-*, AL-*, PR-* row exists, cites PERM-06/PERM-12 or its X ruling, needs the allocations world', () => {
    const ids = new Set(rows.map((r) => r.id))
    const want = [
      ...['READ', 'ARCH', 'OTHERS', 'DEFAULT', 'MISSING', 'BADID', 'BADQ', 'SPAN'].map((k) => `GR-${k}`),
      ...['SAVE', 'CLEAR', 'COLLAPSE', 'DAYWEEK', 'STALE', 'ARCH', 'MIXED-ARCH', 'MISSING', 'BAD'].map((k) => `AL-${k}`),
      ...['PREVIEW', 'APPLY', 'UNREP', 'ARCH'].map((k) => `PR-${k}`),
    ]
    expect(want.filter((id) => !ids.has(id)), 'missing M6 rows').toEqual([])
    const m6 = rows.filter((r) => /^(GR|AL|PR)-/.test(r.id))
    for (const perm of ['PERM-06', 'PERM-12'])
      expect(m6.some((r) => new RegExp(`\\b${perm}\\b`).test(r.spec)), `${perm} has no M6 row`).toBe(true)
    for (const r of m6) expect(r.with ?? [], `${r.id} needs the allocations world`).toContain('allocations')
    // X44: every allowed single-item plan write audits one `allocation` row of P
    for (const r of m6.filter((x) => x.mutates)) expect(r.audit, r.id).toMatchObject({ entity: 'allocation' })
    expect(new Set(m6.map((r) => r.action))).toEqual(
      new Set(['GET /api/grid/project/[projectId]', 'saveAllocations', 'planAssignmentRange']),
    )
  })

  it('M6.1 meta (plan/m06.1 §7.2): every TP-*, TB-*, FW-*, SR-TASKS-* row and T-UPDATE-NOTES exist, PERM-27/28 are cited, rows need the taskBodies world', () => {
    const ids = new Set(rows.map((r) => r.id))
    const want = [
      ...['LOADER', 'LOADER-ARCH', 'LOADER-MISSING', 'LOADER-BAD'].map((k) => `TP-${k}`),
      ...['GET', 'GET-NONE', 'GET-ARCH', 'GET-BAD', 'GET-DELETED', 'ENSURE', 'ENSURE-EXISTING', 'ENSURE-ARCH', 'ENSURE-BAD']
        .map((k) => `TB-${k}`),
      ...['PAGE-GET', 'SAVE', 'SAVE-ARCH', 'SAVE-SUBPAGE', 'KEEPALIVE', 'LOCK-GET', 'LOCK-POST', 'LOCK-POST-ARCH', 'LOCK-DELETE']
        .map((k) => `TB-${k}`),
      ...['UPLOAD', 'UPLOAD-ARCH', 'FILE-GET', 'TREE-PARENT', 'RENAME', 'ICON', 'COVER', 'PROTECT', 'TEMPLATE', 'MOVE', 'DUP']
        .map((k) => `TB-${k}`),
      ...['DELETE', 'CREATE-CHILD', 'RESTORE-PAGEBATCH'].map((k) => `TB-${k}`),
      ...['DOC', 'DOC-ARCH', 'WIKI', 'WIKI-PROT', 'TASK', 'TASK-NEW', 'TASK-ARCH', 'BAD'].map((k) => `FW-${k}`),
      ...['NAME', 'BODY', 'TITLEONLY'].map((k) => `SR-TASKS-${k}`),
      'T-UPDATE-NOTES',
    ]
    expect(want.filter((id) => !ids.has(id)), 'missing M6.1 rows').toEqual([])
    const m61 = rows.filter((r) => /^(TP|TB|FW|SR-TASKS)-/.test(r.id) || r.id === 'T-UPDATE-NOTES')
    for (const perm of ['PERM-27', 'PERM-28'])
      expect(m61.some((r) => new RegExp(`\\b${perm}\\b`).test(r.spec)), `${perm} has no M6.1 row`).toBe(true)
    for (const r of m61) {
      expect(r.with ?? [], `${r.id} needs the taskBodies world`).toContain('taskBodies')
      if (r.mutates) expect(r.audit, `${r.id} must declare audit (or audit: false)`).toBeDefined()
    }
    // FR-682 / M6.1-D4: every page API addressed at a TASK page is a 404 for everyone
    for (const r of m61.filter((x) => /^TB-(TREE-PARENT|RENAME|ICON|COVER|PROTECT|TEMPLATE|MOVE|DUP|DELETE|CREATE-CHILD|RESTORE-PAGEBATCH)/.test(x.id)))
      expect(r.expect, r.id).toEqual({ M: '404', L: '404', Me: '404', W: '404' })
    // PERM-27/28: the outsider never sees a P task body
    for (const r of m61.filter((x) => /^(TP-LOADER|TB-(GET|ENSURE|PAGE-GET|SAVE|KEEPALIVE|LOCK|UPLOAD|FILE)|FW-TASK)/.test(x.id)))
      expect(['404', '400'], `${r.id} W`).toContain(r.expect.W)
  })

  describe.each(rows)('$id · $action', (row) => {
    it.each(ROLES)('%s', async (role) => {
      const w: World = await createWorld({ with: row.with ?? [] })
      const actor = w[USER_OF[role]]
      const ctx = row.setup ? await row.setup(w, actor) : undefined
      if (!isBetterAuthRow(row.id)) asUser(actor) // BA-* rows authenticate with real cookies
      const before = await auditCount()
      const outcome = outcomeOfRun(await row.run(w, ctx, actor))
      expect(outcome).toBe(row.expect[role])
      if (row.mutates && outcome === 'allow' && row.audit !== false) {
        const added = await auditRowsAfter(before)
        expect(added).toHaveLength(1)
        const audit = row.audit!
        const p = audit.projectId
        expect(added[0]).toMatchObject({
          entity: audit.entity,
          actorId: actor.id,
          ...(p === 'any' ? {} : { projectId: p ? p(w, ctx) : null }),
        })
      }
      // X44 exceptions (leases, preferences): an allowed `audit: false` mutation must not write any audit row —
      // e.g. a lease heartbeat that audited every 30 s would fail here.
      if (row.mutates && outcome === 'allow' && row.audit === false) {
        expect(await auditRowsAfter(before)).toEqual([])
      }
    })

    it.skipIf(isBetterAuthRow(row.id))('nobody → 401', async () => {
      const w = await createWorld({ with: row.with ?? [] })
      const ctx = row.setup ? await row.setup(w, w.manager) : undefined
      asNobody()
      expect(outcomeOfRun(await row.run(w, ctx, w.manager))).toBe('401')
    })

    it.skipIf(isBetterAuthRow(row.id))('mustChangePassword → 403 unless allowed', async () => {
      const w = await createWorld({ with: row.with ?? [] })
      const ctx = row.setup ? await row.setup(w, w.manager) : undefined
      asUser(w.manager, { mustChangePassword: true })
      const expected = row.allowMustChange ? row.expect.M : '403'
      expect(outcomeOfRun(await row.run(w, ctx, w.manager))).toBe(expected)
    })
  })
})
