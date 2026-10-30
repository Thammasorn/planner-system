// pnpm db:reset — truncate every app table (keeps drizzle.__drizzle_migrations). Dev/test only.
import { assertNotProduction, createScriptDb, truncateAll } from './lib/db'

async function main(): Promise<void> {
  assertNotProduction()
  const { db, close } = createScriptDb()
  try {
    await truncateAll(db)
    console.log('db:reset: all app tables truncated')
  } finally {
    await close()
  }
}

main().catch((error: unknown) => {
  console.error('db:reset failed:', error instanceof Error ? `${error.name}: ${error.message}` : error)
  process.exit(1)
})
