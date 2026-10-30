import { beforeEach, describe, expect, it, vi } from 'vitest'

// vi.mock calls are hoisted above imports; share state via vi.hoisted.
const cache = vi.hoisted(() => ({
  updateTag: vi.fn(),
  revalidateTag: vi.fn(),
  revalidatePath: vi.fn(),
  refresh: vi.fn(),
}))
vi.mock('next/cache', () => cache)

const jar = vi.hoisted(() => new Map<string, string>())
vi.mock('next/headers', () => ({
  cookies: vi.fn(async () => ({
    get: (name: string) => (jar.has(name) ? { name, value: jar.get(name) ?? '' } : undefined),
  })),
  headers: vi.fn(async () => new Headers({ 'user-agent': 'vitest' })),
}))

import { renameTask } from '@/server/actions/rename-task'
import { sql } from '@/server/db'

beforeEach(() => {
  jar.clear()
})

describe('renameTask server action (DB per worker)', () => {
  it("runs against this worker's cloned database", async () => {
    const [row] = await sql<{ db: string }[]>`select current_database() as db`
    expect(row?.db).toBe(`app_test_w${process.env.VITEST_POOL_ID}`)
  })
  it('validates input with zod v4 (strict uuid)', async () => {
    const res = await renameTask({ taskId: '11111111-1111-1111-1111-111111111111', name: 'x' })
    expect(res).toMatchObject({ ok: false, code: 'VALIDATION' })
  })
  it('requires a session cookie', async () => {
    const [t] = await sql<{ id: string }[]>`select id from tasks limit 1`
    expect(await renameTask({ taskId: t?.id, name: 'x' })).toEqual({ ok: false, code: 'UNAUTHENTICATED' })
  })
  it('updates and revalidates', async () => {
    jar.set('session', 'abc')
    const [t] = await sql<{ id: string; project_id: string }[]>`select id, project_id from tasks limit 1`
    expect(await renameTask({ taskId: t?.id, name: 'renamed' })).toEqual({ ok: true })
    expect(cache.updateTag).toHaveBeenCalledWith(`project:${t?.project_id}`)
    expect(cache.revalidatePath).toHaveBeenCalledOnce()
    const [after] = await sql<{ name: string }[]>`select name from tasks where id = ${t?.id ?? ''}`
    expect(after?.name).toBe('renamed')
  })
})
