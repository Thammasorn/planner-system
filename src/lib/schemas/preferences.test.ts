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

  it('sidebar.expanded (M2, X05): optional array of node keys; bad stored values fall back to absent', () => {
    const key = 'project:6f1c1d2e-3b4a-4c5d-8e9f-0a1b2c3d4e5f'
    expect(preferenceInput.safeParse({ key: 'sidebar.expanded', value: [key] }).success).toBe(true)
    expect(preferenceInput.safeParse({ key: 'sidebar.expanded', value: ['x'.repeat(81)] }).success).toBe(
      false,
    )
    expect(preferenceInput.safeParse({ key: 'sidebar.expanded', value: Array(501).fill('a') }).success).toBe(
      false,
    )
    expect(preferencesSchema.parse({ 'sidebar.expanded': [key] })['sidebar.expanded']).toEqual([key])
    expect(preferencesSchema.parse({ 'sidebar.expanded': 'oops' })['sidebar.expanded']).toBeUndefined()
    expect('sidebar.expanded' in preferencesSchema.parse({})).toBe(false)
  })
})
