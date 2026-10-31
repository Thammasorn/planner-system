// M2 S1.3 / S1.4 — clients (FR-301, FR-302, FR-303 part, M2-D04, M2-D07, M2-D20) + GET /api/clients/options + actions.
import { randomUUID } from 'node:crypto'
import { eq } from 'drizzle-orm'
import { describe, expect, it, vi } from 'vitest'
import { GET } from '@/app/api/clients/options/route'
import { th } from '@/i18n/th'
import type { ClientOptionsResponse } from '@/lib/contracts/clients'
import {
  archiveClient,
  createClient as createClientAction,
  unarchiveClient,
  updateClient as updateClientAction,
} from '../actions/clients'
import { asUser, toSessionUser } from '../../../tests/helpers/as-user'
import { auditCount, auditRowsAfter } from '../../../tests/helpers/audit'
import { makeClient } from '../../../tests/helpers/factories'
import { testCache } from '../../../tests/helpers/request'
import { createWorld } from '../../../tests/helpers/world'
import { db } from '../db/client'
import { clients } from '../db/schema'
import { ConflictError, ForbiddenError, NotFoundError } from '../errors'
import * as repo from '../repo'
import {
  createClient,
  getClientDetail,
  listClientOptions,
  listClientsForViewer,
  setClientArchived,
  updateClient,
} from './clients'
import { getProjectHeader } from './projects'

const S = toSessionUser

describe('createClient / updateClient', () => {
  it('trims and stores nulls for absent optional fields', async () => {
    const w = await createWorld()
    const c = await db.transaction((tx) => createClient(tx, S(w.manager), { name: 'SCB' }))
    expect(c).toMatchObject({ name: 'SCB', code: null, color: null, note: null, archivedAt: null })
  })

  it('duplicate of an archived name → CONFLICT nameTaken (pre-check)', async () => {
    const w = await createWorld()
    await makeClient({ name: 'Coral', archived: true })
    const err = await db
      .transaction((tx) => createClient(tx, S(w.manager), { name: 'Coral' }))
      .catch((e: unknown) => e)
    expect(err).toBeInstanceOf(ConflictError)
    expect((err as ConflictError).message).toBe(th.clients.errors.nameTaken)
  })

  it('a raced insert (pre-check missed it) maps 23505 clients_name_unique to the same error', async () => {
    const w = await createWorld()
    await makeClient({ name: 'Coral' })
    const spy = vi.spyOn(repo.clients, 'findClientByName').mockResolvedValue(null)
    const err = await db
      .transaction((tx) => createClient(tx, S(w.manager), { name: 'Coral' }))
      .catch((e: unknown) => e)
    expect(err).toBeInstanceOf(ConflictError)
    expect((err as ConflictError).code).toBe('CONFLICT')
    expect((err as ConflictError).message).toBe(th.clients.errors.nameTaken)
    expect(spy).toHaveBeenCalledTimes(1)
  })

  it('update renames (before/after); renaming onto an existing name → CONFLICT; nulls clear', async () => {
    const w = await createWorld()
    const r = await db.transaction((tx) =>
      updateClient(tx, S(w.manager), { clientId: w.C1.id, name: 'C1 renamed', code: 'C1' }),
    )
    expect(r.before.name).toBe('World C1')
    expect(r.after).toMatchObject({ name: 'C1 renamed', code: 'C1' })
    const err = await db
      .transaction((tx) => updateClient(tx, S(w.manager), { clientId: w.C1.id, name: 'World C3' }))
      .catch((e: unknown) => e)
    expect(err).toBeInstanceOf(ConflictError)
    expect((err as ConflictError).message).toBe(th.clients.errors.nameTaken)
    const cleared = await db.transaction((tx) =>
      updateClient(tx, S(w.manager), { clientId: w.C1.id, code: null }),
    )
    expect(cleared.after.code).toBeNull()
    await expect(
      db.transaction((tx) => updateClient(tx, S(w.manager), { clientId: randomUUID(), name: 'x' })),
    ).rejects.toBeInstanceOf(NotFoundError)
  })
})

