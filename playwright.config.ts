import { defineConfig, devices } from '@playwright/test'
import { E2E } from './e2e/env'

/**
 * E2E against a production build (`next build && next start -p 3100`) on its own DB `planner_e2e`
 * (PLAN.md §4.5, X46, plan/m00-scaffold.md S3.3). No setup project / storageState: from M1 every spec
 * logs in through the API (`loginAs`) and resets the DB in `test.beforeAll`.
 */
export default defineConfig({
  testDir: './e2e',
  testMatch: /.*\.spec\.ts$/,
  fullyParallel: false,
  workers: 1, // one shared planner_e2e; specs reset in beforeAll from M1
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  globalSetup: './e2e/global-setup.ts',
  use: {
    baseURL: E2E.baseUrl,
    locale: 'th-TH',
    timezoneId: 'Asia/Bangkok',
    permissions: ['clipboard-read', 'clipboard-write'],
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } },
  ],
  webServer: {
    // DB first (M0-D18): the readiness URL /api/health pings it. Process env wins over `.env` (dev DATABASE_URL unused).
    // `next start` with `output: 'standalone'` prints a harmless warning (r4 fact 43).
    command: `pnpm exec tsx e2e/prepare-db.ts && pnpm build && pnpm start -p ${E2E.port}`,
    url: `${E2E.baseUrl}/api/health`,
    timeout: 300_000,
    reuseExistingServer: true,
    stdout: 'pipe',
    stderr: 'pipe',
    env: {
      DATABASE_URL: E2E.databaseUrl,
      ALLOW_TEST_HOOKS: '1', // consumed from M1 (clock, rate limit off)
      APP_NOW: E2E.appNow, // consumed from M1 (X45)
      BETTER_AUTH_URL: E2E.baseUrl,
      BETTER_AUTH_SECRET: E2E.authSecret,
      SECURE_COOKIES: 'false',
      UPLOAD_DIR: E2E.uploadDir,
      NEXT_TELEMETRY_DISABLED: '1',
    },
  },
})
