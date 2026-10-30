import { fileURLToPath } from 'node:url'
import react from '@vitejs/plugin-react'
import { configDefaults, defineConfig } from 'vitest/config'

const here = (p: string) => fileURLToPath(new URL(p, import.meta.url))

export default defineConfig({
  plugins: [react()],
  resolve: {
    tsconfigPaths: true, // Vite 8 built-in "@/*"
    alias: { 'server-only': here('./tests/stubs/empty.ts') }, // 'server-only' throws outside react-server
  },
  test: {
    restoreMocks: true,
    unstubEnvs: true,
    maxWorkers: 4, // VITEST_POOL_ID ∈ 1..4 → one DB per concurrent integration file
    coverage: {
      provider: 'v8',
      include: ['src/domain/**/*.ts'],
      exclude: ['src/domain/**/*.test.ts'],
      thresholds: { 'src/domain/**': { lines: 95, functions: 95, branches: 95, statements: 95 } },
      reporter: ['text-summary'],
    },
    projects: [
      {
        extends: true,
        test: {
          name: 'unit',
          environment: 'node',
          include: ['src/**/*.test.ts', 'scripts/**/*.test.ts'],
          exclude: [...configDefaults.exclude, '**/*.int.test.ts'],
        },
      },
      {
        extends: true,
        test: {
          name: 'ui',
          environment: 'jsdom',
          include: ['src/**/*.test.tsx'],
          setupFiles: ['./tests/setup/ui.ts'],
        },
      },
      {
        extends: true,
        test: {
          name: 'integration',
          environment: 'node',
          include: ['src/**/*.int.test.ts', 'scripts/**/*.int.test.ts', 'tests/**/*.int.test.ts'],
          globalSetup: ['./tests/setup/db-global.ts'],
          setupFiles: ['./tests/setup/db-worker.ts'],
          testTimeout: 20_000,
          hookTimeout: 60_000,
          // Better Auth's nextCookies() imports 'next/headers.js' itself; inlining better-auth lets the
          // vi.mock('next/headers') in db-worker.ts reach it, so login/logout cookies land in the test jar.
          server: { deps: { inline: [/better-auth/] } },
        },
      },
    ],
  },
})