describe('archive', () => {
  it('setClientArchived is idempotent; projects keep their client, shown as archived', async () => {
    const w = await createWorld()
    const first = await db.transaction((tx) => setClientArchived(tx, w.C1.id, true))
    expect(first.changed).toBe(true)
    expect(first.client.archivedAt).not.toBeNull()
    const again = await db.transaction((tx) => setClientArchived(tx, w.C1.id, true))
    expect(again.changed).toBe(false)
    const header = await getProjectHeader(db, S(w.lead), w.P.id)
    expect(header.client).toMatchObject({ id: w.C1.id, archived: true })
    const back = await db.transaction((tx) => setClientArchived(tx, w.C1.id, false))
    expect(back.changed).toBe(true)
    expect(back.client.archivedAt).toBeNull()
  })
})

describe('listClientsForViewer', () => {
  it('manager: active only unless includeArchived; project counts include archived projects', async () => {
    const w = await createWorld()
    const active = await listClientsForViewer(db, S(w.manager), { includeArchived: false })
    expect(active.map((c) => [c.id, c.projectCount])).toEqual([
      [w.C1.id, 2],
      [w.C2.id, 1],
    ])
    const all = await listClientsForViewer(db, S(w.manager), { includeArchived: true })
    expect(all.map((c) => c.id)).toEqual([w.C1.id, w.C2.id, w.C3.id])
    expect(all[2]).toMatchObject({ archived: true, projectCount: 0 })
    expect(all.every((c) => 'note' in c)).toBe(true) // manager rows carry the note for row-level edit
  })

  it('workers: only clients of their projects (archived clients too, includeArchived ignored)', async () => {
    const w = await createWorld()
    const lead = await listClientsForViewer(db, S(w.lead), { includeArchived: false })
    expect(lead.map((c) => [c.id, c.projectCount])).toEqual([[w.C1.id, 2]])
    const outsider = await listClientsForViewer(db, S(w.outsider), { includeArchived: false })
    expect(outsider.map((c) => c.id)).toEqual([w.C2.id])
    expect(outsider.some((c) => 'note' in c)).toBe(false) // worker rows never carry the note
    await db.update(clients).set({ archivedAt: new Date() }).where(eq(clients.id, w.C2.id))
    const archived = await listClientsForViewer(db, S(w.outsider), { includeArchived: false })
    expect(archived).toEqual([expect.objectContaining({ id: w.C2.id, archived: true, projectCount: 1 })])
  })
})

describe('detail', () => {
  it('lead sees C1 with [A, P]; manager can manage; invisible / malformed → 404', async () => {
    const w = await createWorld()
    const d = await getClientDetail(db, S(w.lead), w.C1.id)
    expect(d.client).toMatchObject({ id: w.C1.id, name: 'World C1', note: null, archived: false })
    expect(d.projects.map((p) => p.id)).toEqual([w.A.id, w.P.id])
    expect(d.can.manage).toBe(false)
    expect((await getClientDetail(db, S(w.manager), w.C1.id)).can.manage).toBe(true)
    await expect(getClientDetail(db, S(w.lead), w.C2.id)).rejects.toBeInstanceOf(NotFoundError)
    await expect(getClientDetail(db, S(w.member), 'not-a-uuid')).rejects.toBeInstanceOf(NotFoundError)
  })

  it('a worker sees only their own projects of a shared client', async () => {
    const w = await createWorld()
    const d = await getClientDetail(db, S(w.outsider), w.C2.id)
    expect(d.projects.map((p) => p.id)).toEqual([w.Q.id])
  })
})

