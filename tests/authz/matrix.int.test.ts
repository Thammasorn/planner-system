// tests/authz/matrix.int.test.ts — rows × roles (PLAN.md §4.4, SPEC §11.2). Rows live in tests/authz/rows/*.ts.
import { readdirSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { asNobody, asUser } from '../helpers/as-user'
import { auditCount, auditRowsAfter } from '../helpers/audit'
import { outcomeOf } from '../helpers/outcome'
import { createWorld, type World } from '../helpers/world'
import { rows } from './rows'
import type { Role } from './types'

const USER_OF: Record<Role, 'manager' | 'lead' | 'member' | 'outsider'> = {
  M: 'manager',
  L: 'lead',
  Me: 'member',
  W: 'outsider',
}
const ROLES = ['M', 'L', 'Me', 'W'] as const
const isBetterAuthRow = (id: string) => id.startsWith('BA-')

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

  describe.each(rows)('$id · $action', (row) => {
    it.each(ROLES)('%s', async (role) => {
      const w: World = await createWorld({ with: row.with ?? [] })
      const actor = w[USER_OF[role]]
      const ctx = row.setup ? await row.setup(w, actor) : undefined
      if (!isBetterAuthRow(row.id)) asUser(actor) // BA-* rows authenticate with real cookies
      const before = await auditCount()
      const outcome = outcomeOf(await row.run(w, ctx, actor))
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
    })

    it.skipIf(isBetterAuthRow(row.id))('nobody → 401', async () => {
      const w = await createWorld({ with: row.with ?? [] })
      const ctx = row.setup ? await row.setup(w, w.manager) : undefined
      asNobody()
      expect(outcomeOf(await row.run(w, ctx, w.manager))).toBe('401')
    })

    it.skipIf(isBetterAuthRow(row.id))('mustChangePassword → 403 unless allowed', async () => {
      const w = await createWorld({ with: row.with ?? [] })
      const ctx = row.setup ? await row.setup(w, w.manager) : undefined
      asUser(w.manager, { mustChangePassword: true })
      const expected = row.allowMustChange ? row.expect.M : '403'
      expect(outcomeOf(await row.run(w, ctx, w.manager))).toBe(expected)
    })
  })
})
