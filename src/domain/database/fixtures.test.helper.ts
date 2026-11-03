// src/domain/database/fixtures.test.helper.ts — shared fixtures for the database domain tests (plan/m11 S1).
// Not a test file (no suite); the `.test.` infix lets it hold Thai sample names (ESLint THAI_ALLOWED).
import type { DbColumnModel, DbCtx, DbPersonRef, DbRowModel, SelectOption } from '../types'

export const TODAY = '2026-11-02'
export const CINDY = 'u-cindy'
export const IVY = 'u-ivy'
export const MINT = 'u-mint'
export const OLD = 'u-old'

export const PEOPLE = new Map<string, DbPersonRef>([
  [CINDY, { name: 'ซินดี้ ชัยวัฒน์', nickname: 'Cindy', color: null, deactivated: false }],
  [IVY, { name: 'ไอวี่ อิศรา', nickname: 'Ivy', color: null, deactivated: false }],
  [MINT, { name: 'มินท์ มานะ', nickname: 'Mint', color: null, deactivated: false }],
  [OLD, { name: 'กมล เก่า', nickname: null, color: null, deactivated: true }],
])

export const ctx: DbCtx = { people: PEOPLE, viewerId: MINT, today: TODAY }

export const OPT_TODO: SelectOption = { id: 'o-todo', name: 'ยังไม่เริ่ม', color: 'gray' }
export const OPT_DOING: SelectOption = { id: 'o-doing', name: 'กำลังทำ', color: 'blue' }
export const OPT_DONE: SelectOption = { id: 'o-done', name: 'เสร็จ', color: 'green' }

let n = 0
export function col(type: DbColumnModel['type'], over: Partial<DbColumnModel> = {}): DbColumnModel {
  n += 1
  const config: DbColumnModel['config'] =
    type === 'SELECT' || type === 'MULTI_SELECT'
      ? { options: [OPT_TODO, OPT_DOING, OPT_DONE] }
      : type === 'NUMBER'
        ? { decimals: null, thousands: true }
        : {}
  return { id: `c-${type.toLowerCase()}-${n}`, type, name: type, config, position: `a${n}`, ...over }
}

export function row(
  id: string,
  cells: Record<string, unknown> = {},
  over: Partial<DbRowModel> = {},
): DbRowModel {
  return { id, title: id, cells, position: 'a0', ...over }
}
