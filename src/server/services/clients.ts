// src/server/services/clients.ts — clients (FR-301..FR-303 part, M2-D04, M2-D07, M2-D20).
// Loaders start with authz (requireClient / visibleProjectIds / requireProject); mutations are called after
// authz.requireManager by the actions, inside their transaction (the action writes the audit row in the same tx).
import { th } from '@/i18n/th'
import { compareThai, sortByThai } from '@/lib/collate'
import type { ClientDetail, ClientListItem, ClientOption } from '@/lib/contracts/clients'
import type { createClientSchema, updateClientSchema } from '@/lib/schemas/clients'
import type { z } from '@/lib/z'
import * as authz from '../authz'
import type { ClientRow } from '../db/schema'
import type { DbOrTx } from '../db/types'
import { ConflictError, NotFoundError, pgErrorInfo } from '../errors'
import * as repo from '../repo'
import type { SessionUser } from '../session'
import { projectListItems } from './projects'
import { toClientRef } from './shared'

const nameTaken = (): ConflictError =>
  new ConflictError('CONFLICT', th.clients.errors.nameTaken, {
    fieldErrors: { name: [th.clients.errors.nameTaken] },
  })

/** 23505 on clients_name_unique (a raced insert/rename after the pre-check) → the same friendly conflict. */
function mapUnique(e: unknown): unknown {
  const info = pgErrorInfo(e)
  return info.code === '23505' && info.constraint === 'clients_name_unique' ? nameTaken() : e
}

const byName = (a: { name: string; id: string }, b: { name: string; id: string }): number =>
  compareThai(a.name, b.name) || compareThai(a.id, b.id)

/** Manager: all (archived only with includeArchived); workers: clients of their visible projects (archived shown,
 *  includeArchived ignored). `projectCount` counts only projects the viewer can see, archived ones included. */
export async function listClientsForViewer(
  tx: DbOrTx,
  user: SessionUser,
  opts: { includeArchived: boolean },
): Promise<ClientListItem[]> {
  const visible = await authz.visibleProjectIds(tx, user)
  const projects = await repo.projects.listProjects(tx, { ids: visible })
  const counts = new Map<string, number>()
  for (const p of projects) if (p.clientId) counts.set(p.clientId, (counts.get(p.clientId) ?? 0) + 1)
  const rows =
    visible === 'ALL'
      ? await repo.clients.listClients(tx, { includeArchived: opts.includeArchived })
      : await repo.clients.listClients(tx, { ids: new Set(counts.keys()), includeArchived: true })
  const withNote = visible === 'ALL' // managers edit from the row (ClientFormDialog needs the note)
  return rows
    .map((c) => ({
      ...toClientRef(c),
      projectCount: counts.get(c.id) ?? 0,
      ...(withNote ? { note: c.note } : {}),
    }))
    .sort(byName)
}

/** requireClient first (404 for invisible / unknown / malformed ids); projects = the viewer's visible ones. */
export async function getClientDetail(
  tx: DbOrTx,
  user: SessionUser,
  clientId: string,
): Promise<ClientDetail> {
  await authz.requireClient(tx, user, clientId)
  const client = await repo.clients.getClient(tx, clientId)
  if (!client) throw new NotFoundError()
  const visible = await authz.visibleProjectIds(tx, user)
  const rows = await repo.projects.listProjects(tx, { ids: visible, clientId })
  const projects = await projectListItems(tx, user, rows)
  return {
    client: { ...toClientRef(client), note: client.note },
    projects: sortByThai(projects, (p) => p.name),
    can: { manage: authz.isManager(user) },
  }
}

/** M2-D04: without projectId manager only (403); with projectId requireProject(…, 'manage') (404 / 403, archived
 *  → 403) and the project's current client appended even when archived. Non-archived clients only otherwise. */
export async function listClientOptions(
  tx: DbOrTx,
  user: SessionUser,
  projectId: string | null,
): Promise<ClientOption[]> {
  let currentClientId: string | null = null
  if (projectId === null) {
    authz.requireManager(user)
  } else {
    await authz.requireProject(tx, user, projectId, 'manage')
    currentClientId = (await repo.projects.getProject(tx, projectId))?.clientId ?? null
  }
  const active = (await repo.clients.listClients(tx, { includeArchived: false })).sort(byName)
  const out: ClientOption[] = active.map(toClientRef)
  if (currentClientId && !out.some((c) => c.id === currentClientId)) {
    const current = await repo.clients.getClient(tx, currentClientId)
    if (current) out.push(toClientRef(current))
  }
  return out
}

export async function createClient(
  tx: DbOrTx,
  _user: SessionUser,
  input: z.output<typeof createClientSchema>,
): Promise<ClientRow> {
  if (await repo.clients.findClientByName(tx, input.name)) throw nameTaken()
  try {
    return await repo.clients.insertClient(tx, {
      name: input.name,
      code: input.code ?? null,
      color: input.color ?? null,
      note: input.note ?? null,
    })
  } catch (e) {
    throw mapUnique(e)
  }
}

/** undefined fields stay unchanged; null clears code / color / note. */
export async function updateClient(
  tx: DbOrTx,
  _user: SessionUser,
  input: z.output<typeof updateClientSchema>,
): Promise<{ before: ClientRow; after: ClientRow }> {
  const before = await repo.clients.getClient(tx, input.clientId)
  if (!before) throw new NotFoundError()
  const patch: Partial<Pick<ClientRow, 'name' | 'code' | 'color' | 'note'>> = {}
  if (input.name !== undefined && input.name !== before.name) {
    const other = await repo.clients.findClientByName(tx, input.name)
    if (other && other.id !== before.id) throw nameTaken()
    patch.name = input.name
  }
  if (input.code !== undefined) patch.code = input.code
  if (input.color !== undefined) patch.color = input.color
  if (input.note !== undefined) patch.note = input.note
  if (Object.keys(patch).length === 0) return { before, after: before }
  try {
    const after = await repo.clients.updateClientRow(tx, before.id, patch)
    return { before, after }
  } catch (e) {
    throw mapUnique(e)
  }
}

/** No-op `{ changed: false }` when already in the requested state (M2-D20). */
export async function setClientArchived(
  tx: DbOrTx,
  clientId: string,
  archived: boolean,
): Promise<{ client: ClientRow; changed: boolean }> {
  const cur = await repo.clients.getClient(tx, clientId)
  if (!cur) throw new NotFoundError()
  if ((cur.archivedAt !== null) === archived) return { client: cur, changed: false }
  return { client: await repo.clients.setClientArchivedAt(tx, clientId, archived), changed: true }
}
