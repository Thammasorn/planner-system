// M10 S0.3 (M10-D26): one normalisation for the local index and the server ILIKE patterns.
import { describe, expect, it } from 'vitest'
import * as server from '@/server/services/search'
import {
  escapeLike,
  foldForMatch,
  normalizeQuery,
  SEARCH_LIMIT_PER_CATEGORY,
  SEARCH_MIN_CONTENT_CHARS,
} from './normalize'

describe('normalizeQuery', () => {
  it('NFC, zero-width removed, whitespace collapsed, trimmed', () => {
    expect(normalizeQuery(' ภาษา​ไทย  ')).toBe('ภาษาไทย')
    expect(normalizeQuery('a ⁠\t\n b﻿')).toBe('a b')
    expect(normalizeQuery('é')).toBe('é')
    expect(normalizeQuery('   ')).toBe('')
  })
})

describe('escapeLike', () => {
  it('escapes backslash, percent and underscore', () => {
    expect(escapeLike('50%_a\\b')).toBe('50\\%\\_a\\\\b')
    expect(escapeLike('ลูกค้า')).toBe('ลูกค้า')
  })
})

describe('foldForMatch', () => {
  it('normalises and lower-cases Latin; Thai unchanged', () => {
    expect(foldForMatch('POS Upgrade')).toBe('pos upgrade')
    expect(foldForMatch('  ลูกค้า​ Coral ')).toBe('ลูกค้า coral')
  })
})

describe('constants and the M4 re-export', () => {
  it('match X68', () => {
    expect(SEARCH_MIN_CONTENT_CHARS).toBe(3)
    expect(SEARCH_LIMIT_PER_CATEGORY).toBe(8)
  })
  it('services/search re-exports the same functions (M4-D37b)', () => {
    expect(server.normalizeQuery).toBe(normalizeQuery)
    expect(server.escapeLike).toBe(escapeLike)
  })
})
