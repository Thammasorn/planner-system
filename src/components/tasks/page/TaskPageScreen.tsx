'use client'
// src/components/tasks/page/TaskPageScreen.tsx — the task as a document page `/t/[taskId]` (SPEC §4.6.4 FR-683/686,
// §8.12 sketch, M6.1-D7/D16/D18/D26; plan/m06.1 S3.3). Header bar: ← กลับ, `โปรเจค › งานแม่ › …`, save status + lease
// (portalled by the body), 🔗, ⋯ (คัดลอกลิงก์ · เปิดใน panel · เต็มความกว้าง · ลบงาน). Reading column: ☐ + the big
// title (Enter → body), the shared light properties, then the full body. First paint comes from the RSC view; live
// properties from `qk.projectTasks` — the same cache as the list, board and panel (one source, AC-622).
import { useMemo, useRef, useState } from 'react'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Checkbox from '@mui/material/Checkbox'
import Divider from '@mui/material/Divider'
import IconButton from '@mui/material/IconButton'
import ListItemIcon from '@mui/material/ListItemIcon'
import ListItemText from '@mui/material/ListItemText'
import Menu from '@mui/material/Menu'
import MenuItem from '@mui/material/MenuItem'
import Skeleton from '@mui/material/Skeleton'
import Typography from '@mui/material/Typography'
import CheckOutlined from '@mui/icons-material/CheckOutlined'
import DeleteOutlined from '@mui/icons-material/DeleteOutlined'
import LinkOutlined from '@mui/icons-material/LinkOutlined'
import MoreHoriz from '@mui/icons-material/MoreHoriz'
import ViewSidebarOutlined from '@mui/icons-material/ViewSidebarOutlined'
import { useQueryClient } from '@tanstack/react-query'
import { useRouter } from 'next/navigation'
import Link from '@/components/Link'
import { InlineEditText } from '@/components/common/InlineEditText'
import { TaskBody } from '@/components/editor/TaskBody'
import { copyLink } from '@/components/layout/CopyLinkButton'
import { DocColumn, DocInset } from '@/components/layout/DocColumn'
import { useInAppBack } from '@/components/layout/InAppHistory'
import { PageHeaderBar, type Crumb } from '@/components/layout/PageHeaderBar'
import { useFullWidth } from '@/components/layout/useFullWidth'
import { useHotkeys } from '@/hooks/useHotkeys'
import { th } from '@/i18n/th'
import type { TaskPageView } from '@/lib/contracts/task-pages'
import { patchTaskHasBody } from '@/lib/invalidate'
import { projectTasksHref, taskPageHref } from '@/lib/nav/task-href'
import { buildTaskRows, type TaskRowModel } from '@/lib/tasks/tree'
import { TaskProperties } from '../TaskProperties'
import { useProjectTasks } from '../useProjectTasks'
import { useTaskBodyView } from '../useTaskBodyView'
import { errorMessage, useTaskMutations } from '../useTaskMutations'

/** An open menu, listbox, dialog or popover owns Esc (R12: it may still be closing when the key reaches window). */
const OVERLAY =
  '[role="menu"],[role="listbox"],[role="dialog"],[role="alertdialog"],.MuiPopover-root,.MuiModal-root'

/** FR-686: Esc on the task page goes back only when nothing else wants the key. */
export function escapeGoesBack(e: { defaultPrevented: boolean }): boolean {
  if (e.defaultPrevented) return false
  return document.querySelector(OVERLAY) === null
}

/** Root → parent names from the live rows (fallback: the loader's ancestors). */
function ancestorsOf(rows: readonly TaskRowModel[], id: string): { id: string; name: string }[] | null {
  const byId = new Map(rows.map((r) => [r.id, r]))
  const self = byId.get(id)
  if (!self) return null
  const out: { id: string; name: string }[] = []
  for (let p = self.parentId; p !== null; p = byId.get(p)?.parentId ?? null) {
    const r = byId.get(p)
    if (!r) break
    out.unshift({ id: r.id, name: r.name })
  }
  return out
}

