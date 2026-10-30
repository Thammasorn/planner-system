import { redirect } from 'next/navigation'
import { describe, expect, it } from 'vitest'
import { th } from '@/i18n/th'
import { z } from '@/lib/z'
import { asNobody, asUser } from '../../tests/helpers/as-user'
import { makeUser } from '../../tests/helpers/factories'
import { action, publicAction } from './action'
import { ConflictError } from './errors'

const echo = action(z.object({ n: z.int() }), async ({ n }) => ({ n }))
const echoAllowed = action(z.object({ n: z.int() }), async ({ n }) => ({ n }), {
  allowWhenMustChangePassword: true,
})

describe('action() wrapper (ACT-1)', () => {
  it("T-GATE-01 no session → { ok:false, code:'UNAUTHENTICATED' }", async () => {
    asNobody()
    expect(await echo({ n: 1 })).toEqual({
      ok: false,
      code: 'UNAUTHENTICATED',
      message: th.errors.UNAUTHENTICATED,
    })
  })

  it('T-GATE-02 mustChange user → MUST_CHANGE_PASSWORD; with allowWhenMustChangePassword → ok', async () => {
    const u = await makeUser({ mustChangePassword: true })
    asUser(u)
    expect(await echo({ n: 1 })).toMatchObject({ ok: false, code: 'MUST_CHANGE_PASSWORD' })
    expect(await echoAllowed({ n: 2 })).toEqual({ ok: true, n: 2 })
  })

  it("T-GATE-03 { n: 'x' } → VALIDATION with fieldErrors.n", async () => {
    asUser(await makeUser())
    const r = await echo({ n: 'x' } as never)
    expect(r).toMatchObject({ ok: false, code: 'VALIDATION', message: th.errors.VALIDATION })
    expect(r.ok === false && r.fieldErrors?.n?.length).toBeGreaterThan(0)
  })

  it('returns the handler result with ok: true and maps AppErrors with extras', async () => {
    asUser(await makeUser())
    expect(await echo({ n: 3 })).toEqual({ ok: true, n: 3 })
    const failing = action(z.object({}), async (): Promise<{ x: number }> => {
      throw new ConflictError('VERSION_CONFLICT', undefined, { current: 7 })
    })
    expect(await failing({})).toEqual({
      ok: false,
      code: 'VERSION_CONFLICT',
      message: th.errors.VERSION_CONFLICT,
      current: 7,
    })
  })

  it("T-GATE-05 handler throwing redirect('/x') propagates (not converted)", async () => {
    asUser(await makeUser())
    const redirecting = action(z.object({}), async (): Promise<{ x: number }> => redirect('/x'))
    const err: unknown = await redirecting({}).then(
      () => null,
      (e: unknown) => e,
    )
    const digest = err !== null && typeof err === 'object' && 'digest' in err ? String(err.digest) : ''
    expect(digest).toMatch(/^NEXT_REDIRECT;.*\/x/)
  })

  it('publicAction runs without a session and passes the user when present', async () => {
    const who = publicAction(z.object({}), async (_i, { user }) => ({ id: user?.id ?? null }))
    asNobody()
    expect(await who({})).toEqual({ ok: true, id: null })
    const u = await makeUser({ mustChangePassword: true })
    asUser(u)
    expect(await who({})).toEqual({ ok: true, id: u.id })
  })
})
