import postgres from 'postgres'
import type { TestProject } from 'vitest/node'

declare module 'vitest' {
  export interface ProvidedContext {
    adminUrl: string
    templateDb: string
  }
}

const ADMIN_URL = process.env.TEST_ADMIN_DATABASE_URL ?? 'postgres://postgres:pw@127.0.0.1:55491/postgres'
const TEMPLATE = 'app_template'
const withDb = (url: string, db: string) => url.replace(/\/[^/?]+(\?|$)/, `/${db}$1`)

// Stand-in for `drizzle-orm/postgres-js/migrator` migrate(db, { migrationsFolder: 'drizzle' }) + seed:golden
const MIGRATION = `
  create table tasks (id uuid primary key default gen_random_uuid(), project_id uuid not null, name text not null,
                      position text collate "C" not null);
  insert into tasks (project_id, name, position) values ('0f8fad5b-d9cb-469f-a165-70867728950e', 'seed task', 'a0');
`

/** Runs ONCE in the main process before any integration test file. */
export default async function setup(project: TestProject) {
  const admin = postgres(ADMIN_URL, { max: 1, onnotice: () => {} })
  await admin.unsafe(`drop database if exists ${TEMPLATE} with (force)`)
  await admin.unsafe(`create database ${TEMPLATE}`)
  const tpl = postgres(withDb(ADMIN_URL, TEMPLATE), { max: 1, onnotice: () => {} })
  await tpl.unsafe(MIGRATION)
  await tpl.end() // no open connections may remain on a TEMPLATE database
  await admin.end()
  project.provide('adminUrl', ADMIN_URL)
  project.provide('templateDb', TEMPLATE)

  return async () => {
    const a = postgres(ADMIN_URL, { max: 1, onnotice: () => {} })
    const dbs = await a<{ datname: string }[]>`select datname from pg_database where datname like 'app_test_w%' or datname = ${TEMPLATE}`
    for (const { datname } of dbs) await a.unsafe(`drop database if exists "${datname}" with (force)`)
    await a.end()
  }
}
