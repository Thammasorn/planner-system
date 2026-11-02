import { afterEach, describe, expect, it, vi } from 'vitest'
import { z } from '@/lib/z'
import { th } from '@/i18n/th'
import { ERROR_STATUS } from '@/lib/action-result'
import {
  AppError,
  ConflictError,
  ForbiddenError,
  mapDbError,
  MustChangePasswordError,
  NeedsChoiceError,
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

  it('M3 constraint backstops: duplicate status name → VALIDATION(name), cross-project task FKs → NOT_FOUND', () => {
    const dup = mapDbError({ cause: { code: '23505', constraint_name: 'task_statuses_name' } })
    expect(dup?.code).toBe('VALIDATION')
    expect(dup?.message).toBe(th.tasks.status.errors.duplicateName)
    expect(dup?.extra.fieldErrors).toEqual({ name: [th.tasks.status.errors.duplicateName] })
    for (const constraint of ['tasks_status_fk', 'task_blockers_task_fk', 'task_blockers_blocker_fk'])
      expect(mapDbError({ cause: { code: '23503', constraint_name: constraint } })?.code, constraint).toBe('NOT_FOUND')
    expect(mapDbError({ cause: { code: '23503', constraint_name: 'projects_client_id_fk' } })?.code).toBe('IN_USE')
    expect(mapDbError({ cause: { code: '23505', constraint_name: 'task_assignments_active' } })?.code).toBe('CONFLICT')
  })

  it('M6.1 (S1.13): 23514 on the task-page shape checks → INTERNAL (services never build such rows)', () => {
    for (const constraint of ['pages_kind_task', 'pages_kind_shape', 'pages_task_space'])
      expect(mapDbError({ cause: { code: '23514', constraint_name: constraint } })?.code, constraint).toBe('INTERNAL')
    expect(mapDbError({ cause: { code: '23514', constraint_name: 'pages_depth_check' } })?.code).toBe('VALIDATION')
  })

  it('M8 (S2.3) backstops: milestone FK → NOT_FOUND; milestones_name_check → VALIDATION with a name error', () => {
    const fk = mapDbError({ cause: { code: '23503', constraint_name: 'tasks_milestone_id_milestones_id_fk' } })
    expect(fk?.code).toBe('NOT_FOUND')
    const name = mapDbError({ cause: { code: '23514', constraint_name: 'milestones_name_check' } })
    expect(name?.code).toBe('VALIDATION')
    expect(name?.extra.fieldErrors).toEqual({ name: [th.milestones.errors.nameRequired] })
  })

  it('M6-D5 / G23: 23P01 on allocations_one_resolution_per_week → INTERNAL; other exclusions stay OVERLAP', () => {
    expect(
      mapDbError({ cause: { code: '23P01', constraint_name: 'allocations_one_resolution_per_week' } })?.code,
    ).toBe('INTERNAL')
    expect(mapDbError({ cause: { code: '23P01', constraint_name: 'time_off_no_overlap' } })?.code).toBe('OVERLAP')
  })

  it('M6: ValidationError carries an extra payload (issues) next to fieldErrors', () => {
    const e = new ValidationError({}, 'x', { issues: [{ reason: 'MAX' }] })
    expect(toActionError(e)).toEqual({
      ok: false,
      code: 'VALIDATION',
      message: 'x',
      fieldErrors: {},
      issues: [{ reason: 'MAX' }],
    })
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
  it('NEEDS_CHOICE (BR-24, M7-D3): 409 with { week, weeks, pairs } spread into the result', () => {
    const p = { taskAssignmentId: 'a1', week: '2026-09-21' }
    expect(ERROR_STATUS.NEEDS_CHOICE).toBe(409)
    const e = new NeedsChoiceError({ week: '2026-09-21', weeks: ['2026-09-21', '2026-09-28'], pairs: [p] })
    expect(e.status).toBe(409)
    expect(toActionError(e)).toEqual({
      ok: false,
      code: 'NEEDS_CHOICE',
      message: th.errors.NEEDS_CHOICE,
      week: '2026-09-21',
      weeks: ['2026-09-21', '2026-09-28'],
      pairs: [p],
    })
  })

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
