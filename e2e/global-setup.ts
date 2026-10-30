// Also covers `reuseExistingServer` (webServer.command not run). Idempotent (M0-D18).
// M1 adds nothing here: resetDb runs per spec file in test.beforeAll.
import { prepareE2eDb } from './db'

export default async function globalSetup(): Promise<void> {
  await prepareE2eDb()
}
