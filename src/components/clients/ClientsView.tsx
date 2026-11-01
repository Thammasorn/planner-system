'use client'
import { useOptimistic, useRef, useState, useTransition } from 'react'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import Paper from '@mui/material/Paper'
import Stack from '@mui/material/Stack'
import Table from '@mui/material/Table'
import TableBody from '@mui/material/TableBody'
import TableCell from '@mui/material/TableCell'
import TableContainer from '@mui/material/TableContainer'
import TableHead from '@mui/material/TableHead'
import TableRow from '@mui/material/TableRow'
import Add from '@mui/icons-material/Add'
import Link from '@/components/Link'
import { EmptyState } from '@/components/common/EmptyState'
import { ColorSquare } from '@/components/common/ProjectChip'
import { PageHeaderBar } from '@/components/layout/PageHeaderBar'
import { th } from '@/i18n/th'
import type { ClientListItem } from '@/lib/contracts/clients'
import { ClientFormDialog, type EditableClient } from './ClientFormDialog'
import { useClientArchive } from './useClientArchive'

type Op = { id: string; archived: boolean }

/**
 * `/clients` (FR-301..FR-303 part) with its header bar (FR-1603: ลูกค้า as the <h1>; the archived switch and the one
 * primary action "เพิ่มลูกค้า" on the right). Managers create, edit, archive (undo toast) and unarchive; with
 * `showingArchived` archived clients stay listed with a chip, otherwise an archived row disappears at once
 * (optimistic; the action's refresh() confirms). Workers get a read-only list of their projects' clients.
 */
export function ClientsView({
  items,
  canManage,
  showingArchived,
}: {
  items: ClientListItem[]
  canManage: boolean
  showingArchived: boolean
}) {
  const [rows, apply] = useOptimistic(items, (list: ClientListItem[], op: Op) =>
    list
      .map((c) => (c.id === op.id ? { ...c, archived: op.archived } : c))
      .filter((c) => showingArchived || !c.archived),
  )
  const [, startTransition] = useTransition()
  const { archive, unarchive } = useClientArchive()
  const [dialog, setDialog] = useState<{ mode: 'create' } | { mode: 'edit'; client: EditableClient } | null>(
    null,
  )

  // SPEC §8.9 keyboard-only use: when archiving hides the row, its focused button goes with it — move focus first to
  // the next row's toggle (else the previous row's, else "เพิ่มลูกค้า") so it never lands on <body>.
  const toggleButtons = useRef(new Map<string, HTMLButtonElement>())
  const createButton = useRef<HTMLButtonElement>(null)
  const toggleRef = (id: string) => (el: HTMLButtonElement | null) => {
    if (!el) return
    toggleButtons.current.set(id, el)
    return () => {
      if (toggleButtons.current.get(id) === el) toggleButtons.current.delete(id)
    }
  }
  const focusNeighbourOf = (id: string) => {
    const i = rows.findIndex((r) => r.id === id)
    const neighbour = rows[i + 1] ?? rows[i - 1]
    const target = neighbour ? toggleButtons.current.get(neighbour.id) : undefined
    if (target) target.focus()
    else createButton.current?.focus()
  }

  const toggle = (c: ClientListItem, archived: boolean) => {
    if (archived && !showingArchived) focusNeighbourOf(c.id) // the row disappears
    startTransition(async () => {
      apply({ id: c.id, archived })
      await (archived ? archive(c) : unarchive(c)).catch(() => {}) // toasted; the optimistic row rolls back
    })
  }

  return (
    <>
      <PageHeaderBar
        crumbs={[{ label: th.clients.listTitle, asHeading: true }]}
        actions={
          canManage ? (
            <>
              <Button component={Link} href={showingArchived ? '/clients' : '/clients?archived=1'}>
                {showingArchived ? th.clients.hideArchived : th.clients.showArchived}
              </Button>
              <Button
                ref={createButton}
                variant="contained"
                startIcon={<Add />}
                onClick={() => setDialog({ mode: 'create' })}
              >
                {th.clients.create}
              </Button>
            </>
          ) : null
        }
      />
      <Stack spacing={2}>
        {rows.length === 0 ? (
          <EmptyState title={canManage ? th.clients.empty : th.clients.emptyWorker} />
        ) : (
          <TableContainer component={Paper} variant="outlined">
            <Table size="small" aria-label={th.clients.listTitle}>
              <TableHead>
                <TableRow>
                  <TableCell>{th.clients.columns.name}</TableCell>
                  <TableCell>{th.clients.columns.code}</TableCell>
                  <TableCell>{th.clients.columns.projects}</TableCell>
                  {canManage ? <TableCell align="right">{th.common.actions}</TableCell> : null}
                </TableRow>
              </TableHead>
              <TableBody>
                {rows.map((c) => (
                  <TableRow key={c.id} data-testid={`client-row-${c.id}`} hover>
                    <TableCell>
                      <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: 1 }}>
                        <ColorSquare color={c.color} />
                        <Box
                          component={Link}
                          href={`/clients/${c.id}`}
                          sx={{ color: 'text.primary', fontWeight: 500 }}
                        >
                          {c.name}
                        </Box>
                        {c.archived ? <Chip size="small" label={th.clients.archivedChip} /> : null}
                      </Box>
                    </TableCell>
                    <TableCell>{c.code}</TableCell>
                    <TableCell>{th.clients.projectCount(c.projectCount)}</TableCell>
                    {canManage ? (
                      <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>
                        <Button size="small" onClick={() => setDialog({ mode: 'edit', client: c })}>
                          {th.clients.edit}
                        </Button>
                        {c.archived ? (
                          <Button size="small" ref={toggleRef(c.id)} onClick={() => toggle(c, false)}>
                            {th.clients.unarchive}
                          </Button>
                        ) : (
                          <Button size="small" ref={toggleRef(c.id)} onClick={() => toggle(c, true)}>
                            {th.clients.archive}
                          </Button>
                        )}
                      </TableCell>
                    ) : null}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        )}
        {canManage ? (
          <ClientFormDialog
            open={dialog !== null}
            mode={dialog?.mode ?? 'create'}
            {...(dialog?.mode === 'edit' ? { client: dialog.client } : {})}
            onClose={() => setDialog(null)}
          />
        ) : null}
      </Stack>
    </>
  )
}
