'use client'
// src/components/editor/hooks/usePersonName.ts — live display name of a mentioned user (FR-529, X09): the people
// directory (M2's GET /api/people/options, deactivated users included) is the only source; the document stores ids.
import { usePeopleOptions } from '@/hooks/usePeopleOptions'
import { displayName } from '@/lib/display-name'

export type PersonRef =
  { status: 'loading' } | { status: 'unknown' } | { status: 'ok'; name: string; active: boolean }

export function usePersonName(userId: string): PersonRef {
  const q = usePeopleOptions()
  if (q.isError) return { status: 'unknown' }
  if (!q.data) return { status: 'loading' }
  const p = q.data.find((o) => o.id === userId)
  if (!p) return { status: 'unknown' }
  return { status: 'ok', name: displayName(p), active: p.active }
}
