'use client'
import { useQuery } from '@tanstack/react-query'
import { getJson } from '@/lib/api'
import type { PeopleOptionsResponse } from '@/lib/contracts/people'
import { sortPeople } from '@/lib/people/sort'
import { qk } from '@/lib/query-keys'

/** The people directory (X09) for pickers, sorted by display name. Includes deactivated users (`active: false`);
 *  pickers filter them out (X12). */
export function usePeopleOptions(opts: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: qk.peopleOptions(),
    queryFn: ({ signal }) => getJson<PeopleOptionsResponse>('/api/people/options', { signal }),
    staleTime: 5 * 60_000,
    select: (r) => sortPeople(r.people),
    enabled: opts.enabled ?? true,
  })
}
