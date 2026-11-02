// Test-only calendar data built from the contracts (not imported by app code).
import type { ISODate } from '@/domain/types'
import type {
  CalendarPerson,
  CalendarResponse,
  CalendarTimeOff,
  CalendarTimeOffFull,
  CalendarTimeOffMasked,
} from '@/lib/contracts/calendar'
import type { CurrentUserDTO } from '@/lib/contracts/users'
import type { LeaveTypeDTO } from '@/lib/contracts/leave-types'
import type { PersonOption } from '@/lib/contracts/people'

export const IDS = {
  peter: 'u-peter',
  ivy: 'u-ivy',
  cindy: 'u-cindy',
  jack: 'u-jack',
  mint: 'u-mix',
  manager: 'u-manager',
} as const

export const VACATION: LeaveTypeDTO = {
  id: '0b6f7c1e-1111-4a6c-9a0e-000000000001',
  name: 'ลาพักร้อน',
  color: '#0369A1',
  archived: false,
}
export const SICK: LeaveTypeDTO = {
  id: '0b6f7c1e-1111-4a6c-9a0e-000000000002',
  name: 'ลาป่วย',
  color: '#B91C1C',
  archived: false,
}

export function person(id: string, displayName: string, active = true): CalendarPerson {
  return { id, displayName, name: `${displayName} Fullname`, positionName: null, color: null, active }
}

export const PEOPLE: Record<string, CalendarPerson> = {
  [IDS.peter]: person(IDS.peter, 'Peter'),
  [IDS.ivy]: person(IDS.ivy, 'Ivy'),
  [IDS.cindy]: person(IDS.cindy, 'Cindy'),
  [IDS.jack]: person(IDS.jack, 'Jack'),
  [IDS.mint]: person(IDS.mint, 'Mint', false),
}

let seq = 0
export function full(
  userId: string,
  startDate: ISODate,
  endDate: ISODate = startDate,
  extra: Partial<CalendarTimeOffFull> = {},
): CalendarTimeOffFull {
  seq += 1
  return {
    kind: 'full',
    id: `7a1c2c38-5a8e-4a6c-9a0e-${String(seq).padStart(12, '0')}`,
    userId,
    startDate,
    endDate,
    half: null,
    leaveTypeId: VACATION.id,
    leaveTypeName: VACATION.name,
    leaveTypeColor: VACATION.color,
    leaveTypeArchived: false,
    note: null,
    ...extra,
  }
}

export function masked(
  userId: string,
  startDate: ISODate,
  endDate: ISODate = startDate,
  half: CalendarTimeOffMasked['half'] = null,
): CalendarTimeOffMasked {
  return { kind: 'masked', userId, startDate, endDate, half, label: 'ลา' }
}

export function calendarData(
  from: ISODate,
  to: ISODate,
  timeOff: CalendarTimeOff[] = [],
  holidays: CalendarResponse['holidays'] = [],
): CalendarResponse {
  return {
    from,
    to,
    holidays,
    people: PEOPLE,
    timeOff,
    milestones: [],
    viewer: { userId: IDS.peter, canEditOthers: false },
  }
}

export const WORKER_USER: CurrentUserDTO = {
  id: IDS.peter,
  email: 'peter@example.com',
  name: 'Peter Fullname',
  nickname: 'Peter',
  displayName: 'Peter',
  role: 'worker',
  color: null,
}

export const MANAGER_USER: CurrentUserDTO = {
  id: IDS.manager,
  email: 'manager@example.com',
  name: 'Demo Manager',
  nickname: 'Manager',
  displayName: 'Manager',
  role: 'manager',
  color: null,
}

export function option(id: string, nickname: string, active = true): PersonOption {
  return {
    id,
    name: `${nickname} Fullname`,
    nickname,
    positionId: null,
    positionName: null,
    color: null,
    active,
  }
}

export const PEOPLE_OPTIONS: PersonOption[] = [
  option(IDS.cindy, 'Cindy'),
  option(IDS.ivy, 'Ivy'),
  option(IDS.manager, 'Manager'),
  option(IDS.peter, 'Peter'),
]
