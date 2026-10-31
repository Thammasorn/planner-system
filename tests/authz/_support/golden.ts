// tests/authz/_support/golden.ts — lookups into the golden seed (docs/reference/golden-fixtures.json, r8 §4.2).
import { readFileSync } from 'node:fs'
import { eq } from 'drizzle-orm'
import { narrowRole } from '@/server/authz'
import { db } from '@/server/db/client'
import { clients, projects, user } from '@/server/db/schema'
import { GOLDEN_PATH } from '../../../scripts/lib/fixtures'
import type { TestUser } from '../../helpers/factories'

export const GOLDEN_VIEWERS = ['Manager', 'Cindy', 'Ivy', 'Peter', 'Jack', 'Mint'] as const
export type GoldenViewer = (typeof GOLDEN_VIEWERS)[number]

export const GOLDEN_PROJECTS = [
  'POS Upgrade',
  'Data Warehouse',
  'Mobile App Revamp',
  'CRM Migration',
  'Store Analytics Dashboard',
] as const
export type GoldenProject = (typeof GOLDEN_PROJECTS)[number]

/** A golden user (by nickname) shaped for asUser(); golden users have no factory session row. */
export async function goldenUser(nickname: GoldenViewer): Promise<TestUser> {
  const [u] = await db.select().from(user).where(eq(user.nickname, nickname))
  if (!u) throw new Error(`golden user ${nickname} not seeded`)
  return {
    id: u.id,
    email: u.email,
    name: u.name,
    nickname: u.nickname ?? null,
    role: narrowRole(u.role),
    positionId: u.positionId ?? null,
    color: u.color ?? null,
    mustChangePassword: false,
    password: '',
    sessionId: '',
    sessionToken: '',
  }
}

export async function goldenProjectId(name: GoldenProject): Promise<string> {
  const [p] = await db.select({ id: projects.id }).from(projects).where(eq(projects.name, name))
  if (!p) throw new Error(`golden project ${name} not seeded`)
  return p.id
}

export async function goldenClientId(name: string): Promise<string> {
  const [c] = await db.select({ id: clients.id }).from(clients).where(eq(clients.name, name))
  if (!c) throw new Error(`golden client ${name} not seeded`)
  return c.id
}

/** Task names of the given golden projects, read from the JSON itself (never re-typed; M3 masking cases). */
export function goldenTaskNames(projectNames: readonly GoldenProject[]): string[] {
  const raw = JSON.parse(readFileSync(GOLDEN_PATH, 'utf8')) as { tasks: { project: string; name: string }[] }
  const wanted = new Set<string>(projectNames)
  return raw.tasks.filter((t) => wanted.has(t.project)).map((t) => t.name)
}
