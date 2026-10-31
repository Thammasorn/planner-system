'use client'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { useUndo } from '@/components/undo/useUndo'
import { th } from '@/i18n/th'
import { unwrap } from '@/lib/action-result'
import { invalidateProjects } from '@/lib/invalidate'
import { archiveClient, unarchiveClient } from '@/server/actions/clients'

/**
 * FR-302: archive a client immediately (no confirm, P2) with the 8 s "เลิกทำ" toast + Cmd/Ctrl+Z; unarchive with a
 * plain success toast. Both actions refresh() the RSC page; client pickers are invalidated here. Each function
 * resolves after the action (errors are toasted and rethrown so optimistic callers roll back).
 */
export function useClientArchive() {
  const qc = useQueryClient()
  const undo = useUndo()

  const run = async (fn: () => Promise<unknown>) => {
    try {
      await fn()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : th.errors.INTERNAL)
      throw err
    }
  }
  const doArchive = (clientId: string) =>
    unwrap(archiveClient({ clientId })).then(() => invalidateProjects(qc))
  const doUnarchive = (clientId: string) =>
    unwrap(unarchiveClient({ clientId })).then(() => invalidateProjects(qc))

  return {
    archive: (client: { id: string; name: string }) =>
      run(async () => {
        await unwrap(archiveClient({ clientId: client.id }))
        // Undo is registered as soon as the archive commits (Cmd+Z works at once); the picker refetch follows.
        const label = th.clients.toasts.archived(client.name)
        undo.push(
          { label, undo: () => doUnarchive(client.id), redo: () => doArchive(client.id) },
          { toast: label },
        )
        await invalidateProjects(qc)
      }),
    unarchive: (client: { id: string; name: string }) =>
      run(async () => {
        await doUnarchive(client.id)
        toast.success(th.clients.toasts.unarchived(client.name))
      }),
  }
}
