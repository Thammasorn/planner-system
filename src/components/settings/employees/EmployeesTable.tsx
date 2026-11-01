'use client'
import { useMemo, useState, useTransition, type MouseEvent } from 'react'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import IconButton from '@mui/material/IconButton'
import ListItemText from '@mui/material/ListItemText'
import Menu from '@mui/material/Menu'
import MenuItem from '@mui/material/MenuItem'
import Stack from '@mui/material/Stack'
import Table from '@mui/material/Table'
import TableBody from '@mui/material/TableBody'
import TableCell from '@mui/material/TableCell'
import TableContainer from '@mui/material/TableContainer'
import TableHead from '@mui/material/TableHead'
import TableRow from '@mui/material/TableRow'
import TextField from '@mui/material/TextField'
import Add from '@mui/icons-material/Add'
import Block from '@mui/icons-material/Block'
import CheckCircleOutlined from '@mui/icons-material/CheckCircleOutlined'
import MoreVert from '@mui/icons-material/MoreVert'
import { toast } from 'sonner'
import { EmptyState } from '@/components/common/EmptyState'
import { UserAvatar } from '@/components/common/UserAvatar'
import { UserName } from '@/components/common/UserName'
import { HeaderActions } from '@/components/layout/HeaderActions'
import { useUndo } from '@/components/undo/useUndo'
import { th } from '@/i18n/th'
import { unwrap } from '@/lib/action-result'
import type { EmployeeRow, PositionRow } from '@/lib/contracts/users'
import { deactivateEmployee, reactivateEmployee } from '@/server/actions/employees'
import { EmployeeFormDialog } from './EmployeeFormDialog'
import {
  DEFAULT_FILTER,
  filterEmployees,
  sortEmployees,
  type EmployeeFilter,
  type StatusFilter,
} from './filter'
import { ResetPasswordDialog } from './ResetPasswordDialog'
import { scheduleSummary } from './ScheduleEditor'

const STATUS_VALUES: readonly StatusFilter[] = ['all', 'active', 'deactivated']

/**
 * /settings/employees (FR-201…FR-209, AC-203 M1 part). Search/filter on the client (M1-D15). Deactivate and
 * reactivate are immediate with an 8 s undo toast and Cmd/Ctrl+Z — no confirm dialog (P2, M1-D13).
 */
