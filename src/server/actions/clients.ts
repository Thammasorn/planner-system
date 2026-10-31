'use server'
// src/server/actions/clients.ts — manager-only client management (§3.2 PERM-03, FR-301, FR-302, M2-D07, M2-D20).
// Shape: zod (wrapper) → authz.requireManager → service + audit in one tx → refresh() (M2-D09; /clients is RSC).
import { refresh } from 'next/cache'
import { th } from '@/i18n/th'
import type { Ok } from '@/lib/action-result'
import { clientIdSchema, createClientSchema, updateClientSchema } from '@/lib/schemas/clients'
import { action } from '../action'
import * as audit from '../audit'
import * as authz from '../authz'
import type { ClientRow } from '../db/schema'
import { db } from '../db/client'
import * as services from '../services'
import type { SessionUser } from '../session'

type ClientField = 'name' | 'code' | 'color' | 'note'
const CLIENT_FIELDS: readonly ClientField[] = ['name', 'code', 'color', 'note']

/** Only the columns that changed (audit before/after never carry unrelated columns). */
function changedClientFields(
  before: ClientRow,
  after: ClientRow,
): { before: Partial<ClientRow>; after: Partial<ClientRow> } {
  const b: Partial<ClientRow> = {}
  const a: Partial<ClientRow> = {}
  for (const k of CLIENT_FIELDS) {
    if (before[k] !== after[k]) {
      Object.assign(b, { [k]: before[k] })
      Object.assign(a, { [k]: after[k] })
    }
  }
  return { before: b, after: a }
}

export const createClient = action(
  createClientSchema,
  async (input, { user }): Promise<{ clientId: string }> => {
    authz.requireManager(user)
    const client = await db.transaction(async (tx) => {
      const c = await services.clients.createClient(tx, user, input)
      await audit.log(tx, user, {
        entity: 'client',
        entityId: c.id,
        action: 'create',
        summary: th.audit.clientCreated(c.name),
        after: { name: c.name, code: c.code, color: c.color, note: c.note },
      })
      return c
    })
    refresh()
    return { clientId: client.id }
  },
)

/** No audit row when nothing changed. */
export const updateClient = action(updateClientSchema, async (input, { user }): Promise<Ok> => {
  authz.requireManager(user)
  await db.transaction(async (tx) => {
    const { before, after } = await services.clients.updateClient(tx, user, input)
    const diff = changedClientFields(before, after)
    if (Object.keys(diff.after).length === 0) return
    await audit.log(tx, user, {
      entity: 'client',
      entityId: after.id,
      action: 'update',
      summary: th.audit.clientUpdated(after.name),
      before: diff.before,
      after: diff.after,
    })
  })
  refresh()
  return {}
})

async function setArchived(
  user: SessionUser,
  clientId: string,
  archived: boolean,
): Promise<{ changed: boolean }> {
  authz.requireManager(user)
  const changed = await db.transaction(async (tx) => {
    const r = await services.clients.setClientArchived(tx, clientId, archived)
    if (!r.changed) return false
    await audit.log(tx, user, {
      entity: 'client',
      entityId: clientId,
      action: 'update',
      summary: archived ? th.audit.clientArchived(r.client.name) : th.audit.clientUnarchived(r.client.name),
      before: { archived: !archived },
      after: { archived, archivedAt: r.client.archivedAt },
    })
    return true
  })
  refresh()
  return { changed }
}

/** FR-302: hidden from project pickers; its projects are untouched. Idempotent (M2-D20). */
export const archiveClient = action(clientIdSchema, ({ clientId }, { user }) =>
  setArchived(user, clientId, true),
)

export const unarchiveClient = action(clientIdSchema, ({ clientId }, { user }) =>
  setArchived(user, clientId, false),
)
