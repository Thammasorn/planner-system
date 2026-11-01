'use client'
import Button from '@mui/material/Button'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import Add from '@mui/icons-material/Add'
import { th } from '@/i18n/th'
import { PageTree } from './PageTree'
import { useCreatePage } from './usePageActions'
import { usePageTreeRoots } from './usePageTree'

/** Project tab "เอกสาร" (FR-408 part, X15): the project's page tree full width, with "สร้างหน้าใหม่" for writers. */
export function ProjectPagesView({ projectId, projectName }: { projectId: string; projectName: string }) {
  const roots = usePageTreeRoots('PROJECT', projectId)
  const { create, pending } = useCreatePage()
  return (
    <Stack spacing={2}>
      <Stack direction="row" spacing={2} sx={{ alignItems: 'center', justifyContent: 'space-between' }}>
        <Typography variant="h6" component="h2">
          {th.pages.projectTab.heading}
        </Typography>
        {roots.data?.canCreate ? (
          <Button
            variant="contained"
            startIcon={<Add />}
            disabled={pending}
            onClick={() => void create({ space: 'PROJECT', projectId, parentId: null })}
          >
            {th.pages.projectTab.newPage}
          </Button>
        ) : null}
      </Stack>
      <PageTree
        space="PROJECT"
        projectId={projectId}
        label={th.pages.tree.projectLabel(projectName)}
        variant="full"
        emptyLabel={th.pages.projectTab.empty}
      />
    </Stack>
  )
}
