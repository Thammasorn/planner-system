// M4 S1.8 — pure query helpers (M4-D37b: imported only from '@/server/services/search').
import { describe, expect, it } from 'vitest'
import { escapeLike, normalizeQuery } from '@/server/services/search'

describe('normalizeQuery', () => {
  it('NFC, zero-width characters removed, whitespace collapsed and trimmed', () => {
    expect(normalizeQuery(' ภาษา\u200Bไทย  ')).toBe('ภาษาไทย')
    expect(normalizeQuery('a \t\n b\uFEFF')).toBe('a b')
    expect(normalizeQuery('é')).toBe('é')
  })
})

describe('escapeLike', () => {
  it('escapes backslash, percent and underscore', () => {
    expect(escapeLike('50%_a\\b')).toBe('50\\%\\_a\\\\b')
    expect(escapeLike('ภาษา')).toBe('ภาษา')
  })
})
