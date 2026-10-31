import { describe, expect, it } from 'vitest'
import { ForbiddenError, UnauthenticatedError } from './errors'
import { canSeeLeaveDetails, isManager, narrowRole, requireManager, requireUser } from './authz'
import type { SessionUser } from './session'

const base: SessionUser = {
  id: 'u1',
  email: 'a@example.com',
  name: 'A',
  nickname: null,
  role: 'worker',
  positionId: null,
  color: null,
  mustChangePassword: false,
  sessionId: 's1',
  sessionToken: 't1',
}

describe('authz (M1 functions)', () => {
  it("T-AZ-01 narrowRole('manager')='manager'; 'MANAGER','admin',null,undefined,'' → 'worker'", () => {
    expect(narrowRole('manager')).toBe('manager')
    for (const r of ['MANAGER', 'admin', null, undefined, '', 'worker']) expect(narrowRole(r)).toBe('worker')
  })

  it('T-AZ-02 requireManager(worker) throws ForbiddenError; manager passes; requireUser(null) throws UnauthenticatedError', () => {
    expect(() => requireManager(base)).toThrow(ForbiddenError)
    try {
      requireManager(base)
    } catch (e) {
      expect((e as ForbiddenError).code).toBe('FORBIDDEN')
    }
    expect(() => requireManager({ ...base, role: 'manager' })).not.toThrow()
    expect(isManager({ role: 'manager' })).toBe(true)
    expect(isManager(base)).toBe(false)
    expect(() => requireUser(null)).toThrow(UnauthenticatedError)
    expect(() => requireUser(undefined)).toThrow(UnauthenticatedError)
    expect(() => requireUser(base)).not.toThrow()
  })
})

describe('authz (M5 functions)', () => {
  it('canSeeLeaveDetails: manager → everyone, owner → own, other worker → never (§3.3)', () => {
    const manager = { id: 'm1', role: 'manager' as const }
    expect(canSeeLeaveDetails(manager, 'u2')).toBe(true)
    expect(canSeeLeaveDetails(manager, 'm1')).toBe(true)
    expect(canSeeLeaveDetails(base, 'u1')).toBe(true)
    expect(canSeeLeaveDetails(base, 'u2')).toBe(false)
  })
})