describe('options', () => {
  it('without projectId: manager → non-archived clients; workers → FORBIDDEN', async () => {
    const w = await createWorld()
    const opts = await listClientOptions(db, S(w.manager), null)
    expect(opts.map((c) => c.id)).toEqual([w.C1.id, w.C2.id])
    expect(Object.keys(opts[0]!).sort()).toEqual(['archived', 'code', 'color', 'id', 'name'])
    await expect(listClientOptions(db, S(w.lead), null)).rejects.toBeInstanceOf(ForbiddenError)
  })

  it('with projectId: editors get all non-archived clients; Me 403, W 404, archived project 403', async () => {
    const w = await createWorld()
    expect((await listClientOptions(db, S(w.lead), w.P.id)).map((c) => c.id)).toEqual([w.C1.id, w.C2.id])
    await expect(listClientOptions(db, S(w.member), w.P.id)).rejects.toBeInstanceOf(ForbiddenError)
    await expect(listClientOptions(db, S(w.outsider), w.P.id)).rejects.toBeInstanceOf(NotFoundError)
    await expect(listClientOptions(db, S(w.lead), w.A.id)).rejects.toBeInstanceOf(ForbiddenError)
  })

  it('the project’s current client is appended when archived', async () => {
    const w = await createWorld()
    await db.transaction((tx) => setClientArchived(tx, w.C1.id, true))
    const opts = await listClientOptions(db, S(w.lead), w.P.id)
    expect(opts.map((c) => [c.id, c.archived])).toEqual([
      [w.C2.id, false],
      [w.C1.id, true],
    ])
  })

  it('GET /api/clients/options: 200 / 403 / 404 and a malformed projectId → 400', async () => {
    const w = await createWorld()
    const call = (qs: string) =>
      GET(new Request(`http://t/api/clients/options${qs}`), { params: Promise.resolve({}) })
    asUser(w.manager)
    const ok = await call('')
    expect(ok.status).toBe(200)
    expect(((await ok.json()) as ClientOptionsResponse).clients.map((c) => c.name)).toEqual([
      'World C1',
      'World C2',
    ])
    asUser(w.lead)
    expect((await call('')).status).toBe(403)
    expect((await call(`?projectId=${w.P.id}`)).status).toBe(200)
    expect((await call('?projectId=nope')).status).toBe(400)
    asUser(w.outsider)
    expect((await call(`?projectId=${w.P.id}`)).status).toBe(404)
  })
})

describe('actions', () => {
  it('worker createClient → FORBIDDEN; manager → ok, one audit row (entity client, no project), refresh once', async () => {
    const w = await createWorld()
    asUser(w.lead)
    expect(await createClientAction({ name: 'Nope' })).toMatchObject({ ok: false, code: 'FORBIDDEN' })
    asUser(w.manager)
    const before = await auditCount()
    const res = await createClientAction({ name: '  SCB  ', code: 'SCB' })
    expect(res.ok).toBe(true)
    const rows = await auditRowsAfter(before)
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      entity: 'client',
      action: 'create',
      projectId: null,
      actorId: w.manager.id,
    })
    expect(rows[0]!.summary).toBe(th.audit.clientCreated('SCB'))
    expect(testCache.refresh).toHaveBeenCalledTimes(1)
    const dup = await createClientAction({ name: 'SCB' })
    expect(dup).toMatchObject({ ok: false, code: 'CONFLICT', message: th.clients.errors.nameTaken })
  })

  it('update audits only changed fields; archive/unarchive audit once and are idempotent', async () => {
    const w = await createWorld()
    asUser(w.manager)
    let mark = await auditCount()
    expect(await updateClientAction({ clientId: w.C1.id, name: 'C1x' })).toMatchObject({ ok: true })
    const [upd] = await auditRowsAfter(mark)
    expect(upd).toMatchObject({
      entity: 'client',
      action: 'update',
      before: { name: 'World C1' },
      after: { name: 'C1x' },
    })

    mark = await auditCount()
    expect(await archiveClient({ clientId: w.C1.id })).toEqual({ ok: true, changed: true })
    expect(await archiveClient({ clientId: w.C1.id })).toEqual({ ok: true, changed: false })
    expect(await unarchiveClient({ clientId: w.C3.id })).toEqual({ ok: true, changed: true })
    expect(await unarchiveClient({ clientId: w.C3.id })).toEqual({ ok: true, changed: false })
    const rows = await auditRowsAfter(mark)
    expect(rows.map((r) => [r.entityId, r.summary])).toEqual([
      [w.C1.id, th.audit.clientArchived('C1x')],
      [w.C3.id, th.audit.clientUnarchived('World C3')],
    ])
    asUser(w.lead)
    expect(await archiveClient({ clientId: w.C1.id })).toMatchObject({ ok: false, code: 'FORBIDDEN' })
  })
})
