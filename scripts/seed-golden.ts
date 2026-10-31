// pnpm seed:golden [--fixture=F2|F3|F4] — truncate every app table, then insert the golden data (F1) and, when
// given, one §11.3 fixture's own setup (dev/test only; SPEC §11.3, X11). One transaction; CommonJS under tsx (X56).
import { count } from 'drizzle-orm'
import {
  clients,
  holidays,
  leaveTypes,
  positions,
  projectMembers,
  projects,
  timeOff,
  user,
  workSchedules,
} from '@/server/db/schema'
import { assertNotProduction, createScriptDb, truncateAll } from './lib/db'
import { applyFixture, parseFixtureArg, seedGolden } from './lib/fixtures'

async function main(): Promise<void> {
  assertNotProduction()
  const fixture = parseFixtureArg(process.argv.slice(2))
  const { db, close } = createScriptDb()
  try {
    await db.transaction(async (tx) => {
      await truncateAll(tx)
      await seedGolden(tx)
      if (fixture) await applyFixture(tx, fixture)
    })
    const [[p], [u], [s], [c], [pr], [m], [lt], [h], [to]] = await Promise.all([
      db.select({ n: count() }).from(positions),
      db.select({ n: count() }).from(user),
      db.select({ n: count() }).from(workSchedules),
      db.select({ n: count() }).from(clients),
      db.select({ n: count() }).from(projects),
      db.select({ n: count() }).from(projectMembers),
      db.select({ n: count() }).from(leaveTypes),
      db.select({ n: count() }).from(holidays),
      db.select({ n: count() }).from(timeOff),
    ])
    console.log(
      `seed:golden${fixture ? ` (+${fixture})` : ''}: ${p?.n ?? 0} positions, ${u?.n ?? 0} users, ` +
        `${s?.n ?? 0} schedule rows, ${c?.n ?? 0} clients, ${pr?.n ?? 0} projects, ${m?.n ?? 0} members, ` +
        `${lt?.n ?? 0} leave types, ${h?.n ?? 0} holidays, ${to?.n ?? 0} leave entries`,
    )
  } finally {
    await close()
  }
}

main().catch((error: unknown) => {
  console.error('seed:golden failed:', error instanceof Error ? `${error.name}: ${error.message}` : error)
  process.exit(1)
})
