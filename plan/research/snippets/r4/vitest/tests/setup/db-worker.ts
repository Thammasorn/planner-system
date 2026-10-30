import postgres from 'postgres'
import { inject } from 'vitest'

// Runs in the worker before EACH integration test file (setupFiles). VITEST_POOL_ID is unique among
// concurrently running workers (1..maxWorkers), so every running file owns app_test_w<ID>.
const poolId = process.env.VITEST_POOL_ID ?? '1'
const dbName = `app_test_w${poolId}`
const adminUrl = inject('adminUrl')
const admin = postgres(adminUrl, { max: 1, onnotice: () => {} })
await admin.unsafe(`drop database if exists ${dbName} with (force)`)
await admin.unsafe(`create database ${dbName} template ${inject('templateDb')}`) // fresh copy per file
await admin.end()
process.env.DATABASE_URL = adminUrl.replace(/\/[^/?]+(\?|$)/, `/${dbName}$1`)
