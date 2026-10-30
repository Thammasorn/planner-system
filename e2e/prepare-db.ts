// Run by playwright.config.ts `webServer.command` BEFORE `pnpm build`: the readiness URL /api/health needs the DB
// (Playwright starts webServer before globalSetup — M0-D18). tsx compiles this as CommonJS: no top-level await.
import { prepareE2eDb } from './db'

prepareE2eDb().catch((error: unknown) => {
  console.error(error)
  process.exit(1)
})
