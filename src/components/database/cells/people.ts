'use client'
// src/components/database/cells/people.ts — who a PERSON id is (M11-D33, §3.3): the database response's `people` map
// (name / nickname / colour / deactivated only) first, then the people directory cache for someone just picked
// (editors only; it is already loaded by the picker). Read-only viewers never fetch the directory.
import { useCallback } from 'react'
import { usePeopleOptions } from '@/hooks/usePeopleOptions'
import type { DbPersonRef } from '@/lib/contracts/databases'
import { useDbApi } from '../data/contract'

export type PersonLookup = (id: string) => DbPersonRef | undefined

export function usePersonLookup(): PersonLookup {
  const api = useDbApi()
  const options = usePeopleOptions({ enabled: api.canEdit }).data
  const people = api.db.people
  return useCallback(
    (id: string) => {
      const known = people[id]
      if (known) return known
      const o = options?.find((p) => p.id === id)
      return o ? { name: o.name, nickname: o.nickname, color: o.color, deactivated: !o.active } : undefined
    },
    [people, options],
  )
}
