'use client'
import Button from '@mui/material/Button'
import ArchiveOutlined from '@mui/icons-material/ArchiveOutlined'
import UnarchiveOutlined from '@mui/icons-material/UnarchiveOutlined'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { useUndo } from '@/components/undo/useUndo'
import { formatCd } from '@/domain/units'
import { th } from '@/i18n/th'
import { unwrap } from '@/lib/action-result'
import { invalidateLoad, invalidateProjects } from '@/lib/invalidate'
import { archiveProject, unarchiveProject } from '@/server/actions/projects'
import { errorMessage } from './errors'

/**
 * FR-406 (X17, M6-D17): archive immediately — no confirm dialog (P2) — with the 8 s "เลิกทำ" toast and Cmd/Ctrl+Z
 * through the shared undo stack; the toast names the future load the archive releases (X person-days) when > 0.
 * `action="unarchive"` restores an archived project (plain success toast). Each action calls refresh(); the sidebar
 * and every load view (BR-44: archived projects stop counting) are invalidated here.
 */
export function ArchiveProjectButton({
  projectId,
  name,
  action,
}: {
  projectId: string
  name: string
  action: 'archive' | 'unarchive'
}) {
  const qc = useQueryClient()
  const undo = useUndo()
  const doArchive = () => unwrap(archiveProject({ projectId }))
  const doUnarchive = () => unwrap(unarchiveProject({ projectId }))
  const refreshViews = () => Promise.all([invalidateProjects(qc), invalidateLoad(qc)]).then(() => {})
  const archive = () => doArchive().then(refreshViews)
  const unarchive = () => doUnarchive().then(refreshViews)

  // The kind travels as the mutation variable: the action's refresh() re-renders this button with the opposite
  // `action` prop before onSuccess runs, so reading the prop there would pick the wrong toast / skip the undo entry.
  const mutation = useMutation({
    mutationFn: async (kind: 'archive' | 'unarchive'): Promise<{ releasedCd: number }> =>
      kind === 'archive' ? doArchive() : doUnarchive().then(() => ({ releasedCd: 0 })),
    onError: (err) => toast.error(errorMessage(err)),
    onSuccess: (r, kind) => {
      if (kind === 'unarchive') {
        toast.success(th.projects.toasts.unarchived(name))
      } else {
        const label = th.projects.toasts.archived(name)
        const releasedCd = r.releasedCd ?? 0 // older servers / mocks without the M6 field
        const message =
          releasedCd > 0
            ? th.projects.toasts.archivedReleased(name, formatCd(releasedCd, { unit: 'DAYS', decimals: 1 }))
            : label
        undo.push({ label, undo: unarchive, redo: archive }, { toast: message })
      }
      // Undo is registered as soon as the action commits (Cmd+Z works at once); the sidebar/load refetch follows.
      return refreshViews()
    },
  })

  return (
    <Button
      variant="outlined"
      startIcon={action === 'archive' ? <ArchiveOutlined /> : <UnarchiveOutlined />}
      // Not `disabled` while pending: that drops keyboard focus to <body> (SPEC §8.9, KEY-03). The same element
      // re-renders as the opposite action after refresh(), so focus stays on it; repeat presses are ignored.
      aria-disabled={mutation.isPending || undefined}
      onClick={() => {
        if (!mutation.isPending) mutation.mutate(action)
      }}
    >
      {action === 'archive' ? th.projects.archive : th.projects.unarchive}
    </Button>
  )
}
