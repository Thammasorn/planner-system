// src/lib/contracts/clients.ts — isomorphic, type-only client DTOs (FR-301..FR-303, M2 S0.5).
import type { ProjectListItem } from './projects'

export interface ClientRef {
  id: string
  name: string
  code: string | null
  color: string | null
  archived: boolean
}

/** Client picker option (M2-D04): non-archived clients, plus the project's current client even when archived. */
export interface ClientOption {
  id: string
  name: string
  code: string | null
  color: string | null
  archived: boolean
}

export interface ClientOptionsResponse {
  clients: ClientOption[]
}

/** `/clients` row; `projectCount` counts only projects the viewer can see (archived ones included). `note` is sent
 *  on manager rows only (row-level edit); worker rows omit the key. */
export interface ClientListItem extends ClientRef {
  projectCount: number
  note?: string | null
}

/** `/clients/[id]` (FR-303 part, no load until M9). */
export interface ClientDetail {
  client: ClientRef & { note: string | null }
  projects: ProjectListItem[]
  can: { manage: boolean }
}
