/**
 * Single source of e2e constants (plan/m00-scaffold.md S3.1, PLAN.md §4.5, X46).
 * The e2e app runs from a production build on its own port against its own database (`planner_e2e`).
 */
const ADMIN_URL = process.env.E2E_ADMIN_DATABASE_URL ?? 'postgres://planner:planner@localhost:54329/postgres'

export const E2E = {
  port: 3100,
  baseUrl: 'http://localhost:3100',
  dbName: 'planner_e2e',
  adminUrl: ADMIN_URL,
  databaseUrl: ADMIN_URL.replace(/\/[^/?]+(\?|$)/, '/planner_e2e$1'),
  /** Server "today" for M1+ (X45) and the browser clock (PLAN.md §4.5). */
  appNow: '2026-09-30T10:00:00+07:00',
  /** e2e-only secret, ≥ 32 chars; never used outside planner_e2e. */
  authSecret: 'e2e-only-secret-not-for-production-0123456789',
  uploadDir: '.e2e-uploads',
} as const
