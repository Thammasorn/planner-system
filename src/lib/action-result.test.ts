import { describe, expect, it } from 'vitest'
import { ActionFailure, type ActionError, unwrap } from './action-result'

describe('unwrap / ActionFailure.extra (X86, M6-D25)', () => {
  it('a VERSION_CONFLICT failure carries `current` in extra; base keys stay out of it', () => {
    const fail: ActionError = { ok: false, code: 'VERSION_CONFLICT', message: 'x', current: [1] }
    let caught: unknown
    try {
      unwrap(fail)
    } catch (e) {
      caught = e
    }
    expect(caught).toBeInstanceOf(ActionFailure)
    const f = caught as ActionFailure
    expect(f.code).toBe('VERSION_CONFLICT')
    expect(f.message).toBe('x')
    expect(f.extra.current).toEqual([1])
    expect(Object.keys(f.extra)).toEqual(['current'])
  })

  it('a VALIDATION failure keeps fieldErrors on the failure and issues in extra', async () => {
    const fail: ActionError = {
      ok: false,
      code: 'VALIDATION',
      message: 'm',
      fieldErrors: { items: ['bad'] },
      issues: [{ period: '2026-10-12', reason: 'UNREPRESENTABLE' }],
    }
    const err = await unwrap(Promise.resolve(fail)).catch((e: unknown) => e)
    expect(err).toBeInstanceOf(ActionFailure)
    expect((err as ActionFailure).fieldErrors).toEqual({ items: ['bad'] })
    expect((err as ActionFailure).extra).toEqual({ issues: [{ period: '2026-10-12', reason: 'UNREPRESENTABLE' }] })
  })

  it('an ok result is returned unchanged', () => {
    expect(unwrap({ ok: true, n: 1 })).toEqual({ ok: true, n: 1 })
  })
})
