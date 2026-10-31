'use client'
import Button from '@mui/material/Button'
import ArchiveOutlined from '@mui/icons-material/ArchiveOutlined'
import UnarchiveOutlined from '@mui/icons-material/UnarchiveOutlined'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { useUndo } from '@/components/undo/useUndo'
import { th } from '@/i18n/th'
import { unwrap } from '@/lib/action-result'
import { invalidateProjects } from '@/lib/invalidate'
import { archiveProject, unarchiveProject } from '@/server/actions/projects'
import { errorMessage } from './errors'

/**
 * FR-406 (part, X17): archive immediately — no confirm dialog (P2) — with the 8 s "เลิกทำ" toast and Cmd/Ctrl+Z
 * through the shared undo stack. `action="unarchive"` restores an archived project (plain success toast).
 * Each action calls refresh(); the sidebar is invalidated here.
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
  const archive = () => doArchive().then(() => invalidateProjects(qc))
  const unarchive = () => doUnarchive().then(() => invalidateProjects(qc))

  // The kind travels as the mutation variable: the action's refresh() re-renders this button with the opposite
  // `action` prop before onSuccess runs, so reading the prop there would pick the wrong toast / skip the undo entry.
  const mutation = useMutation({
    mutationFn: (kind: 'archive' | 'unarchive') => (kind === 'archive' ? doArchive() : doUnarchive()),
    onError: (err) => toast.error(errorMessage(err)),
    onSuccess: (_r, kind) => {
      if (kind === 'unarchive') {
        toast.success(th.projects.toasts.unarchived(name))
      } else {
        const label = th.projects.toasts.archived(name)
        undo.push({ label, undo: unarchive, redo: archive }, { toast: label })
      }
      // Undo is registered as soon as the action commits (Cmd+Z works at once); the sidebar refetch follows.
      return invalidateProjects(qc)
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
