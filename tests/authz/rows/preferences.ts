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
    // A key that M1 does not know: zod's discriminated union rejects it.
    run: () => setPreference({ key: 'grid.unit', value: 'DAYS' } as never),
  }),
]
