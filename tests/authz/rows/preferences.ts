// X05 user_preferences (M1-D17): every signed-in user writes only their own row; not audited (X44 exception).
import { eq } from 'drizzle-orm'
import { expect } from 'vitest'
import type { ActionResult, Ok } from '@/lib/action-result'
import type { PreferenceInput } from '@/lib/schemas/preferences'
import { setPreference } from '@/server/actions/preferences'
import { db } from '@/server/db/client'
import { userPreferences } from '@/server/db/schema'
import type { TestUser } from '../../helpers/factories'
import { defineRow, type AuthzRow } from '../types'

const ALL = { M: 'allow', L: 'allow', Me: 'allow', W: 'allow' } as const

/** setPreference, then (on success) the stored value of the actor's own row equals the input (M7.1 keys, X53/X59). */
async function setAndStored(actor: TestUser, input: PreferenceInput): Promise<ActionResult<object>> {
  const r: ActionResult<Ok> = await setPreference(input)
  if (r.ok) {
    const [row] = await db.select().from(userPreferences).where(eq(userPreferences.userId, actor.id))
    expect(row?.data[input.key], `${input.key} stored`).toEqual(input.value)
  }
  return r
}

/** M7.1 (plan/m07.1 §7.2 PREF-M7.1 ×4, M7.1-D22): one allow row per new key, all roles, not audited. */
const M7_1_KEYS: { id: string; input: PreferenceInput }[] = [
  { id: 'PREF-M7.1-VIEW', input: { key: 'plan.view', value: 'CALENDAR' } },
  { id: 'PREF-M7.1-ASSIGNEES', input: { key: 'grid.showAssignees', value: false } },
  { id: 'PREF-M7.1-WIDTH', input: { key: 'grid.taskColumnWidth', value: 420 } },
  { id: 'PREF-M7.1-CHART', input: { key: 'grid.chart', value: true } },
]

export const rows: AuthzRow[] = [
  defineRow({
    id: 'PREF-01',
    spec: 'X05 setPreference theme (own row)',
    action: 'setPreference',
    mutates: true,
    audit: false,
    expect: { M: 'allow', L: 'allow', Me: 'allow', W: 'allow' },
    run: () => setPreference({ key: 'theme', value: 'dark' }),
  }),
  defineRow({
    id: 'PREF-02',
    spec: 'X05 setPreference unknown key → VALIDATION',
    action: 'setPreference',
    mutates: false,
    expect: { M: '400', L: '400', Me: '400', W: '400' },
    // A key no milestone defines: zod's discriminated union rejects it. (M1 used 'grid.unit', which M6 made a real
    // key — M6-D21; plan/m06 S0.5 inverts that example, so the row now uses a key that will never exist.)
    run: () => setPreference({ key: 'test.notAPreference', value: 'x' } as never),
  }),
  defineRow({
    id: 'PREF-03',
    spec: 'X05 + M6-D21 setPreference grid.unit / load.view (own row, not audited)',
    action: 'setPreference',
    mutates: true,
    audit: false,
    expect: { M: 'allow', L: 'allow', Me: 'allow', W: 'allow' },
    run: async () => {
      const unit = await setPreference({ key: 'grid.unit', value: 'FRACTION' })
      if (!unit.ok) return unit
      return setPreference({ key: 'load.view', value: 'COMMITTED' })
    },
  }),
  defineRow({
    id: 'PREF-04',
    spec: 'X05 + M6-D21 setPreference grid.unit with a value outside DAYS | FRACTION → VALIDATION',
    action: 'setPreference',
    mutates: false,
    expect: { M: '400', L: '400', Me: '400', W: '400' },
    run: () => setPreference({ key: 'grid.unit', value: 'MONTH' } as never),
  }),
  // ── M7.1 (SPEC §6.2 user_preferences keys plan.view / grid.showAssignees / grid.taskColumnWidth / grid.chart) ──
  ...M7_1_KEYS.map(({ id, input }) =>
    defineRow({
      id,
      spec: `X05 + M7.1-D22 setPreference ${input.key} (own row, not audited)`,
      action: 'setPreference',
      mutates: true,
      audit: false,
      expect: ALL,
      run: (_w, _ctx, actor) => setAndStored(actor, input),
    }),
  ),
  defineRow({
    id: 'PREF-M7.1-BAD',
    spec: 'X05 + FR-814 setPreference grid.taskColumnWidth 2000 / 100 / 240.5 / plan.view MONTH → VALIDATION',
    action: 'setPreference',
    mutates: false,
    expect: { M: '400', L: '400', Me: '400', W: '400' },
    run: async () => {
      const bad = [
        { key: 'grid.taskColumnWidth', value: 2000 },
        { key: 'grid.taskColumnWidth', value: 100 },
        { key: 'grid.taskColumnWidth', value: 240.5 },
        { key: 'plan.view', value: 'MONTH' },
        { key: 'grid.showAssignees', value: 'yes' },
      ]
      let last: ActionResult<object> | undefined
      for (const input of bad) {
        last = await setPreference(input as never)
        if (last.ok || String(last.code) !== 'VALIDATION') return last
      }
      return last!
    },
  }),
]
