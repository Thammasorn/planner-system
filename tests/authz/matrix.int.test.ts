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
    // implied parts count (M7 GR-D-*/AL-D-* rows run on 'dayAllocations', which implies 'allocations')
    for (const r of m6) expect([...expandParts(r.with ?? [])], `${r.id} needs the allocations world`).toContain('allocations')
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

  it('M7 meta (plan/m07 §7.2): every GR-D-*, AL-D-* row exists, cites PERM-06/PERM-12, runs on the dayAllocations world; AL-DAYWEEK is 409', () => {
    const ids = new Set(rows.map((r) => r.id))
    const want = [
      ...['ZOOM', 'EXPAND', 'ARCH', 'BADQ', 'MISSING'].map((k) => `GR-D-${k}`),
      ...['SPLIT', 'SET', 'NEEDS', 'SCALE', 'COLLAPSE', 'CLEAR', 'MIXED', 'MAX', 'HIDDEN', 'ARCH', 'ARCH-COLLAPSE'].map(
        (k) => `AL-D-${k}`,
      ),
    ]
    expect(want.filter((id) => !ids.has(id)), 'missing M7 rows').toEqual([])
    const m7 = rows.filter((r) => /^(GR|AL)-D-/.test(r.id))
    for (const perm of ['PERM-06', 'PERM-12'])
      expect(m7.some((r) => new RegExp(`\\b${perm}\\b`).test(r.spec)), `${perm} has no M7 row`).toBe(true)
    for (const r of m7) expect(r.with ?? [], `${r.id} needs the dayAllocations world`).toContain('dayAllocations')
    for (const r of m7.filter((x) => x.mutates)) expect(r.audit, r.id).toMatchObject({ entity: 'allocation' })
    // no new action in M7 (M7-D2): only the grid route and saveAllocations
    expect(new Set(m7.map((r) => r.action))).toEqual(new Set(['GET /api/grid/project/[projectId]', 'saveAllocations']))
    // X27 flip (S4.5): the M6 row keeps its id and now expects NEEDS_CHOICE
    expect(rows.find((r) => r.id === 'AL-DAYWEEK')?.expect).toEqual({ M: '409', L: '409', Me: '409', W: '404' })
  })

  it('M7.1 meta (plan/m07.1 §7.2, S5.1; M11.1-D3): PREF-M7.1-* rows exist; no PM-* row is left (PERM-29 retired); M3 move rows still exist', () => {
    const ids = new Set(rows.map((r) => r.id))
    const want = ['VIEW', 'ASSIGNEES', 'WIDTH', 'CHART', 'BAD'].map((k) => `PREF-M7.1-${k}`)
    expect(want.filter((id) => !ids.has(id)), 'missing M7.1 rows').toEqual([])
    expect(rows.filter((r) => /^PM-/.test(r.id)).map((r) => r.id)).toEqual([])
    expect(rows.filter((r) => /\bPERM-29\b/.test(r.spec)).map((r) => r.id)).toEqual([])
    // PREF rows: every role writes its own row, never audited
    for (const r of rows.filter((x) => /^PREF-M7\.1-(VIEW|ASSIGNEES|WIDTH|CHART)$|^PREF-M11\.1-LOAD-DISPLAY$/.test(x.id))) {
      expect(r.expect, r.id).toEqual({ M: 'allow', L: 'allow', Me: 'allow', W: 'allow' })
      expect(r.audit, r.id).toBe(false)
    }
    // BR-105 / M7.1-D16: the grid reorder calls M3's moveTask — its PERM-11 rows must still exist
    for (const id of ['T-MOVE', 'T-MOVE-ARCH', 'T-MOVE-X'])
      expect(rows.find((r) => r.id === id)?.action, `${id} (M3 moveTask row)`).toBe('moveTask')
  })

  it('M8 meta (plan/m08 §7.2, S5.1): every MS-* and TT-MS* row exists, PERM-06/11/15 are cited, rows run on the milestones world; PERM-15 writes give Me 403', () => {
    const ids = new Set(rows.map((r) => r.id))
    const want = [
      ...['LIST', 'LIST-ARCH', 'TARGETS'].map((k) => `MS-${k}`),
      ...['CREATE', 'CREATE-ARCH', 'RENAME', 'MOVE', 'COMPLETE', 'UPDATE-ARCH', 'DELETE', 'DELETE-ARCH'].map((k) => `MS-${k}`),
      ...['RESTORE', 'RESTORE-EXPIRED', 'RESTORE-ARCH', 'Q', 'MISSING', 'BAD'].map((k) => `MS-${k}`),
      ...['LINK', 'UNLINK', 'LINK-CROSS', 'LINK-ARCH', 'REVERT'].map((k) => `MS-${k}`),
      'TT-MS',
      'TT-MS-Q',
      'TT-MS-DELETED',
    ]
    expect(want.filter((id) => !ids.has(id)), 'missing M8 rows').toEqual([])
    const m8 = rows.filter((r) => /^(MS|TT-MS)(-|$)/.test(r.id))
    for (const perm of ['PERM-06', 'PERM-11', 'PERM-15'])
      expect(m8.some((r) => new RegExp(`\\b${perm}\\b`).test(r.spec)), `${perm} has no M8 row`).toBe(true)
    for (const r of m8) expect(r.with ?? [], `${r.id} needs the milestones world`).toContain('milestones')
    // X44 / M8-D21: milestone writes audit `milestone`, bindings audit `task`
    const MILESTONE_WRITES = ['createMilestone', 'updateMilestone', 'deleteMilestone', 'restoreMilestoneBatch']
    for (const r of m8.filter((x) => x.mutates))
      expect(r.audit, r.id).toMatchObject({ entity: MILESTONE_WRITES.includes(r.action) ? 'milestone' : 'task' })
    // SPEC §3.2 "สร้าง/แก้/ลบ milestone": Me ดูได้ → every allowed-for-L milestone write on P is 403 for Me
    for (const r of m8.filter((x) => MILESTONE_WRITES.includes(x.action) && x.expect.L === 'allow' && x.id !== 'MS-Q'))
      expect(r.expect, r.id).toEqual({ M: 'allow', L: 'allow', Me: '403', W: '404' })
    // M8-D4: binding = PERM-11, so Me may bind on P
    for (const id of ['MS-LINK', 'MS-UNLINK', 'MS-REVERT'])
      expect(rows.find((r) => r.id === id)?.expect, id).toEqual({ M: 'allow', L: 'allow', Me: 'allow', W: '404' })
    // M8-D3: exactly the six actions + the two new routes + the M3 team-tasks route (milestoneId filter)
    expect(new Set(m8.map((r) => r.action))).toEqual(
      new Set([
        'GET /api/projects/[id]/milestones',
        'GET /api/milestones/targets',
        'GET /api/tasks',
        ...MILESTONE_WRITES,
        'linkTasksToMilestone',
        'revertTaskMilestones',
      ]),
    )
  })

  it('M9 meta (plan/m09 §7.2, S5.1): every WL-*, PEOPLE, PGRID-*, PH-*, PT-*, PJ-LOAD-*, CL-LOAD-* and AL-PERSON row exists, PERM-04/06/12/22 are cited, rows run on the allocations + milestones world; M9 adds no action', () => {
    const ids = new Set(rows.map((r) => r.id))
    const want = [
      ...['TABLE', 'DEFAULT', 'PROJ-P', 'PROJ-Q', 'PROJ-MISSING', 'BADQ', 'SPAN'].map((k) => `WL-${k}`),
      ...['ME', 'W', 'CO', 'MISSING', 'BADQ'].map((k) => `WL-CELL-${k}`),
      'WL-BADGE',
      'PEOPLE',
      ...['ME', 'W', 'CO', 'DEFAULT', 'MISSING', 'BADID', 'BADQ'].map((k) => `PGRID-${k}`),
      ...['ME', 'W', 'MISSING'].map((k) => `PH-${k}`),
      ...['ME', 'W', 'MISSING'].map((k) => `PT-${k}`),
      'PJ-LOAD',
      ...['ARCH', 'MISSING', 'BADID'].map((k) => `PJ-LOAD-${k}`),
      ...['C1', 'C2', 'MISSING'].map((k) => `CL-LOAD-${k}`),
      'AL-PERSON',
    ]
    expect(want.filter((id) => !ids.has(id)), 'missing M9 rows').toEqual([])
    const m9 = rows.filter((r) => /^(WL|PGRID|PH|PT|PJ-LOAD|CL-LOAD)(-|$)/.test(r.id) || ['PEOPLE', 'AL-PERSON'].includes(r.id))
    for (const perm of ['PERM-04', 'PERM-06', 'PERM-12', 'PERM-22'])
      expect(m9.some((r) => new RegExp(`\\b${perm}\\b`).test(r.spec)), `${perm} has no M9 row`).toBe(true)
    for (const r of m9) {
      const parts = [...expandParts(r.with ?? [])]
      expect(parts, `${r.id} needs the allocations world`).toContain('allocations')
      expect(parts, `${r.id} needs the milestones world`).toContain('milestones')
    }
    // X44 / M9-D24: no new action — the only write is M6's saveAllocations with its allocation audit row of P
    const writes = m9.filter((r) => r.mutates)
    expect(writes.map((r) => r.id)).toEqual(['AL-PERSON'])
    expect(writes[0]!.audit).toMatchObject({ entity: 'allocation' })
    expect(new Set(m9.map((r) => r.action))).toEqual(
      new Set([
        'GET /api/workload',
        'GET /api/workload/cell',
        'GET /api/workload/badge',
        'GET /api/grid/person/[userId]',
        'GET /api/people',
        'GET /api/people/[userId]/time-off',
        'GET /api/projects/[id]/load',
        'GET /api/clients/[id]/load',
        'services.people.getPersonHeader',
        'saveAllocations',
      ]),
    )
    // §3.3 visibility (X43): the outsider never reaches the member, and the member never reaches the outsider
    for (const id of ['WL-CELL-ME', 'PGRID-ME', 'PH-ME', 'PT-ME'])
      expect(rows.find((r) => r.id === id)?.expect, id).toEqual({ M: 'allow', L: 'allow', Me: 'allow', W: '404' })
    for (const id of ['WL-CELL-W', 'PGRID-W', 'PH-W', 'PT-W'])
      expect(rows.find((r) => r.id === id)?.expect, id).toEqual({ M: 'allow', L: 'allow', Me: '404', W: 'allow' })
  })

  it('M10 meta (plan/m10 §7.2, S4.1): every HM-*, SR-* and EMB-* row exists on the home world; M10 adds no action and no 403', () => {
    const ids = new Set(rows.map((r) => r.id))
    const embed = ['P', 'Q', 'A', 'WIKI', 'PROT', 'DEL', 'BAD']
    const want = [
      'HM-HOME',
      'SR-ALL',
      'SR-INDEX',
      'SR-LONG',
      'SR-PAGES',
      'SR-TITLE-ONLY',
      'SR-EMPTY',
      ...embed.map((k) => `EMB-T-${k}`),
      ...embed.map((k) => `EMB-W-${k}`),
    ]
    expect(want.filter((id) => !ids.has(id)), 'missing M10 rows').toEqual([])
    const m10 = rows.filter((r) => /^(HM|EMB)-/.test(r.id) || ['SR-ALL', 'SR-INDEX', 'SR-LONG'].includes(r.id))
    for (const perm of ['PERM-04', 'PERM-06', 'PERM-16', 'PERM-17', 'PERM-22'])
      expect(m10.some((r) => new RegExp(`\\b${perm}\\b`).test(r.spec)), `${perm} has no M10 row`).toBe(true)
    // the *-BAD rows answer before any query; every other row runs on the home world (S0.12)
    for (const r of m10.filter((x) => !x.id.endsWith('-BAD')))
      expect(r.with ?? [], `${r.id} needs the home world`).toContain('home')
    // X44 / FR-1201: no new mutating action in M10
    expect(m10.filter((r) => r.mutates).map((r) => r.id)).toEqual([])
    // X41: every M10 route is a read — invisible → 404, never 403
    for (const r of m10) for (const role of ROLES) expect(r.expect[role], `${r.id} ${role}`).not.toBe('403')
    expect(new Set(m10.map((r) => r.action))).toEqual(
      new Set([
        'GET /api/home',
        'GET /api/search',
        'GET /api/search/index',
        'GET /api/pages/[id]/embed/tasks',
        'GET /api/pages/[id]/embed/workload',
      ]),
    )
    // §3.2 visibility of the embed rows (X41/X42/X63)
    for (const k of ['T', 'W']) {
      expect(rows.find((r) => r.id === `EMB-${k}-P`)?.expect).toEqual({ M: 'allow', L: 'allow', Me: 'allow', W: '404' })
      expect(rows.find((r) => r.id === `EMB-${k}-A`)?.expect).toEqual({ M: 'allow', L: 'allow', Me: 'allow', W: '404' })
      expect(rows.find((r) => r.id === `EMB-${k}-Q`)?.expect).toEqual({ M: 'allow', L: '404', Me: '404', W: 'allow' })
      for (const id of ['WIKI', 'PROT'])
        expect(rows.find((r) => r.id === `EMB-${k}-${id}`)?.expect).toEqual({ M: 'allow', L: 'allow', Me: 'allow', W: 'allow' })
    }
  })

  it('M11 meta (plan/m11 §7.2, S6.1): every DB-*, ROW-*, COL-*, VIEW-*, RP-*, RB-*, FW-ROW*, PG-*-DB and SR-DB-* row exists on the databases world; PERM-24…26 are cited; audits per M11-D5', () => {
    const ids = new Set(rows.map((r) => r.id))
    const want = [
      ...['GET', 'GET-ARCH', 'GET-WIKI', 'GET-WIKIPROT', 'GET-TASK', 'GET-DETACHED', 'GET-WRONGPAGE', 'GET-DELETEDPAGE']
        .map((k) => `DB-${k}`),
      ...['GET-MISSING', 'GET-BAD', 'CREATE', 'CREATE-ARCH', 'CREATE-WIKI', 'CREATE-WIKIPROT', 'CREATE-TASK'].map((k) => `DB-${k}`),
      ...['CREATE-ROWBODY', 'CREATE-LIMIT', 'CREATE-BAD', 'COPY', 'COPY-TO-ARCH', 'COPY-FROM-ARCH', 'COPY-TO-Q'].map((k) => `DB-${k}`),
      ...['COPY-FROM-Q', 'COPY-MISMATCH', 'COPY-TO-WIKIPROT', 'COPY-TO-ROWBODY', 'RENAME', 'RENAME-STALE'].map((k) => `DB-${k}`),
      ...['RENAME-ARCH', 'RENAME-WIKIPROT'].map((k) => `DB-${k}`),
      ...['CREATE', 'CREATE-51', 'CREATE-FULL', 'CREATE-WIKI', 'UPDATE', 'UPDATE-LEASED', 'UPDATE-STALE'].map((k) => `ROW-${k}`),
      ...['UPDATE-BADTYPE', 'UPDATE-URL-JS', 'UPDATE-INACTIVE', 'UPDATE-DELCOL', 'UPDATE-ARCH', 'UPDATE-WIKIPROT'].map((k) => `ROW-${k}`),
      ...['DELETE', 'DELETE-MIXED', 'RESTORE'].map((k) => `ROW-${k}`),
      ...['CREATE', 'UPDATE', 'DUP', 'LIMIT', 'TYPE', 'TYPE-TITLE', 'REVERT', 'REVERT-FORGED', 'DELETE', 'RESTORE'].map((k) => `COL-${k}`),
      ...['DELETE-TITLE', 'ARCH'].map((k) => `COL-${k}`),
      ...['CREATE', 'UPDATE', 'DELETE', 'RESTORE', 'UPDATE-WIKIPROT', 'UPDATE-BADCOL', 'DELETE-LAST', 'LIMIT'].map((k) => `VIEW-${k}`),
      ...['LOADER', 'LOADER-WIKI', 'LOADER-ARCH', 'LOADER-MISSING'].map((k) => `RP-${k}`),
      ...['GET', 'GET-NONE', 'GET-DELETED', 'GET-BAD', 'ENSURE', 'ENSURE-EXISTING', 'ENSURE-ARCH', 'ENSURE-WIKIPROT'].map((k) => `RB-${k}`),
      ...['PAGE-GET', 'SAVE', 'SAVE-DB', 'SAVE-SUBPAGE', 'SAVE-ARCH', 'KEEPALIVE', 'LOCK-GET', 'LOCK-POST', 'LOCK-DELETE'].map((k) => `RB-${k}`),
      ...['UPLOAD', 'FILE-GET'].map((k) => `RB-${k}`),
      ...['TREE', 'RENAME', 'ICON', 'COVER', 'PROTECT', 'TEMPLATE', 'MOVE', 'DUP', 'DELETE', 'CREATE-CHILD'].map((k) => `RB-DOCAPI-${k}`),
      'FW-ROW',
      'FW-ROW-WIKIPROT',
      'FW-ROW-ARCH',
      'PG-SAVE-DETACH',
      'PG-DUP-DB',
      ...['ROW', 'TITLE', 'BODY', 'WIKI', 'TITLEONLY'].map((k) => `SR-DB-${k}`),
    ]
    expect(want.filter((id) => !ids.has(id)), 'missing M11 rows').toEqual([])
    const m11 = rows.filter((r) => /^(DB|ROW|COL|VIEW|RP|RB|FW-ROW|SR-DB)(-|$)/.test(r.id) || /^PG-.*-DB$|^PG-SAVE-(DETACH|REATTACH)$/.test(r.id))
    for (const perm of ['PERM-24', 'PERM-25', 'PERM-26'])
      expect(m11.some((r) => new RegExp(`\\b${perm}\\b`).test(r.spec)), `${perm} has no M11 row`).toBe(true)
    for (const r of m11) expect([...expandParts(r.with ?? [])], `${r.id} needs the databases world`).toContain('databases')
    // M11-D5 / X44: the §7.9 actions audit `database`; row bodies audit `page` (files: `file`); leases and an ensure without
    // insert are not audited
    const DB_ACTIONS = /^(create|copy|rename|update|delete|restore|duplicate|change|revert)Database/
    for (const r of m11.filter((x) => x.mutates && DB_ACTIONS.test(x.action)))
      expect(r.audit, r.id).toMatchObject({ entity: 'database' })
    for (const r of m11.filter((x) => x.mutates && !DB_ACTIONS.test(x.action) && x.audit !== false))
      expect(['page', 'file'], r.id).toContain((r.audit as { entity: string }).entity)
    expect(rows.find((r) => r.id === 'RB-ENSURE-EXISTING')?.audit).toBe(false)
    // FR-1453 / FR-682: every page-tree API addressed at a DB_ROW page is a 404 for everyone
    for (const r of m11.filter((x) => x.id.startsWith('RB-DOCAPI-')))
      expect(r.expect, r.id).toEqual({ M: '404', L: '404', Me: '404', W: '404' })
    // PERM-24/25: the outsider never reaches a P / A database (only wiki, Q and zod-level 400 rows differ)
    const wReaches = /-(WIKI|WIKIPROT)$|^DB-COPY-FROM-Q$/
    for (const r of m11.filter((x) => !wReaches.test(x.id) && !x.id.startsWith('SR-DB-')))
      expect(['404', '400'], `${r.id} W`).toContain(r.expect.W)
    // X42: every write on archived A is 403 for its team, 404 for W
    for (const r of m11.filter((x) => x.mutates && /-ARCH(-|$)/.test(x.id) && x.id !== 'DB-COPY-FROM-ARCH'))
      expect(r.expect, r.id).toEqual({ M: '403', L: '403', Me: '403', W: '404' })
    // FR-510: writes on a locked wiki database are the manager's only
    for (const r of m11.filter((x) => x.mutates && /-WIKIPROT$/.test(x.id) && x.id !== 'DB-COPY-TO-WIKIPROT'))
      expect(r.expect, r.id).toEqual({ M: 'allow', L: '403', Me: '403', W: '403' })
    // FR-1464: wrong page / missing / deleted page → one 404 for everyone
    for (const id of ['DB-GET-WRONGPAGE', 'DB-GET-DELETEDPAGE', 'DB-GET-MISSING', 'DB-GET-BAD', 'DB-COPY-MISMATCH'])
      expect(rows.find((r) => r.id === id)?.expect, id).toEqual({ M: '404', L: '404', Me: '404', W: '404' })
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
        const audit = row.audit!
        const n = audit.count ?? 1
        expect(added).toHaveLength(n)
        if (n === 1) {
          const p = audit.projectId
          expect(added[0]).toMatchObject({
            entity: audit.entity,
            actorId: actor.id,
            ...(p === 'any' ? {} : { projectId: p ? p(w, ctx) : null }),
          })
        } else {
          // X44: one row per changed assignment of the batch (M7 AL-D-HIDDEN)
          for (const a of added) expect(a).toMatchObject({ entity: audit.entity, actorId: actor.id })
          if (audit.projectIds)
            expect(added.map((a) => a.projectId ?? '').sort()).toEqual(
              audit.projectIds(w, ctx).map((x) => x ?? '').sort(),
            )
        }
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