export function TaskPageScreen({ view }: { view: TaskPageView }) {
  const taskId = view.task.id
  const projectId = view.task.projectId
  const q = useProjectTasks(projectId)
  const m = useTaskMutations(projectId)
  const qc = useQueryClient()
  const bodyView = useTaskBodyView(taskId, view.body).data ?? view.body
  const back = useInAppBack(projectTasksHref(projectId))
  const router = useRouter()
  const rows = useMemo(() => (q.data ? buildTaskRows(q.data.tasks) : []), [q.data])
  const task = rows.find((r) => r.id === taskId)
  const name = task?.name ?? view.task.name
  const canEdit = q.data ? q.data.viewer.canEdit : view.body.can.edit
  const fw = useFullWidth({
    target: { taskId },
    initial: bodyView.page?.fullWidth ?? false,
    canEdit: view.body.can.edit,
    label: name,
  })
  const [menu, setMenu] = useState<HTMLElement | null>(null)
  const bodyRef = useRef<{ focus(): void }>(null)
  const titleRef = useRef<HTMLDivElement>(null)
  const enterInTitle = useRef(false)

  // FR-686 / SPEC §8.6: Esc = back (useHotkeys already skips inputs, the editor and handled events)
  useHotkeys([{ hotkey: { code: 'Escape', key: 'Escape' }, handler: back, skip: (e) => !escapeGoesBack(e) }])

  const ancestors = (q.data ? ancestorsOf(rows, taskId) : null) ?? view.ancestors
  const crumbs: Crumb[] = [
    { label: view.project.name, href: projectTasksHref(projectId) },
    ...ancestors.map((a) => ({ label: a.name, href: taskPageHref(a.id) })),
    { label: name },
  ]

  // M6.1-D26: the same 🔗 behaviour (and failure toast) as every other document header
  const copyTaskLink = () => copyLink(taskPageHref(taskId))
  const closeMenu = () => setMenu(null)
  const done = task?.completedOn != null
  const gone = q.data !== undefined && task === undefined

  return (
    <>
      <PageHeaderBar
        crumbs={crumbs}
        back={{ onClick: back }}
        actions={
          <>
            <IconButton
              aria-label={th.layout.copyLink}
              title={th.layout.copyLink}
              onClick={() => void copyTaskLink()}
            >
              <LinkOutlined fontSize="small" />
            </IconButton>
            <IconButton
              aria-label={th.layout.more}
              title={th.layout.more}
              aria-haspopup="menu"
              aria-expanded={menu !== null}
              onClick={(e) => setMenu(e.currentTarget)}
            >
              <MoreHoriz fontSize="small" />
            </IconButton>
            <Menu anchorEl={menu} open={menu !== null} onClose={closeMenu}>
              <MenuItem
                onClick={() => {
                  closeMenu()
                  void copyTaskLink()
                }}
              >
                <ListItemIcon>
                  <LinkOutlined fontSize="small" />
                </ListItemIcon>
                <ListItemText>{th.layout.copyLink}</ListItemText>
              </MenuItem>
              <MenuItem component={Link} href={projectTasksHref(projectId, taskId)} onClick={closeMenu}>
                <ListItemIcon>
                  <ViewSidebarOutlined fontSize="small" />
                </ListItemIcon>
                <ListItemText>{th.taskPage.menu.openInPanel}</ListItemText>
              </MenuItem>
              {fw.canToggle ? (
                <MenuItem
                  role="menuitemcheckbox"
                  aria-checked={fw.fullWidth}
                  onClick={() => {
                    closeMenu()
                    fw.toggle()
                  }}
                >
                  <ListItemIcon>
                    {fw.fullWidth ? <CheckOutlined fontSize="small" aria-hidden="true" /> : null}
                  </ListItemIcon>
                  <ListItemText>{th.layout.fullWidth}</ListItemText>
                </MenuItem>
              ) : null}
              {canEdit && task ? (
                <MenuItem
                  onClick={() => {
                    closeMenu()
                    m.remove([taskId]) // M3 undo toast "เลิกทำ" (8 s) + Cmd+Z — no confirm (recoverable)
                    // Not back(): the entry behind /t is usually the list with `?task=<this id>` (M6.1-D17), whose panel
                    // would then say "ไม่พบงาน". Replace /t with the list without the panel — the same end state as
                    // deleting from the panel (it closes itself first).
                    router.replace(projectTasksHref(projectId))
                  }}
                  sx={{ color: 'error.main' }}
                >
                  <ListItemIcon sx={{ color: 'inherit' }}>
                    <DeleteOutlined fontSize="small" />
                  </ListItemIcon>
                  <ListItemText>{th.taskPage.menu.delete}</ListItemText>
                </MenuItem>
              ) : null}
            </Menu>
          </>
        }
      />
      <DocColumn fullWidth={fw.fullWidth}>
        <DocInset>
          <Box
            ref={titleRef}
            data-testid="task-title"
            sx={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: 1,
              pt: { xs: 2, sm: 6 },
              pb: 2,
              '& h1, & .MuiInputBase-root': {
                m: 0,
                fontSize: { xs: 'var(--font-2xl)', sm: 'var(--font-3xl)' },
                fontWeight: 'var(--weight-bold)',
                lineHeight: 1.25,
              },
              '& h1': { overflowWrap: 'anywhere', textDecoration: done ? 'line-through' : 'none' },
            }}
            onKeyDownCapture={(e) => {
              // Enter that commits the title moves the caret into the body (FR-683, SPEC §8.6)
              if ((e.target as HTMLElement).tagName !== 'INPUT') return
              if (e.key === 'Enter' && !e.nativeEvent.isComposing) enterInTitle.current = true
              else if (e.key === 'Escape') enterInTitle.current = false
            }}
          >
            <Checkbox
              checked={done}
              disabled={!canEdit || !task}
              onChange={() => (done ? m.uncomplete([taskId]) : m.complete([taskId]))}
              sx={{ mt: 0.5, p: 0.5 }}
              slotProps={{ input: { 'aria-label': th.tasks.completeCheckbox(name) } }}
            />
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <InlineEditText
                value={name}
                label={th.tasks.panel.name}
                disabled={!canEdit || !task}
                maxLength={500}
                variant="h1"
                component="h1"
                onRefocus={() => {
                  if (enterInTitle.current) {
                    enterInTitle.current = false
                    bodyRef.current?.focus()
                  } else titleRef.current?.querySelector<HTMLElement>('[data-inline-edit]')?.focus()
                }}
                onCommit={(next) => m.updateAsync(taskId, { name: next })}
              />
            </Box>
          </Box>
          {q.data && task ? (
            <TaskProperties projectId={projectId} task={task} data={q.data} variant="page" />
          ) : gone ? (
            <Typography sx={{ color: 'var(--text-secondary)' }} data-testid="task-gone">
              {th.taskPage.notFound}
            </Typography>
          ) : q.isError ? (
            <Alert
              severity="error"
              data-testid="task-properties-error"
              action={
                <Button color="inherit" size="small" onClick={() => void q.refetch()}>
                  {th.common.retry}
                </Button>
              }
            >
              {errorMessage(q.error)}
            </Alert>
          ) : (
            <Box
              data-testid="task-properties-loading"
              aria-label={th.common.loading}
              sx={{ display: 'grid', gap: 1 }}
            >
              {Array.from({ length: 8 }, (_, i) => (
                <Skeleton key={i} variant="rounded" height={32} />
              ))}
            </Box>
          )}
          <Divider sx={{ my: 3, borderColor: 'var(--border-subtle)' }} />
        </DocInset>
        {gone ? null : (
          <TaskBody
            view={bodyView}
            variant="page"
            canEdit={canEdit}
            focusRef={bodyRef}
            onHasBodyChange={(hasBody) => patchTaskHasBody(qc, projectId, taskId, hasBody)}
          />
        )}
      </DocColumn>
    </>
  )
}
