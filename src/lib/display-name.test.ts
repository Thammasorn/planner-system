import { describe, expect, it } from 'vitest'
import { displayName, initialOf } from './display-name'

describe('displayName (FR-210)', () => {
  it('U-NAME-01 no nickname → name', () => {
    expect(displayName({ name: 'Cindy', nickname: null })).toBe('Cindy')
    expect(displayName({ name: 'Cindy' })).toBe('Cindy')
  })

  it('U-NAME-02 nickname wins; blank nickname → name', () => {
    expect(displayName({ name: 'Demo Manager', nickname: 'Manager' })).toBe('Manager')
    expect(displayName({ name: 'Demo Manager', nickname: '  ' })).toBe('Demo Manager')
    expect(displayName({ name: 'Demo Manager', nickname: '' })).toBe('Demo Manager')
    expect(displayName({ name: 'Demo Manager', nickname: '  Mgr ' })).toBe('Mgr')
  })
})

describe('initialOf', () => {
  it('U-NAME-03 first grapheme: Thai base + combining vowel + tone stay together', () => {
    expect(initialOf({ name: 'นิ่ม', nickname: null })).toBe('นิ่')
    expect(initialOf({ name: 'cindy' })).toBe('C')
    expect(initialOf({ name: 'Demo Manager', nickname: 'ปุ๊ก' })).toBe('ปุ๊')
    expect(initialOf({ name: '  ann' })).toBe('A')
  })

  it('U-NAME-04 empty name → ?', () => {
    expect(initialOf({ name: '' })).toBe('?')
    expect(initialOf({ name: '   ', nickname: ' ' })).toBe('?')
  })
})
