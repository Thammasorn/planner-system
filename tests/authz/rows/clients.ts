// PERM-03 / PERM-04 — SPEC §3.2 "สร้าง/แก้/archive ลูกค้า" (manager only → workers 403, X41) and "ดูลูกค้า"
// (M all · L/Me only clients of their projects · W none → 404, M2-D01). Client picker options: M2-D04.
// plan/m02-clients-projects-authz.md §7.2. Content of the lists is asserted in visibility.int.test.ts.
import { GET as getClientOptions } from '@/app/api/clients/options/route'
import { archiveClient, createClient, unarchiveClient, updateClient } from '@/server/actions/clients'
import { db } from '@/server/db/client'
import * as services from '@/server/services'
import { callRoute } from '../_support/http'
import { loaderOutcome } from '../_support/loader'
import { defineRow, type AuthzRow } from '../types'

const MGR = { M: 'allow', L: '403', Me: '403', W: '403' } as const

export const rows: AuthzRow[] = [
  defineRow({
    id: 'PERM-03a',
    spec: '§3.2 สร้างลูกค้า (FR-301)',
    action: 'createClient',
    mutates: true,
    audit: { entity: 'client' },
    expect: MGR,
    run: () => createClient({ name: 'New C' }),
  }),
  defineRow({
    id: 'PERM-03b',
    spec: '§3.2 แก้ลูกค้า (FR-301)',
    action: 'updateClient',
    mutates: true,
    audit: { entity: 'client' },
    expect: MGR,
    run: (w) => updateClient({ clientId: w.C1.id, name: 'C1x' }),
  }),
  defineRow({
    id: 'PERM-03c',
    spec: '§3.2 archive ลูกค้า (FR-302)',
    action: 'archiveClient',
    mutates: true,
    audit: { entity: 'client' },
    expect: MGR,
    run: (w) => archiveClient({ clientId: w.C1.id }),
  }),
  defineRow({
    id: 'PERM-03d',
    spec: '§3.2 เลิก archive ลูกค้า (FR-302, M2-D07)',
    action: 'unarchiveClient',
    mutates: true,
    audit: { entity: 'client' },
    expect: MGR,
    run: (w) => unarchiveClient({ clientId: w.C3.id }),
  }),
  defineRow({
    id: 'PERM-04a',
    spec: '§3.2 ดูลูกค้า — /clients list (every role; content filtered)',
    action: 'services.clients.listClientsForViewer',
    mutates: false,
    expect: { M: 'allow', L: 'allow', Me: 'allow', W: 'allow' },
    run: () =>
      loaderOutcome((user) => services.clients.listClientsForViewer(db, user, { includeArchived: false })),
  }),
  defineRow({
    id: 'PERM-04b',
    spec: '§3.2 ดูลูกค้า — C1 (client of P and A)',
    action: 'services.clients.getClientDetail',
    mutates: false,
    expect: { M: 'allow', L: 'allow', Me: 'allow', W: '404' },
    run: (w) => loaderOutcome((user) => services.clients.getClientDetail(db, user, w.C1.id)),
  }),
  defineRow({
    id: 'PERM-04c',
    spec: '§3.2 ดูลูกค้า — C2 (client of Q only)',
    action: 'services.clients.getClientDetail',
    mutates: false,
    expect: { M: 'allow', L: '404', Me: '404', W: 'allow' },
    run: (w) => loaderOutcome((user) => services.clients.getClientDetail(db, user, w.C2.id)),
  }),
  defineRow({
    id: 'PERM-04d',
    spec: '§3.2 ดูลูกค้า — C3 (archived, no projects)',
    action: 'services.clients.getClientDetail',
    mutates: false,
    expect: { M: 'allow', L: '404', Me: '404', W: '404' },
    run: (w) => loaderOutcome((user) => services.clients.getClientDetail(db, user, w.C3.id)),
  }),
  defineRow({
    id: 'PERM-04e',
    spec: 'M2-D04 client options without projectId (create-project picker) — manager only',
    action: 'GET /api/clients/options',
    mutates: false,
    expect: MGR,
    run: () => callRoute(getClientOptions, '/api/clients/options'),
  }),
  defineRow({
    id: 'PERM-04f',
    spec: 'M2-D04 / X61 client options for editing P — requireProject(manage)',
    action: 'GET /api/clients/options',
    mutates: false,
    expect: { M: 'allow', L: 'allow', Me: '403', W: '404' },
    run: (w) => callRoute(getClientOptions, `/api/clients/options?projectId=${w.P.id}`),
  }),
  defineRow({
    id: 'PERM-04g',
    spec: 'M2-D04 / X42 client options for archived A — read-only',
    action: 'GET /api/clients/options',
    mutates: false,
    expect: { M: '403', L: '403', Me: '403', W: '404' },
    run: (w) => callRoute(getClientOptions, `/api/clients/options?projectId=${w.A.id}`),
  }),
]
