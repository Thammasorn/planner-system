'use client'
// src/components/workload/WorkloadCellPanel.tsx — the tasks behind one workload number (FR-1005, M9-D9, §3.3). A
// persistent right Drawer beside the table (does not cover it) from md up; below md there is no room beside the table, so
// it becomes a temporary overlay sheet (backdrop, focus trap) over it. Nothing is rendered while closed, so the panel
// never sits off-screen in layout (no horizontal document scroll, SPEC §9). Esc / ✕ / backdrop close it and the caller
// returns focus to the cell. Hidden projects arrive as one masked item (label from the server, no link, no id).
import { useEffect } from 'react'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import CircularProgress from '@mui/material/CircularProgress'
import Drawer from '@mui/material/Drawer'
import IconButton from '@mui/material/IconButton'
import Typography from '@mui/material/Typography'
import { useTheme } from '@mui/material/styles'
import useMediaQuery from '@mui/material/useMediaQuery'
import CloseIcon from '@mui/icons-material/Close'
import Link from '@/components/Link'
import { ColorSquare } from '@/components/common/ProjectChip'
import { StatusGlyph } from '@/components/common/StatusGlyph'
import { OpenAsPageLink } from '@/components/tasks/OpenAsPage'
import { errorMessage } from '@/components/tasks/useTaskMutations'
import type { ISODate } from '@/domain/types'
import { useWorkloadCell } from '@/hooks/useWorkload'
import { th } from '@/i18n/th'
import type { WorkloadCellItem } from '@/lib/contracts/workload'
import { formatWeekHeader } from '@/lib/format'
import { twoDecimals } from '@/lib/workload/format'
import { tooltipLines } from '@/lib/workload/tooltip'

export const CELL_PANEL_WIDTH = 440

export interface WorkloadCellPanelProps {
  /** null = closed. */
  target: { userId: string; name: string; week: ISODate; deactivated: boolean } | null
  onClose: () => void
}

const days = (cd: number) => th.workload.tooltip.days(twoDecimals(cd))

function ItemRow({ item }: { item: WorkloadCellItem }) {
  if (item.kind === 'masked')
    return (
      <Box
        component="li"
        data-item-kind="masked"
        sx={{ py: 1, borderBottom: '1px solid var(--border-subtle)' }}
      >
        <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 1 }}>
          <Typography variant="body2" sx={{ fontStyle: 'italic', color: 'var(--text-secondary)' }}>
            {item.label}
          </Typography>
          <Typography variant="body2">{days(item.load.total)}</Typography>
        </Box>
      </Box>
    )
  return (
    <Box
      component="li"
      data-item-kind="task"
      data-task-id={item.taskId}
      sx={{ py: 1, borderBottom: '1px solid var(--border-subtle)', display: 'grid', gap: 0.5 }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, minWidth: 0 }}>
        <Box
          component={Link}
          href={item.href}
          aria-label={th.workload.panel.openTask(item.taskName)}
          sx={{
            color: 'text.primary',
            minWidth: 0,
            overflowWrap: 'anywhere',
            textDecoration: item.completed ? 'line-through' : 'none',
            '&:hover': { textDecoration: 'underline' },
          }}
        >
          {item.taskName}
        </Box>
        <OpenAsPageLink taskId={item.taskId} />
        <Box sx={{ flex: 1 }} />
        {item.certainty === 'TENTATIVE' ? (
          <StatusGlyph kind="tentative" label={th.workload.panel.tentative} />
        ) : null}
        <Typography variant="body2" sx={{ whiteSpace: 'nowrap' }}>
          {days(item.load.total)}
        </Typography>
      </Box>
      <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 1 }}>
        <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5 }}>
          <ColorSquare color={item.projectColor} />
          <Typography variant="caption">{item.projectName}</Typography>
        </Box>
        {item.parentPath.length > 0 ? (
          <Typography variant="caption" sx={{ color: 'var(--text-secondary)' }}>
            {item.parentPath.join(' › ')}
          </Typography>
        ) : null}
        {item.completed ? (
          <Typography variant="caption" sx={{ color: 'var(--text-secondary)' }}>
            {th.workload.panel.completed}
          </Typography>
        ) : null}
      </Box>
    </Box>
  )
}

