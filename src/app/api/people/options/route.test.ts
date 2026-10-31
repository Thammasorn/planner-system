// AZ-2: the people-directory route calls src/server/authz.ts before it reads data (the route() session gate alone
// is not the authz hook). The end-to-end allow matrix is PERM-XA in tests/authz/rows/members.ts.
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  calls: [] as string[],
  getSessionUser: vi.fn(),
  listPeopleOptions: vi.fn(),
}))

vi.mock('@/server/session', () => ({ getSessionUser: mocks.getSessionUser }))
vi.mock('@/server/db/client', () => ({ db: {} }))
vi.mock('@/server/services', () => ({ people: { listPeopleOptions: mocks.listPeopleOptions } }))
vi.mock('@/server/authz', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/server/authz')>()
  const realRequireUser: typeof actual.requireUser = actual.requireUser
  const requireUser: typeof actual.requireUser = (user) => {
    mocks.calls.push('authz.requireUser')
    realRequireUser(user)
  }
  return { ...actual, requireUser }
})

const { GET } = await import('./route')

const USER = {
  id: 'u1',
  email: 'u1@example.test',
  name: 'U One',
  nickname: null,
  role: 'worker' as const,
  positionId: null,
  color: null,
  mustChangePassword: false,
  sessionId: 's',
  sessionToken: 't',
}

beforeEach(() => {
  mocks.calls.length = 0
  mocks.getSessionUser.mockResolvedValue(USER)
  mocks.listPeopleOptions.mockImplementation(() => {
    mocks.calls.push('listPeopleOptions')
    return Promise.resolve([])
  })
})

describe('GET /api/people/options', () => {
  it('calls authz.requireUser before reading the directory', async () => {
    const res = await GET(new Request('http://localhost/api/people/options'), { params: Promise.resolve({}) })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ people: [] })
    expect(mocks.calls).toEqual(['authz.requireUser', 'listPeopleOptions'])
  })

  it('without a session it never reads the directory (401)', async () => {
    mocks.getSessionUser.mockResolvedValue(null)
    const res = await GET(new Request('http://localhost/api/people/options'), { params: Promise.resolve({}) })
    expect(res.status).toBe(401)
    expect(mocks.listPeopleOptions).not.toHaveBeenCalled()
  })
})
