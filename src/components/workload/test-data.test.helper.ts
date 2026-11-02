// Test-only workload data built from the contracts (not imported by app code): the combined F2 + F3 state seen by the
// manager (M9-D26, §8.5 mock) over 4 weeks, plus single-cell builders.
import { overloadStatus } from '@/domain/overload'
import type { Cd, ISODate } from '@/domain/types'
import type {
  OverloadItem,
  WorkloadCell,
  WorkloadPerson,
  WorkloadProjectPart,
  WorkloadResponse,
} from '@/lib/contracts/workload'

export const U = {
  cindy: 'u-cindy',
  ivy: 'u-ivy',
  peter: 'u-peter',
  jack: 'u-jack',
  mint: 'u-mix',
} as const

export const P = {
  pos: '11111111-1111-4111-8111-111111111111',
  dw: '22222222-2222-4222-8222-222222222222',
  mobile: '33333333-3333-4333-8333-333333333333',
} as const

export const POS = {
  pm: 'a0000000-0000-4000-8000-000000000001',
  dev: 'a0000000-0000-4000-8000-000000000002',
  des: 'a0000000-0000-4000-8000-000000000003',
  qa: 'a0000000-0000-4000-8000-000000000004',
  data: 'a0000000-0000-4000-8000-000000000005',
} as const

export const WEEKS: ISODate[] = ['2026-09-28', '2026-10-05', '2026-10-12', '2026-10-19']

/** A cell with BR-40/41/X67 computed by the domain (as the server does). */
export function cell(
  total: Cd,
  committed: Cd,
  capacity: Cd,
  o: { standard?: Cd; byProject?: WorkloadProjectPart[] } = {},
): WorkloadCell {
  const standard = o.standard ?? 500
  const s = overloadStatus({ total, committed }, capacity, standard)
  return {
    total,
    committed,
    capacity,
    standard,
    level: s.level,
    excess: s.excessCd,
    cause: s.cause,
    byProject: o.byProject ?? (total > 0 ? [{ projectId: null, total, committed }] : []),
  }
}

function person(
  userId: string,
  name: string,
  positionId: string,
  cells: WorkloadCell[],
  extra: Partial<WorkloadPerson> = {},
): WorkloadPerson {
  return {
    userId,
    name,
    positionId,
    active: true,
    deactivatedOn: null,
    cells: Object.fromEntries(WEEKS.map((w, i) => [w, cells[i] ?? cell(0, 0, 500)])),
    ...extra,
  }
}

const part = (projectId: string | null, total: Cd, committed = total): WorkloadProjectPart => ({
  projectId,
  total,
  committed,
})

function item(p: WorkloadPerson, week: ISODate): OverloadItem {
  const c = p.cells[week]!
  if (c.level === 'OK' || c.cause === null) throw new Error('not an overload')
  return {
    userId: p.userId,
    name: p.name,
    week,
    level: c.level,
    excess: c.excess,
    cause: c.cause,
    total: c.total,
    committed: c.committed,
    capacity: c.capacity,
    standard: c.standard,
    deactivatedOn: p.deactivatedOn,
    href: `/people/${p.userId}/plan?week=${week}`,
  }
}

const cindy = person(U.cindy, 'Cindy', POS.pm, [cell(250, 250, 500, { byProject: [part(P.pos, 250)] })])
const mint = person(U.mint, 'Mint', POS.dev, [
  cell(500, 500, 500, { byProject: [part(P.mobile, 500)] }),
  cell(500, 500, 500, { byProject: [part(P.mobile, 500)] }),
  cell(500, 500, 500, { byProject: [part(P.mobile, 500)] }),
  cell(500, 500, 400, { byProject: [part(P.mobile, 500)] }),
])
const jack = person(U.jack, 'Jack', POS.des, [
  cell(375, 375, 500, { byProject: [part(P.mobile, 375)] }),
  cell(500, 500, 500, { byProject: [part(P.mobile, 500)] }),
  cell(500, 500, 500, { byProject: [part(P.mobile, 500)] }),
  cell(500, 500, 400, { byProject: [part(P.mobile, 500)] }),
])
const ivy = person(U.ivy, 'Ivy', POS.qa, [
  cell(250, 250, 500, { byProject: [part(P.pos, 250)] }),
  cell(125, 125, 500, { byProject: [part(P.pos, 125)] }),
])
const peter = person(U.peter, 'Peter', POS.data, [
  cell(500, 500, 500, { byProject: [part(P.dw, 500)] }),
  cell(500, 500, 300, { byProject: [part(P.dw, 500)] }),
  cell(375, 375, 500, { byProject: [part(P.dw, 375)] }),
  cell(250, 250, 400, { byProject: [part(P.dw, 250)] }),
])

/** Manager view of F2 + F3: 5 groups in position order, 3 overloads (Peter 5/10, Jack 19/10, Mint 19/10). */
export const F23: WorkloadResponse = {
  from: '2026-09-28',
  to: '2026-10-26',
  today: '2026-09-30',
  weeks: WEEKS,
  groups: [
    { positionId: POS.pm, name: 'Project Manager', people: [cindy] },
    { positionId: POS.dev, name: 'Developer', people: [mint] },
    { positionId: POS.des, name: 'Designer', people: [jack] },
    { positionId: POS.qa, name: 'QA', people: [ivy] },
    { positionId: POS.data, name: 'Data', people: [peter] },
  ],
  positions: [
    { id: POS.pm, name: 'Project Manager' },
    { id: POS.dev, name: 'Developer' },
    { id: POS.des, name: 'Designer' },
    { id: POS.qa, name: 'QA' },
    { id: POS.data, name: 'Data' },
  ],
  projects: {
    [P.pos]: { name: 'POS Upgrade', color: '#B45309' },
    [P.dw]: { name: 'Data Warehouse', color: '#0F766E' },
    [P.mobile]: { name: 'Mobile App Revamp', color: '#7C3AED' },
  },
  overloads: [item(peter, '2026-10-05'), item(jack, '2026-10-19'), item(mint, '2026-10-19')],
}