export function WorkloadCellPanel({ target, onClose }: WorkloadCellPanelProps) {
  const q = useWorkloadCell(target?.userId ?? null, target?.week ?? null)
  const sheet = useMediaQuery(useTheme().breakpoints.down('md'))
  const open = target !== null
  // side panel: Esc from anywhere on the page closes it; the sheet is a Modal, which handles its own Esc (below)
  useEffect(() => {
    if (!open || sheet) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !e.defaultPrevented) onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, sheet, onClose])
  if (!target) return null
  const title = th.workload.panel.title(target.name, formatWeekHeader(target.week))
  return (
    <Drawer
      variant={sheet ? 'temporary' : 'persistent'}
      anchor="right"
      open
      // sheet only (a persistent Drawer never calls it): Esc and backdrop click
      onClose={onClose}
      data-variant={sheet ? 'sheet' : 'side'}
      sx={
        sheet
          ? { '& .MuiDrawer-paper': { width: '100%', boxSizing: 'border-box', p: 2 } }
          : {
              flexShrink: 0,
              width: CELL_PANEL_WIDTH,
              '& .MuiDrawer-paper': {
                position: 'relative',
                width: CELL_PANEL_WIDTH,
                boxSizing: 'border-box',
                p: 2,
                borderLeft: '1px solid var(--border-subtle)',
              },
            }
      }
      slotProps={{ paper: { component: 'aside', 'aria-label': title } }}
    >
      <Box sx={{ display: 'grid', gap: 2 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Typography component="h2" variant="h6" sx={{ flex: 1, fontSize: 'var(--font-lg)' }}>
            {title}
          </Typography>
          <IconButton size="small" aria-label={th.workload.panel.close} onClick={onClose}>
            <CloseIcon fontSize="small" />
          </IconButton>
        </Box>
        {q.isPending ? (
          <CircularProgress size={24} aria-label={th.workload.panel.loading} />
        ) : q.isError ? (
          <Alert severity="error">{errorMessage(q.error)}</Alert>
        ) : (
          <>
            <Box component="ul" sx={{ listStyle: 'none', m: 0, p: 0, display: 'grid', gap: 0.5 }}>
              {tooltipLines({
                name: target.name,
                week: target.week,
                cell: q.data.cell,
                projects: {},
                deactivated: target.deactivated,
              })
                .filter((l) => l.kind !== 'header' && l.kind !== 'part')
                .map((l, i) => (
                  <Typography
                    key={`${l.kind}-${i}`}
                    component="li"
                    variant="body2"
                    sx={l.kind === 'status' ? { fontWeight: 'var(--weight-bold)' } : undefined}
                  >
                    {l.text}
                  </Typography>
                ))}
            </Box>
            {q.data.items.length === 0 ? (
              <Typography variant="body2" sx={{ color: 'var(--text-secondary)' }}>
                {th.workload.panel.empty}
              </Typography>
            ) : (
              <Box
                component="ul"
                sx={{ listStyle: 'none', m: 0, p: 0, borderTop: '1px solid var(--border-subtle)' }}
              >
                {q.data.items.map((it, i) => (
                  <ItemRow key={it.kind === 'task' ? it.taskId : `masked-${i}`} item={it} />
                ))}
              </Box>
            )}
          </>
        )}
        <Button
          component={Link}
          href={`/people/${target.userId}/plan?week=${target.week}`}
          sx={{ justifySelf: 'start' }}
        >
          {th.workload.panel.openPerson}
        </Button>
      </Box>
    </Drawer>
  )
}
