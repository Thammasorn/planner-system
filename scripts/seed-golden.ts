// pnpm seed:golden — truncate every app table, then insert the golden data (dev/test only; SPEC §11.3, X11).
import { count } from 'drizzle-orm'
import { clients, positions, projectMembers, projects, user, workSchedules } from '@/server/db/schema'
import { assertNotProduction, createScriptDb, truncateAll } from './lib/db'
import { seedGolden } from './lib/fixtures'

async function main(): Promise<void> {
  assertNotProduction()
  const { db, close } = createScriptDb()
  try {
    await db.transaction(async (tx) => {
      await truncateAll(tx)
      await seedGolden(tx)
    })
    const [[p], [u], [s], [c], [pr], [m]] = await Promise.all([
      db.select({ n: count() }).from(positions),
      db.select({ n: count() }).from(user),
      db.select({ n: count() }).from(workSchedules),
      db.select({ n: count() }).from(clients),
      db.select({ n: count() }).from(projects),
      db.select({ n: count() }).from(projectMembers),
    ])
    console.log(
      `seed:golden: ${p?.n ?? 0} positions, ${u?.n ?? 0} users, ${s?.n ?? 0} schedule rows, ` +
        `${c?.n ?? 0} clients, ${pr?.n ?? 0} projects, ${m?.n ?? 0} members`,
    )
  } finally {
    await close()
  }
}

main().catch((error: unknown) => {
  console.error('seed:golden failed:', error instanceof Error ? `${error.name}: ${error.message}` : error)
  process.exit(1)
})
