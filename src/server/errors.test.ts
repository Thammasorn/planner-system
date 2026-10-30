import { afterEach, describe, expect, it, vi } from 'vitest'
import { z } from '@/lib/z'
import { th } from '@/i18n/th'
import {
  AppError,
  ConflictError,
  ForbiddenError,
  mapDbError,
  MustChangePasswordError,
  notImplemented,
  NotFoundError,
  pgErrorInfo,
  RateLimitedError,
  toActionError,
  UnauthenticatedError,
  ValidationError,
} from './errors'

afterEach(() => {
  vi.restoreAllMocks()
})

describe('AppError family', () => {
  it('carries code, Thai default message and HTTP status', () => {
    expect(new UnauthenticatedError()).toMatchObject({ code: 'UNAUTHENTICATED', status: 401 })
    expect(new MustChangePasswordError()).toMatchObject({ code: 'MUST_CHANGE_PASSWORD', status: 403 })
    expect(new NotFoundError()).toMatchObject({
      code: 'NOT_FOUND',
      status: 404,
      message: th.errors.NOT_FOUND,
    })
    expect(new ForbiddenError()).toMatchObject({
      code: 'FORBIDDEN',
      status: 403,
      message: th.errors.FORBIDDEN,
    })
    expect(new ConflictError('LAST_MANAGER')).toMatchObject({ status: 409, message: th.errors.LAST_MANAGER })
    expect(new RateLimitedError()).toMatchObject({
      code: 'LOGIN_LOCKED',
      status: 429,
      message: th.auth.errors.LOGIN_LOCKED,
    })
    expect(new AppError('INVALID_PASSWORD')).toBeInstanceOf(Error)
  })

  it('ValidationError.fromZod keeps field errors', () => {
    const r = z.object({ n: z.int() }).safeParse({ n: 'x' })
    expect(r.success).toBe(false)
    const e = ValidationError.fromZod(r.error!)
    expect(e.code).toBe('VALIDATION')
    expect(e.extra.fieldErrors?.n?.length).toBeGreaterThan(0)
  })

  it('notImplemented names the step', () => {
    expect(notImplemented('S2.6').message).toBe('NOT_IMPLEMENTED: S2.6')
  })
})

describe('mapDbError / pgErrorInfo', () => {
  it("T-ERR-02 { cause: { code: '23503' } } → IN_USE, 23P01 → OVERLAP, 23514 → VALIDATION, plain Error → null", () => {
    expect(mapDbError({ cause: { code: '23503' } })?.code).toBe('IN_USE')
    expect(mapDbError({ code: '23P01' })?.code).toBe('OVERLAP')
    expect(mapDbError({ cause: { code: '23514' } })?.code).toBe('VALIDATION')
    expect(mapDbError({ cause: { code: '23505' } })?.code).toBe('CONFLICT')
    expect(mapDbError({ cause: { code: 'P0001' } })?.code).toBe('INTERNAL')
    expect(mapDbError(new Error('x'))).toBeNull()
    expect(mapDbError(null)).toBeNull()
    expect(mapDbError('boom')).toBeNull()
  })

  it('pgErrorInfo reads code and constraint from the cause first', () => {
    expect(pgErrorInfo({ cause: { code: '23505', constraint_name: 'positions_name_unique' } })).toEqual({
      code: '23505',
      constraint: 'positions_name_unique',
    })
    expect(pgErrorInfo({ code: '23505', constraint: 'x' })).toEqual({ code: '23505', constraint: 'x' })
    expect(pgErrorInfo(new Error('x'))).toEqual({})
  })
})

describe('toActionError', () => {
  it("T-ERR-03 toActionError(new Error('secret-param')) → INTERNAL and the log never sees the message", () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(toActionError(new Error('secret-param'))).toEqual({
      ok: false,
      code: 'INTERNAL',
      message: th.errors.INTERNAL,
    })
    expect(spy).toHaveBeenCalled()
    expect(JSON.stringify(spy.mock.calls)).not.toContain('secret-param')
  })

  it('keeps AppError extras and field errors', () => {
    const e = new ConflictError('CONFLICT', th.employees.emailTaken, {
      fieldErrors: { email: [th.employees.emailTaken] },
      current: 3,
    })
    expect(toActionError(e)).toEqual({
      ok: false,
      code: 'CONFLICT',
      message: th.employees.emailTaken,
      fieldErrors: { email: [th.employees.emailTaken] },
      current: 3,
    })
  })

  it('maps DB errors without logging their message', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const err = Object.assign(new Error('insert … params: $2=hash'), { cause: { code: '23505' } })
    expect(toActionError(err)).toMatchObject({ ok: false, code: 'CONFLICT', message: th.errors.CONFLICT })
    expect(JSON.stringify(spy.mock.calls)).not.toContain('hash')
  })
})
