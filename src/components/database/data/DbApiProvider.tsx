'use client'
// src/components/database/data/DbApiProvider.tsx — the real DbApi (contract.ts) of one database: the shared query
// (useDatabase) + the write queue (useDbMutations). Used by the block (DatabaseBlockView) and the row page /r (S4).
// Renders `loading` until the first answer and `notFound` when it fails (FR-1464: the same box for every reason).
import { type ReactNode, useMemo } from 'react'
import { useCurrentUser } from '@/hooks/useCurrentUser'
import { useToday } from '@/hooks/useToday'
import { type DbApi, DbApiContext } from './contract'
import { useDatabase } from './useDatabase'
import { useDbMutations } from './useDbMutations'

export interface DbApiProviderProps {
  pageId: string
  databaseId: string
  /** FR-1462: the page permission (never the lease); false forces read-only even when the server allows edits. */
  editable?: boolean
  loading: ReactNode
  notFound: ReactNode
  children: ReactNode
}

export function DbApiProvider(p: DbApiProviderProps): ReactNode {
  const q = useDatabase(p.pageId, p.databaseId)
  const m = useDbMutations({ pageId: p.pageId, databaseId: p.databaseId })
  const viewerId = useCurrentUser()?.id ?? ''
  const today = useToday()
  const db = q.data
  const editable = p.editable ?? true
  const api = useMemo<DbApi | null>(
    () => (db ? { ...m, db, canEdit: db.canEdit && editable, viewerId, today } : null),
    [m, db, editable, viewerId, today],
  )
  // FR-1464: a 404 and any other failure of the first load show the same box (no existence oracle)
  if (!api) return q.isError ? p.notFound : p.loading
  return <DbApiContext.Provider value={api}>{p.children}</DbApiContext.Provider>
}
