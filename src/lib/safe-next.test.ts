import { describe, expect, it } from 'vitest'
import { firstParam, safeNext } from './safe-next'

describe('safeNext (X32)', () => {
  it('U-NEXT-01 missing → /home; a same-origin path is kept', () => {
    expect(safeNext(undefined)).toBe('/home')
    expect(safeNext(null)).toBe('/home')
    expect(safeNext('')).toBe('/home')
    expect(safeNext('/projects/1?tab=a')).toBe('/projects/1?tab=a')
    expect(safeNext('/projects/1#x')).toBe('/projects/1#x')
  })

  it.each([
    '//evil.com',
    'https://evil.com',
    '/\\evil.com',
    '\\\\evil.com',
    'javascript:alert(1)',
    '/login',
    '/login?next=/home',
    '/login/',
    '/account/password',
    '/account/password?x=1',
    '/./login',
    '/a/../account/password',
    '/\t/evil.com',
    '/\n/evil.com',
    '/home\u0000',
    '/home\u007f',
    'home',
    ' /home',
  ])('U-NEXT-02 rejects %j → /home', (v) => {
    expect(safeNext(v)).toBe('/home')
  })

  it('U-NEXT-03 /home and look-alike paths are kept', () => {
    expect(safeNext('/home')).toBe('/home')
    expect(safeNext('/settings/employees')).toBe('/settings/employees')
    expect(safeNext('/logins')).toBe('/logins')
    expect(safeNext('/account/passwords')).toBe('/account/passwords')
  })

  it('U-NEXT-03 custom fallback', () => {
    expect(safeNext('//evil.com', '/settings')).toBe('/settings')
  })
})

describe('firstParam', () => {
  it('U-NEXT-04 first string of a searchParams value', () => {
    expect(firstParam(['/a', '/b'])).toBe('/a')
    expect(firstParam([])).toBeUndefined()
    expect(firstParam('/a')).toBe('/a')
    expect(firstParam(undefined)).toBeUndefined()
  })
})
