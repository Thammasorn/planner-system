// pnpm import:holidays <file.csv> [--dry-run] — import company holidays from a `date,name` CSV (FR-901, M5-D11, X64).
// UTF-8 (BOM optional) or windows-874; ISO dates only; all-or-nothing in one transaction; actor null in the audit log.
// --dry-run prints the classification (new / update / same) without writing. CommonJS under tsx (X56): no top-level
// await, no import.meta. Exit codes: 0 ok · 1 file errors or failure · 2 usage.
import { readFileSync } from 'node:fs'
import { th } from '@/i18n/th'
import { createScriptDb } from './lib/db'
import { runImportHolidays } from './lib/import-holidays'

async function main(): Promise<void> {
  const args = process.argv.slice(2)
  const file = args.find((a) => !a.startsWith('--'))
  if (!file) {
    console.error('usage: pnpm import:holidays <file.csv> [--dry-run]')
    process.exitCode = 2
    return
  }
  const bytes = new Uint8Array(readFileSync(file))
  const { db, close } = createScriptDb()
  try {
    const out = await runImportHolidays(db, bytes, { dryRun: args.includes('--dry-run') })
    if (!out.ok) {
      for (const m of out.messages) console.error(m)
      process.exitCode = 1
      return
    }
    if (Array.isArray(out.result)) {
      const status = th.holidays.import.status
      for (const r of out.result) {
        const prev = r.previousName ? ` (${th.holidays.import.previousName(r.previousName)})` : ''
        console.log(`${r.date}\t${status[r.status]}\t${r.name}${prev}`)
      }
      return
    }
    console.log(th.holidays.import.done(out.result.inserted, out.result.updated))
  } finally {
    await close()
  }
}

main().catch((error: unknown) => {
  console.error('import:holidays failed:', error instanceof Error ? error.name : typeof error)
  process.exit(1)
})
