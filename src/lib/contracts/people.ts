// src/lib/contracts/people.ts — isomorphic, type-only people directory DTOs (X09, M2-D16).

/** `GET /api/people/options` row. `active` = not banned and no deactivated_on; deactivated users are included
 *  (existing members still render) and the member picker filters on `active` (X12). Never carries email. */
export interface PersonOption {
  id: string
  name: string
  nickname: string | null
  positionName: string | null
  color: string | null
  active: boolean
}

export interface PeopleOptionsResponse {
  people: PersonOption[]
}
