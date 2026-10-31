import { describe, expect, it } from 'vitest'
import { th } from '@/i18n/th'
import { z } from '@/lib/z'
import { asNobody, asUser } from '../../tests/helpers/as-user'
import { makeUser } from '../../tests/helpers/factories'
import { PayloadTooLargeError, UnsupportedMediaTypeError } from './errors'
import { route } from './route'

const handler = route(async (_req, { user, query }) => ({ id: user.id, q: query.q }), {
  query: z.object({ q: z.string().min(2) }),
})
const ctx = { params: Promise.resolve({}) }
const req = (qs: string) => new Request(`http://localhost:3100/api/test${qs}`)

describe('route() wrapper', () => {
  it('T-GATE-04 no session → 401 JSON, mustChange → 403, failing query → 400, ok → 200 private no-store', async () => {
    asNobody()
    const r401 = await handler(req('?q=ab'), ctx)
    expect(r401.status).toBe(401)
    expect(await r401.json()).toMatchObject({ code: 'UNAUTHENTICATED' })

    const mc = await makeUser({ mustChangePassword: true })
    asUser(mc)
    const r403 = await handler(req('?q=ab'), ctx)
    expect(r403.status).toBe(403)
    expect(await r403.json()).toMatchObject({ code: 'MUST_CHANGE_PASSWORD' })

    const u = await makeUser()
    asUser(u)
    const r400 = await handler(req('?q=a'), ctx)
    expect(r400.status).toBe(400)
    const body400 = (await r400.json()) as { code: string; fieldErrors?: Record<string, string[]> }
    expect(body400.code).toBe('VALIDATION')
    expect(body400.fieldErrors?.q?.length).toBeGreaterThan(0)

    const ok = await handler(req('?q=abc'), ctx)
    expect(ok.status).toBe(200)
    expect(ok.headers.get('cache-control')).toBe('private, no-store')
    expect(ok.headers.get('x-content-type-options')).toBe('nosniff')
    expect(await ok.json()).toEqual({ id: u.id, q: 'abc' })
  })

  it('public routes run without a session; Response results pass through', async () => {
    const pub = route(async (_req, { user }) => new Response(user ? 'user' : 'anon', { status: 202 }), {
      public: true,
    })
    asNobody()
    const r = await pub(req(''), ctx)
    expect(r.status).toBe(202)
    expect(await r.text()).toBe('anon')
  })

  it('upload errors answer 413 TOO_LARGE / 415 UNSUPPORTED_TYPE with the Thai message', async () => {
    asUser(await makeUser())
    const big = route(async () => {
      throw new PayloadTooLargeError()
    })
    const r413 = await big(req(''), ctx)
    expect(r413.status).toBe(413)
    expect(await r413.json()).toEqual({ code: 'TOO_LARGE', message: th.files.errors.tooLarge })

    const bad = route(async () => {
      throw new UnsupportedMediaTypeError()
    })
    const r415 = await bad(req(''), ctx)
    expect(r415.status).toBe(415)
    expect(await r415.json()).toEqual({ code: 'UNSUPPORTED_TYPE', message: th.files.errors.unsupported })
  })
})
