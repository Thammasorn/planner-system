import { describe, expect, it } from 'vitest'
import { DEFAULT_PREFERENCES, preferenceInput, preferencesSchema } from './preferences'

describe('preferences (X05, M1-D17)', () => {
  it("U-SCH-10 preferencesSchema.parse({ theme: 'neon', x: 1 }) → defaults; unknown keys rejected by preferenceInput", () => {
    expect(preferencesSchema.parse({ theme: 'neon', x: 1 })).toEqual({
      theme: 'system',
      'sidebar.collapsed': false,
    })
    expect(preferencesSchema.parse({})).toEqual(DEFAULT_PREFERENCES)
    expect(preferencesSchema.parse({ theme: 'dark', 'sidebar.collapsed': true })).toEqual({
      theme: 'dark',
      'sidebar.collapsed': true,
    })
    expect(preferenceInput.safeParse({ key: 'grid.unit', value: 'DAYS' }).success).toBe(false)
    expect(preferenceInput.safeParse({ key: 'theme', value: 'neon' }).success).toBe(false)
    expect(preferenceInput.safeParse({ key: 'sidebar.collapsed', value: true }).success).toBe(true)
  })
})
