import { defineConfig } from 'drizzle-kit'

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/server/db/schema.ts',
  out: './drizzle',
  dbCredentials: { url: process.env.DATABASE_URL ?? 'postgres://planner:scratchpw@127.0.0.1:55417/planner_drizzle' },
  strict: true,
  verbose: true,
})
