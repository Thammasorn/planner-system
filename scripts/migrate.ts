import { runMigrations } from './lib/migrate'

async function main(): Promise<void> {
  const url = process.env.DATABASE_URL
  if (!url) throw new Error('DATABASE_URL is required (copy .env.example to .env)')
  const t0 = performance.now()
  await runMigrations(url)
  console.log(`migrations applied in ${Math.round(performance.now() - t0)} ms`)
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.name + ': ' + error.message : error)
  process.exit(1)
})
