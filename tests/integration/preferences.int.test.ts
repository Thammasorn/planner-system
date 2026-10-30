// X05 / M1-D17 — user_preferences: jsonb merge per key, invalid stored values fall back, not audited, no refresh().
// plan/m01-auth-employees.md §5.S4 (S4.6, second part).
import { describe, expect, it } from 'vitest'
import { DEFAULT_PREFERENCES } from '@/lib/schemas/preferences'
import { setPreference } from '@/server/actions/preferences'
import { db } from '@/server/db/client'
import { userPreferences } from '@/server/db/schema'
import { getPreferences } from '@/server/services/preferences'
import { asUser } from '../helpers/as-user'
import { auditTotal } from '../helpers/audit'
import { makeUser } from '../helpers/factories'
import { testCache } from '../helpers/request'

describe('preferences (X05)', () => {
  it('T-PREF-01 setPreference(theme) is read back with the other defaults', async () => {
    const me = await makeUser()
    asUser(me)
    expect(await setPreference({ key: 'theme', value: 'dark' })).toEqual({ ok: true })
    expect(await getPreferences(db, me.id)).toEqual({ theme: 'dark', 'sidebar.collapsed': false })
  })

  it('T-PREF-02 a second key merges into the same row (jsonb merge keeps theme)', async () => {
    const me = await makeUser()
    asUser(me)
    await setPreference({ key: 'theme', value: 'dark' })
    expect(await setPreference({ key: 'sidebar.collapsed', value: true })).toEqual({ ok: true })
    expect(await getPreferences(db, me.id)).toEqual({ theme: 'dark', 'sidebar.collapsed': true })
    // only the actor's row changes
    const other = await makeUser()
    expect(await getPreferences(db, other.id)).toEqual(DEFAULT_PREFERENCES)
  })

  it('T-PREF-03 preferences are not audited; invalid stored values read back as defaults', async () => {
    const me = await makeUser()
    asUser(me)
    await setPreference({ key: 'theme', value: 'light' })
    await setPreference({ key: 'sidebar.collapsed', value: true })
    expect(await auditTotal()).toBe(0)

    const odd = await makeUser()
    await db.insert(userPreferences).values({ userId: odd.id, data: { theme: 'neon', x: 1 } })
    expect(await getPreferences(db, odd.id)).toEqual(DEFAULT_PREFERENCES)
  })

  it('T-PREF-04 setPreference does not call refresh()', async () => {
    asUser(await makeUser())
    await setPreference({ key: 'theme', value: 'dark' })
    expect(testCache.refresh).not.toHaveBeenCalled()
  })
})
