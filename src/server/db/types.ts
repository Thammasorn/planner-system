// src/server/db/types.ts — type-only DB handles (M1-D4: no 'server-only'). Repo/services import these with
// `import type` so they never pull in the postgres client at runtime.
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import type * as schema from './schema'

export type Schema = typeof schema
export type Db = PostgresJsDatabase<Schema>
export type Tx = Parameters<Parameters<Db['transaction']>[0]>[0]
export type DbOrTx = Db | Tx
