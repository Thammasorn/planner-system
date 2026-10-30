// pnpm bootstrap — idempotent first-run setup (FR-102, SPEC §10.4). Never prints passwords or hashes.
import { runBootstrap } from './lib/bootstrap'
import { createScriptDb } from './lib/db'

async function main(): Promise<void> {
  const { db, close } = createScriptDb()
  try {
    const result = await runBootstrap(db, process.env)
    console.log(
      `bootstrap: manager ${result.createdManager ? 'created' : 'not created'}, ` +
        `${result.seededPositions} positions seeded, ${result.warnings.length} warning(s)` +
        (result.fatal ? ' — FAILED' : ''),
    )
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
