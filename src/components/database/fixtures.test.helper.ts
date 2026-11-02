// Test-only fixtures of the database UI (plan/m11 S3): a "ทะเบียนความเสี่ยง" database with one column of every
// type and five rows (AC-1403 shape: two rows match "สถานะ เป็น กำลังทำ" + "ปิดแล้ว ไม่ติ๊ก").
import type { DatabaseResponse, DbColumnDTO, DbRowDTO, DbViewDTO } from '@/lib/contracts/databases'
import { createFakeDbApi, type FakeDbApi } from './data/fakeDbApi.test-helper'

export const C = {
  title: 'c-title',
  status: 'c-status',
  date: 'c-date',
  num: 'c-num',
  done: 'c-done',
  people: 'c-people',
  tags: 'c-tags',
  link: 'c-link',
  note: 'c-note',
} as const
export const O = { todo: 'o-todo', doing: 'o-doing', done: 'o-done', a: 'o-a', b: 'o-b' } as const

const col = (
  id: string,
  type: DbColumnDTO['type'],
  name: string,
  position: string,
  config: DbColumnDTO['config'] = {},
): DbColumnDTO => ({
  id,
  type,
  name,
  config,
  position,
  version: 1,
})

export const COLUMNS: DbColumnDTO[] = [
  col(C.title, 'TITLE', 'ชื่อ', 'a0'),
  col(C.status, 'SELECT', 'สถานะ', 'a1', {
    options: [
      { id: O.todo, name: 'ยังไม่เริ่ม', color: 'gray' },
      { id: O.doing, name: 'กำลังทำ', color: 'blue' },
      { id: O.done, name: 'เสร็จ', color: 'green' },
    ],
  }),
  col(C.date, 'DATE', 'วันที่', 'a2'),
  col(C.num, 'NUMBER', 'ผลกระทบ', 'a3', { decimals: null, thousands: true }),
  col(C.done, 'CHECKBOX', 'ปิดแล้ว', 'a4'),
  col(C.people, 'PERSON', 'คน', 'a5'),
  col(C.tags, 'MULTI_SELECT', 'ป้าย', 'a6', {
    options: [
      { id: O.a, name: 'ด่วน', color: 'red' },
      { id: O.b, name: 'ลูกค้า', color: 'purple' },
    ],
  }),
  col(C.link, 'URL', 'ลิงก์', 'a7'),
  col(C.note, 'TEXT', 'หมายเหตุ', 'a8'),
]

export const row = (
  id: string,
  title: string,
  position: string,
  cells: DbRowDTO['cells'] = {},
): DbRowDTO => ({
  id,
  title,
  cells,
  position,
  version: 1,
  hasBody: false,
  createdBy: 'u-cindy',
  createdAt: '2026-09-30T03:00:00.000Z',
  updatedBy: 'u-ivy',
  updatedAt: '2026-09-30T04:00:00.000Z',
})

export const ROWS: DbRowDTO[] = [
  row('r1', 'ลูกค้าส่ง spec ช้า', 'a0', { [C.status]: O.doing, [C.date]: '2026-11-05', [C.num]: '250000' }),
  row('r2', 'API ERP ไม่เสถียร', 'a1', { [C.status]: O.doing, [C.num]: '80000' }),
  row('r3', 'ทีมไม่พอ', 'a2', { [C.status]: O.doing, [C.done]: true, [C.num]: '5' }),
  row('r4', 'งบเกิน', 'a3', { [C.status]: O.todo }),
  row('r5', 'ไม่มีชื่อเรื่อง', 'a4', {}),
]

export const TABLE_VIEW: DbViewDTO = {
  id: 'v-table',
  type: 'TABLE',
  name: 'ตาราง',
  config: {},
  position: 'a0',
  version: 1,
}

export function makeDb(over: Partial<DatabaseResponse> = {}): DatabaseResponse {
  return {
    id: 'db-1',
    pageId: 'page-1',
    title: 'ทะเบียนความเสี่ยง',
    version: 1,
    canEdit: true,
    columns: COLUMNS,
    views: [TABLE_VIEW],
    rows: ROWS,
    people: {
      'u-cindy': { name: 'Cindy', nickname: null, color: null, deactivated: false },
      'u-ivy': { name: 'Ivy', nickname: null, color: null, deactivated: false },
      'u-old': { name: 'Old', nickname: null, color: null, deactivated: true },
    },
    ...over,
  }
}

export function makeApi(over: Partial<DatabaseResponse> = {}, opts: { canEdit?: boolean } = {}): FakeDbApi {
  return createFakeDbApi(makeDb(over), { viewerId: 'u-cindy', today: '2026-09-30', ...opts })
}

export const callsOf = (api: FakeDbApi, method: FakeDbApi['calls'][number]['method']) =>
  api.calls.filter((c) => c.method === method).map((c) => c.args)
