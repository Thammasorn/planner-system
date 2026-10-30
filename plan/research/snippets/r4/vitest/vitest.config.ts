import { fileURLToPath } from 'node:url'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

const here = (p: string) => fileURLToPath(new URL(p, import.meta.url))

export default defineConfig({
  plugins: [react()],
  resolve: {
    tsconfigPaths: true, // Vite 8 built-in: resolves "@/*" from tsconfig paths (no vite-tsconfig-paths plugin)
    alias: { 'server-only': here('./tests/stubs/empty.ts') }, // 'server-only' throws outside the react-server condition
  },
  test: {
    restoreMocks: true,
    unstubEnvs: true,
    coverage: {
      provider: 'v8',
      include: ['src/domain/**/*.ts'],
      exclude: ['src/domain/**/*.test.ts'],
      thresholds: { 'src/domain/**': { lines: 95, functions: 95, branches: 95, statements: 95 } },
      reporter: ['text'],
    },
    projects: [
      { extends: true, test: { name: 'domain', environment: 'node', include: ['src/domain/**/*.test.ts'] } },
      {
        extends: true,
        test: { name: 'ui', environment: 'jsdom', include: ['src/**/*.test.tsx'], setupFiles: ['./tests/setup/ui.ts'] },
      },
      {
        extends: true,
        test: {
          name: 'integration',
          environment: 'node',
          include: ['tests/integration/**/*.test.ts'],
          globalSetup: ['./tests/setup/db-global.ts'],
          setupFiles: ['./tests/setup/db-worker.ts'],
          testTimeout: 20_000,
          hookTimeout: 60_000,
        },
      },
    ],
  },
})
