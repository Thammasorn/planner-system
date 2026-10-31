'use client'
import { useState } from 'react'
import Button from '@mui/material/Button'
import Add from '@mui/icons-material/Add'
import { th } from '@/i18n/th'
import { ProjectFormDialog } from './ProjectFormDialog'

/** "สร้างโปรเจค" on /projects (FR-401; rendered for managers only — the action re-checks). */
export function CreateProjectButton() {
  const [open, setOpen] = useState(false)
  return (
    <>
      <Button variant="contained" startIcon={<Add />} onClick={() => setOpen(true)}>
        {th.projects.create}
      </Button>
      <ProjectFormDialog open={open} mode="create" onClose={() => setOpen(false)} />
    </>
  )
}
