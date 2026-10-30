// src/instrumentation.ts — runs once when the Next server starts (X45).
export function register(): void {
  if (process.env.NODE_ENV === 'production' && (process.env.ALLOW_TEST_HOOKS === '1' || process.env.APP_NOW)) {
    console.warn('[clock] ALLOW_TEST_HOOKS/APP_NOW set in production — test-only settings')
  }
}
