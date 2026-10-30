import { describe, expect, it } from 'vitest'
import postgres from 'postgres'

describe('file 1 gets a fresh clone', () => {
  it('sees only template data and can write without affecting other files', async () => {
    const sql = postgres(process.env.DATABASE_URL ?? '', { max: 1, onnotice: () => {} })
    const before = await sql<{ n: number }[]>`select count(*)::int as n from tasks`
    expect(before[0]?.n).toBe(1)
    await sql`insert into tasks (project_id, name, position) values (gen_random_uuid(), 'file 1', 'a1')`
    await new Promise((r) => setTimeout(r, 300))
    const after = await sql<{ n: number }[]>`select count(*)::int as n from tasks`
    expect(after[0]?.n).toBe(2)
    await sql.end()
  })
})
