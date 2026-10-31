'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Button from '@mui/material/Button'
import DeleteForeverOutlined from '@mui/icons-material/DeleteForeverOutlined'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { DeleteProjectDialog } from '@/components/common/DeleteProjectDialog'
import { th } from '@/i18n/th'
import { unwrap } from '@/lib/action-result'
import { invalidateProjects } from '@/lib/invalidate'
import { deleteProjectPermanently } from '@/server/actions/projects'
import { errorMessage } from './errors'

/** FR-407: manager only (the page shows it when `can.delete`). Opens the single confirm dialog of the product; on
 *  success the sidebar is invalidated and the viewer lands on /projects (the action does not refresh, M2-D09). */
export function DeleteProjectButton({ projectId, name }: { projectId: string; name: string }) {
  const [open, setOpen] = useState(false)
  const router = useRouter()
  const qc = useQueryClient()
  const confirm = async (typed: string) => {
    try {
      await unwrap(deleteProjectPermanently({ projectId, confirmName: typed }))
    } catch (err) {
      toast.error(errorMessage(err))
      throw err
    }
    await invalidateProjects(qc)
    router.replace('/projects')
    toast.success(th.projects.toasts.deleted(name))
  }
  return (
    <>
      <Button color="error" startIcon={<DeleteForeverOutlined />} onClick={() => setOpen(true)}>
        {th.projects.deletePermanently}
      </Button>
      <DeleteProjectDialog
        open={open}
        projectName={name}
        onClose={() => setOpen(false)}
        onConfirm={confirm}
      />
    </>
  )
}