export function EmployeesTable({
  rows,
  positions,
  currentUserId,
}: {
  rows: readonly EmployeeRow[]
  positions: readonly PositionRow[]
  currentUserId: string
}) {
  const [filter, setFilter] = useState<EmployeeFilter>(DEFAULT_FILTER)
  const [formOpen, setFormOpen] = useState(false)
  /** null = create; kept after closing so the exit transition keeps its content */
  const [editing, setEditing] = useState<EmployeeRow | null>(null)
  const [resetFor, setResetFor] = useState<EmployeeRow | null>(null)
  /** kept after closing so the menu keeps its items during the exit transition */
  const [menu, setMenu] = useState<{ anchor: HTMLElement; row: EmployeeRow; open: boolean } | null>(null)
  const [, startTransition] = useTransition()
  const undo = useUndo()

  const visible = useMemo(() => sortEmployees(filterEmployees(rows, filter)), [rows, filter])

  const openMenu = (e: MouseEvent<HTMLElement>, row: EmployeeRow) =>
    setMenu({ anchor: e.currentTarget, row, open: true })
  const closeMenu = () => setMenu((m) => (m ? { ...m, open: false } : null))

  const setActive = (row: EmployeeRow, active: boolean) =>
    startTransition(async () => {
      const userId = row.id
      const forward = active ? reactivateEmployee : deactivateEmployee
      const inverse = active ? deactivateEmployee : reactivateEmployee
      const r = await forward({ userId })
      if (!r.ok) {
        toast.error(r.message) // LAST_MANAGER, SELF_DEACTIVATE, …
        return
      }
      const message = active
        ? th.employees.reactivated(row.displayName)
        : th.employees.deactivated(row.displayName)
      undo.push(
        {
          label: message,
          undo: () => unwrap(inverse({ userId })).then(() => {}),
          redo: () => unwrap(forward({ userId })).then(() => {}),
        },
        { toast: message },
      )
    })

  const openForm = (row: EmployeeRow | null) => {
    setEditing(row)
    setFormOpen(true)
  }

  const rowMenuItems = (row: EmployeeRow) => {
    const isMe = row.id === currentUserId
    const act = (fn: () => void) => () => {
      closeMenu()
      fn()
    }
    const items = [
      <MenuItem key="edit" onClick={act(() => openForm(row))}>
        <ListItemText>{th.employees.actions.edit}</ListItemText>
      </MenuItem>,
    ]
    // Resetting one's own password lives on /account/password (M1-D16); self-deactivation is blocked (FR-206).
    if (!isMe) {
      items.push(
        <MenuItem key="reset" onClick={act(() => setResetFor(row))}>
          <ListItemText>{th.employees.actions.resetPassword}</ListItemText>
        </MenuItem>,
      )
    }
    if (!row.active) {
      items.push(
        <MenuItem key="reactivate" onClick={act(() => setActive(row, true))}>
          <ListItemText>{th.employees.actions.reactivate}</ListItemText>
        </MenuItem>,
      )
    } else if (!isMe) {
      items.push(
        <MenuItem key="deactivate" onClick={act(() => setActive(row, false))}>
          <ListItemText>{th.employees.actions.deactivate}</ListItemText>
        </MenuItem>,
      )
    }
    return items
  }

  return (
    <Stack spacing={2}>
      <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5} sx={{ alignItems: { md: 'center' } }}>
        <TextField
          type="search"
          label={th.employees.filters.search}
          value={filter.q}
          onChange={(e) => setFilter((f) => ({ ...f, q: e.target.value }))}
          sx={{ minWidth: 240, flex: 1 }}
        />
        <TextField
          select
          label={th.employees.filters.position}
          value={filter.positionId}
          onChange={(e) => setFilter((f) => ({ ...f, positionId: e.target.value }))}
          slotProps={{ select: { native: true }, inputLabel: { shrink: true } }}
          sx={{ minWidth: 180 }}
        >
          <option value="all">{th.employees.filters.allPositions}</option>
          {positions.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
          <option value="none">{th.employees.filters.noPosition}</option>
        </TextField>
        <TextField
          select
          label={th.employees.filters.status}
          value={filter.status}
          onChange={(e) =>
            setFilter((f) => ({ ...f, status: STATUS_VALUES.find((s) => s === e.target.value) ?? 'all' }))
          }
          slotProps={{ select: { native: true }, inputLabel: { shrink: true } }}
          sx={{ minWidth: 150 }}
        >
          <option value="all">{th.employees.filters.allStatuses}</option>
          <option value="active">{th.employees.status.active}</option>
          <option value="deactivated">{th.employees.status.deactivated}</option>
        </TextField>
      </Stack>
      {/* the screen's one primary action lives in the header bar (FR-1604, M6.1-D23) */}
      <HeaderActions>
        <Button variant="contained" startIcon={<Add />} onClick={() => openForm(null)}>
          {th.employees.add}
        </Button>
      </HeaderActions>

      {rows.length === 0 ? (
        <EmptyState title={th.employees.empty} />
      ) : visible.length === 0 ? (
        <EmptyState title={th.employees.noMatch} />
      ) : (
        <TableContainer>
          <Table size="small" aria-label={th.employees.title}>
            <TableHead>
              <TableRow>
                <TableCell>{th.employees.fields.name}</TableCell>
                <TableCell>{th.employees.fields.email}</TableCell>
                <TableCell>{th.employees.fields.position}</TableCell>
                <TableCell>{th.employees.fields.role}</TableCell>
                <TableCell>{th.employees.fields.schedule}</TableCell>
                <TableCell>{th.employees.fields.status}</TableCell>
                <TableCell align="right">{th.common.actions}</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {visible.map((row) => {
                const isMe = row.id === currentUserId
                return (
                  <TableRow key={row.id} hover data-user-id={row.id} data-active={String(row.active)}>
                    <TableCell>
                      <Stack direction="row" spacing={1} sx={{ alignItems: 'center', flexWrap: 'wrap' }}>
                        <UserAvatar user={row} />
                        <UserName user={row} />
                        {isMe ? <Chip size="small" variant="outlined" label={th.employees.you} /> : null}
                        {row.mustChangePassword ? (
                          <Chip
                            size="small"
                            variant="outlined"
                            color="warning"
                            label={th.employees.mustChangeBadge}
                          />
                        ) : null}
                      </Stack>
                    </TableCell>
                    <TableCell>{row.email}</TableCell>
                    <TableCell>{row.positionName ?? th.users.noPosition}</TableCell>
                    <TableCell>{th.employees.roles[row.role]}</TableCell>
                    <TableCell>{scheduleSummary(row.schedule)}</TableCell>
                    <TableCell>
                      {row.active ? (
                        <Chip
                          size="small"
                          color="success"
                          variant="outlined"
                          icon={<CheckCircleOutlined />}
                          label={th.employees.status.active}
                        />
                      ) : (
                        <Chip
                          size="small"
                          variant="outlined"
                          icon={<Block />}
                          label={th.employees.status.deactivated}
                        />
                      )}
                    </TableCell>
                    <TableCell align="right">
                      <IconButton
                        aria-label={th.common.actions}
                        aria-haspopup="menu"
                        onClick={(e) => openMenu(e, row)}
                      >
                        <MoreVert fontSize="small" />
                      </IconButton>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      <Menu anchorEl={menu?.anchor ?? null} open={menu?.open ?? false} onClose={closeMenu}>
        {menu ? rowMenuItems(menu.row) : null}
      </Menu>

      <EmployeeFormDialog
        open={formOpen}
        mode={editing ? 'edit' : 'create'}
        {...(editing ? { employee: editing } : {})}
        positions={positions}
        onClose={() => setFormOpen(false)}
      />
      <ResetPasswordDialog employee={resetFor} onClose={() => setResetFor(null)} />
    </Stack>
  )
}
