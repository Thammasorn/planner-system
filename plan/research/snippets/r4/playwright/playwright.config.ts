import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1, // one shared DB in the real app; specs reseed in beforeAll
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list']],
  use: {
    baseURL: 'http://127.0.0.1:4179',
    locale: 'th-TH',
    timezoneId: 'Asia/Bangkok',
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'setup', testMatch: /.*\.setup\.ts/ },
    {
      name: 'chromium',
      dependencies: ['setup'],
      use: {
        ...devices['Desktop Chrome'],
        storageState: 'e2e/.auth/manager.json',
        permissions: ['clipboard-read', 'clipboard-write'],
      },
    },
  ],
  webServer: {
    // real app: 'pnpm build && pnpm start' (or node .next/standalone/server.js) with env below
    command: 'node ../node_modules/vite/bin/vite.js preview --host 127.0.0.1',
    url: 'http://127.0.0.1:4179',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    // env: { PORT: '3100', DATABASE_URL: 'postgres://.../app_e2e', APP_TODAY: '2026-09-30' },
  },
})
