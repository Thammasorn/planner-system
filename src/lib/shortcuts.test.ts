import { describe, expect, it } from 'vitest'
import { SHORTCUT_KEY_LABELS, SHORTCUT_SCOPE_LABELS, SHORTCUT_SCOPES, SHORTCUTS } from './shortcuts'

describe('shortcut registry (X07)', () => {
  it('ids are unique', () => {
    const ids = SHORTCUTS.map((s) => s.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('every scope is registered and has a Thai heading', () => {
    for (const s of SHORTCUTS) expect(SHORTCUT_SCOPES, s.id).toContain(s.scope)
    for (const scope of SHORTCUT_SCOPES) expect(SHORTCUT_SCOPE_LABELS[scope]).toBeTruthy()
  })

  it('every label is non-empty and every combo has a key label', () => {
    const keys: Record<string, string> = SHORTCUT_KEY_LABELS
    for (const s of SHORTCUTS) {
      expect(s.label.length, s.id).toBeGreaterThan(0)
      expect(s.combos.length, s.id).toBeGreaterThan(0)
      for (const combo of s.combos)
        for (const token of combo) expect(keys[token], `${s.id} ${token}`).toBeTruthy()
    }
  })
})
