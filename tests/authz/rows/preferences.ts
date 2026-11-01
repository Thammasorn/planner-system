// X05 user_preferences (M1-D17): every signed-in user writes only their own row; not audited (X44 exception).
import { setPreference } from '@/server/actions/preferences'
import { defineRow, type AuthzRow } from '../types'

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
]
