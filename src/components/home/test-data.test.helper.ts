// Test-only: HomeResponse fixtures shaped like the golden data (r8 §4.10, F1/F3) for the home card tests.
import type { Cd, ISODate } from '@/domain/types'
import type { HomeManagerCards, HomeResponse, HomeUtilisationWeek } from '@/lib/contracts/home'
import type { WorkloadCell } from '@/lib/contracts/workload'

export const POS = '00000000-0000-4000-8000-00000000a001'
export const MOBILE = '00000000-0000-4000-8000-00000000a002'
export const CINDY = '00000000-0000-4000-8000-00000000b001'
export const IVY = '00000000-0000-4000-8000-00000000b002'
export const PETER = '00000000-0000-4000-8000-00000000b003'
export const TASK_POS = '00000000-0000-4000-8000-00000000c001'
export const TASK_2 = '00000000-0000-4000-8000-00000000c002'
export const CHARTER = '00000000-0000-4000-8000-00000000d001'
const STATUS = '00000000-0000-4000-8000-00000000e001'

export const WEEKS: ISODate[] = [
  '2026-09-28',
  '2026-10-05',
  '2026-10-12',
  '2026-10-19',
  '2026-10-26',
  '2026-11-02',
  '2026-11-09',
  '2026-11-16',
]

export function cell(total: Cd, capacity: Cd = 500, over: Partial<WorkloadCell> = {}): WorkloadCell {
  return {
    total,
    committed: total,
    capacity,
    standard: 500,
    level: 'OK',
    excess: 0,
    cause: null,
    byProject: [],
    ...over,
  }
}

/** Peter F1 (r8 §4.10): 5, 5, 3.75, 2.5, 0, 2.5, 3.75, 5 days. */
export const PETER_F1: Cd[] = [500, 500, 375, 250, 0, 250, 375, 500]

const util = (week: ISODate, t: number | null): HomeUtilisationWeek => ({
  week,
  totalCd: 0,
  committedCd: 0,
  capacityCd: t === null ? 0 : 2500,
  percentTenths: t,
  committedPercentTenths: t,
})

export const MANAGER: HomeManagerCards = {
  overloaded: [
    {
      userId: PETER,
      name: 'Peter',
      week: '2026-10-05',
      level: 'OVER',
      excess: 200,
      cause: 'CAPACITY',
      total: 500,
      committed: 500,
      capacity: 300,
      standard: 500,
      deactivatedOn: null,
      href: `/people/${PETER}/plan?week=2026-10-05`,
    },
  ],
  utilisation: {
    weeks: [
      util('2026-09-28', 725),
      util('2026-10-05', 650),
      util('2026-10-12', 750),
      util('2026-10-19', null),
    ],
    total: util('2026-09-28', 740),
  },
}

/** Cindy's home at 2026-09-30 10:00 (F3: next-week Peter leave masked). */
export function homeResponse(over: Partial<HomeResponse> = {}): HomeResponse {
  return {
    today: '2026-09-30',
    now: '2026-09-30T03:00:00.000Z',
    weekStart: '2026-09-28',
    myTasks: {
      items: [
        {
          id: TASK_POS,
          projectId: POS,
          name: 'ปรับปรุงระบบ POS หน้าร้าน',
          parentName: 'Rollout สาขา',
          startDate: '2026-09-28',
          dueDate: '2026-10-16',
          status: { id: STATUS, name: 'ยังไม่เริ่ม', color: '#9E9E9E', category: 'TODO' },
          hasBody: false,
          project: { id: POS, name: 'POS Upgrade', color: '#2F5597', certainty: 'CONFIRMED' },
          firstWeek: '2026-09-28',
          plannedCd: 250,
        },
        {
          id: TASK_2,
          projectId: POS,
          name: 'ทำ UAT + คู่มือหน้าร้าน',
          parentName: null,
          startDate: null,
          dueDate: null,
          status: { id: STATUS, name: 'ยังไม่เริ่ม', color: '#9E9E9E', category: 'TODO' },
          hasBody: false,
          project: { id: POS, name: 'POS Upgrade', color: '#2F5597', certainty: 'CONFIRMED' },
          firstWeek: '2026-09-28',
          plannedCd: 100,
        },
      ],
      more: 0,
    },
    myLoad: WEEKS.map((week, i) => ({ week, cell: cell(PETER_F1[i]!) })),
    milestones: [
      {
        id: '00000000-0000-4000-8000-00000000f001',
        projectId: POS,
        projectName: 'POS Upgrade',
        projectColor: '#2F5597',
        name: 'UAT sign-off',
        date: '2026-10-02',
        status: 'DUE_SOON',
        late: true,
      },
    ],
    leave: {
      today: [],
      thisWeek: [],
      nextWeek: [
        {
          userId: PETER,
          name: 'Peter',
          entry: {
            kind: 'masked',
            userId: PETER,
            startDate: '2026-10-05',
            endDate: '2026-10-06',
            half: null,
            label: 'ลา',
          },
        },
      ],
    },
    recentPages: [
      {
        id: CHARTER,
        title: 'Project Charter',
        icon: null,
        projectName: 'POS Upgrade',
        updatedAt: '2026-09-30T01:00:00.000Z',
        updatedBy: { id: IVY, name: 'Ivy' },
        href: `/p/${CHARTER}`,
      },
    ],
    manager: null,
    ...over,
  }
}
