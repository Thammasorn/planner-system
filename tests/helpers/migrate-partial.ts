// tests/helpers/migrate-partial.ts — partial-migration harness (plan/m06.1 S0.3). A scratch database receives the
// journaled migrations up to / from a tag so a data migration can be tested against rows written by the schema
// that precedes it (FR-692, AC-627). Integration project only: the admin URL and run id come from the global setup.
import { readFileSync } from 'node:fs'
import path from 'node:path'
import postgres from 'postgres'
import { inject } from 'vitest'

export interface JournalEntry {
  idx: number
  tag: string
}

const DRIZZLE_DIR = path.resolve(process.cwd(), 'drizzle')
const BREAKPOINT = '--> statement-breakpoint'

/** `drizzle/meta/_journal.json` entries in journal order (the order the Drizzle migrator applies them). */
export function readJournal(dir: string = DRIZZLE_DIR): JournalEntry[] {
  const raw = JSON.parse(readFileSync(path.join(dir, 'meta', '_journal.json'), 'utf8')) as {
    entries: JournalEntry[]
  }
  return [...raw.entries].sort((a, b) => a.idx - b.idx)
}

/** The SQL statements of one journal entry (split on Drizzle's breakpoint marker, blanks dropped). */
export function entryStatements(tag: string, dir: string = DRIZZLE_DIR): string[] {
  return readFileSync(path.join(dir, `${tag}.sql`), 'utf8')
    .split(BREAKPOINT)
    .map((s) => s.trim())
    .filter((s) => s !== '')
}

/** A tag matches its full name ('0009_m6_1_task_pages') or its numeric prefix ('0009'). */
const matches = (e: JournalEntry, tag: string): boolean => e.tag === tag || e.tag.startsWith(`${tag}_`)

function indexOf(entries: JournalEntry[], tag: string): number {
  const i = entries.findIndex((e) => matches(e, tag))
  if (i < 0) throw new Error(`migration ${tag} is not in drizzle/meta/_journal.json`)
  return i
}

/** Entries from `from` (inclusive, default first) to `upTo` (inclusive, default last), in journal order. */
export function selectEntries(
  entries: JournalEntry[],
  o: { upTo?: string; from?: string } = {},
): JournalEntry[] {
  const start = o.from === undefined ? 0 : indexOf(entries, o.from)
  const end = o.upTo === undefined ? entries.length - 1 : indexOf(entries, o.upTo)
  if (end < start) throw new Error(`upTo ${o.upTo} precedes from ${o.from}`)
  return entries.slice(start, end + 1)
}

/**
 * Applies the selected journal entries to `sql` in ONE transaction (like the Drizzle migrator: all or nothing).
 * Does not touch `drizzle.__drizzle_migrations` — scratch databases are never migrated by Drizzle afterwards.
 * Returns the applied tags.
 */
export async function applyJournal(
  sql: postgres.Sql,
  o: { upTo?: string; from?: string } = {},
): Promise<string[]> {
  const picked = selectEntries(readJournal(), o)
  await sql.begin(async (tx) => {
    for (const e of picked) for (const stmt of entryStatements(e.tag)) await tx.unsafe(stmt)
  })
  return picked.map((e) => e.tag)
}

/** Scratch DB name: carries the run and worker ids so the global teardown drops leftovers (`planner_t_<run>_w%`). */
export function scratchDbName(name: string): string {
  if (!/^[a-z0-9_]{1,24}$/.test(name)) throw new Error(`invalid scratch db name ${name}`)
  return `planner_t_${inject('runId')}_w${process.env.VITEST_POOL_ID ?? '1'}_${name}`
}

const adminUrl = (): string => inject('adminUrl')
const withDb = (url: string, db: string): string => url.replace(/\/[^/?]+(\?|$)/, `/${db}$1`)

/** Creates an EMPTY database (template0, no migrations) and returns a connection to it plus its URL. */
export async function createScratchDb(name: string): Promise<{ sql: postgres.Sql; url: string; db: string }> {
  const db = scratchDbName(name)
  const admin = postgres(adminUrl(), { max: 1, onnotice: () => {} })
  try {
    await admin.unsafe(`drop database if exists "${db}" with (force)`)
    await admin.unsafe(`create database "${db}" template template0`)
  } finally {
    await admin.end()
  }
  const url = withDb(adminUrl(), db)
  return { sql: postgres(url, { max: 1, onnotice: () => {} }), url, db }
}

/** Drops a scratch database created by `createScratchDb` (closes `sql` first when given). */
export async function dropScratchDb(name: string, sql?: postgres.Sql): Promise<void> {
  if (sql) await sql.end()
  const admin = postgres(adminUrl(), { max: 1, onnotice: () => {} })
  try {
    await admin.unsafe(`drop database if exists "${scratchDbName(name)}" with (force)`)
  } finally {
    await admin.end()
  }
}
