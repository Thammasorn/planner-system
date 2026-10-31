// pnpm bootstrap — idempotent first-run setup (FR-102, SPEC §10.4). Never prints passwords or hashes.
// M4 (FR-402, X25): after runBootstrap (manager, positions, M5 leave types, M3's status backfill) every live project without a live
// Project Charter gets one (ensureProjectCharters; one actor-null audit row each). CommonJS under tsx (X56): no
// top-level await, no import.meta.
import { ensureProjectCharters } from '@/server/services/charters'
import { runBootstrap } from './lib/bootstrap'
import { createScriptDb } from './lib/db'

async function main(): Promise<void> {
  const { db, close } = createScriptDb()
  try {
    const result = await runBootstrap(db, process.env)
    console.log(
      `bootstrap: manager ${result.createdManager ? 'created' : 'not created'}, ` +
        `${result.seededPositions} positions seeded, ${result.seededLeaveTypes} leave types seeded, ` +
        `${result.warnings.length} warning(s)` +
        (result.fatal ? ' — FAILED' : ''),
    )
    if (!result.fatal) {
      const charters = await ensureProjectCharters(db)
      console.log(`bootstrap: charters: ${charters.created} created`)
    }
    process.exitCode = result.fatal ? 1 : 0
  } finally {
    await close()
  }
}

main().catch((error: unknown) => {
  // Name only: messages of DB errors can contain query parameters (hashes).
  console.error('bootstrap failed:', error instanceof Error ? error.name : typeof error)
  process.exit(1)
})
