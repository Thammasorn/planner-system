// src/components/people/people-tabs.ts — the person page tab bar (FR-1008, M9-D14). Data only; order is fixed:
// plan 0 · tasks 1 · leave 2.
import { th } from '@/i18n/th'

export type PeopleTabId = 'plan' | 'tasks' | 'leave'

export interface PeopleTab {
  id: PeopleTabId
  order: number
  label: string
}

export const PEOPLE_TABS: readonly PeopleTab[] = [
  { id: 'plan', order: 0, label: th.people.tabs.plan },
  { id: 'tasks', order: 1, label: th.people.tabs.tasks },
  { id: 'leave', order: 2, label: th.people.tabs.leave },
]

export const personTabHref = (userId: string, tab: PeopleTabId): string => `/people/${userId}/${tab}`
