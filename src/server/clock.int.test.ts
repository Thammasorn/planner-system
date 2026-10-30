import { describe, expect, it, vi } from 'vitest'
import { todayBangkok } from '@/domain/dates'
import { serverNow, serverToday } from './clock'

describe('clock (X45)', () => {
  it('T-CLOCK-01 ALLOW_TEST_HOOKS=1 + APP_NOW pins serverNow/serverToday', () => {
    vi.stubEnv('ALLOW_TEST_HOOKS', '1')
    vi.stubEnv('APP_NOW', '2026-09-30T10:00:00+07:00')
    expect(serverToday()).toBe('2026-09-30')
    expect(serverNow().toISOString()).toBe('2026-09-30T03:00:00.000Z')
    // Bangkok midnight boundary: 23:30 UTC is already the next day in Bangkok.
    vi.stubEnv('APP_NOW', '2026-09-30T23:30:00Z')
    expect(serverToday()).toBe('2026-10-01')
  })

  it('T-CLOCK-02 APP_NOW without ALLOW_TEST_HOOKS is ignored (real date)', () => {
    vi.stubEnv('ALLOW_TEST_HOOKS', '')
    vi.stubEnv('APP_NOW', '2000-01-01T10:00:00+07:00')
    expect(serverToday()).toBe(todayBangkok())
    vi.stubEnv('ALLOW_TEST_HOOKS', '0')
    expect(serverToday()).toBe(todayBangkok())
    expect(Math.abs(serverNow().getTime() - Date.now())).toBeLessThan(5_000)
  })

  it('an invalid APP_NOW falls back to the real clock', () => {
    vi.stubEnv('ALLOW_TEST_HOOKS', '1')
    vi.stubEnv('APP_NOW', 'not-a-date')
    expect(serverToday()).toBe(todayBangkok())
  })
})
