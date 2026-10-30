import { randomBytes } from 'node:crypto'
import postgres from 'postgres'
import type { TestProject } from 'vitest/node'
import { runMigrations } from '../../scripts/lib/migrate'

declare module 'vitest' {
  export interface ProvidedContext {
    adminUrl: string
    templateDb: string
    runId: string
  }
}

/** Admin connection to the dev Postgres from `pnpm db:up` (superuser `planner`). Override for CI. */
export const ADMIN_URL =
  process.env.TEST_ADMIN_DATABASE_URL ?? 'postgres://planner:planner@localhost:54329/postgres'
export const withDb = (url: string, db: string) => url.replace(/\/[^/?]+(\?|$)/, `/${db}$1`)

/**
 * Creates a migrated template DB once per Vitest run (PLAN.md §4.2). Names carry a per-run id (M0-D17) so two
 * concurrent runs never drop each other's databases; teardown drops only this run's template and worker DBs.
 */
export default async function setup(project: TestProject) {
  const runId = randomBytes(3).toString('hex')
  const templateDb = `planner_tpl_${runId}`
  const admin = postgres(ADMIN_URL, { max: 1, onnotice: () => {} })
  try {
    await admin.unsafe(`create database ${templateDb}`)
  } finally {
    await admin.end()
  }
  await runMigrations(withDb(ADMIN_URL, templateDb)) // closes its connection: a TEMPLATE must have none
  project.provide('adminUrl', ADMIN_URL)
  project.provide('templateDb', templateDb)
  project.provide('runId', runId)
  return async () => {
    const a = postgres(ADMIN_URL, { max: 1, onnotice: () => {} })
    try {
      const dbs = await a<{ datname: string }[]>`
        select datname from pg_database where datname = ${templateDb} or datname like ${`planner_t_${runId}_w%`}`
      for (const { datname } of dbs) await a.unsafe(`drop database if exists "${datname}" with (force)`)
    } finally {
      await a.end()
    }
  }
}
