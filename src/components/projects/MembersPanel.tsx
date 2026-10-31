'use client'
import { useId, useLayoutEffect, useMemo, useOptimistic, useRef, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Box from '@mui/material/Box'
import Chip from '@mui/material/Chip'
import IconButton from '@mui/material/IconButton'
import MenuItem from '@mui/material/MenuItem'
import Paper from '@mui/material/Paper'
import Select from '@mui/material/Select'
import Stack from '@mui/material/Stack'
import Tooltip from '@mui/material/Tooltip'
import Typography from '@mui/material/Typography'
import PersonRemoveOutlined from '@mui/icons-material/PersonRemoveOutlined'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { PersonPicker } from '@/components/common/PersonPicker'
import { UserAvatar } from '@/components/common/UserAvatar'
import { UserName } from '@/components/common/UserName'
import { useUndo } from '@/components/undo/useUndo'
import type { ProjectRole } from '@/domain/types'
import { useCurrentUser } from '@/hooks/useCurrentUser'
import { usePeopleOptions } from '@/hooks/usePeopleOptions'
import { th } from '@/i18n/th'
import { unwrap } from '@/lib/action-result'
import { compareThai } from '@/lib/collate'
import type { PersonOption } from '@/lib/contracts/people'
import type { ProjectMember } from '@/lib/contracts/projects'
import { displayName } from '@/lib/display-name'
import { invalidateProjects } from '@/lib/invalidate'
import { addMember, changeMemberRole, removeMember } from '@/server/actions/members'
import { errorMessage } from './errors'

type Op =
  | { kind: 'add'; member: ProjectMember }
  | { kind: 'remove'; userId: string }
  | { kind: 'role'; userId: string; role: ProjectRole }

function applyOp(rows: ProjectMember[], op: Op): ProjectMember[] {
  switch (op.kind) {
    case 'add':
      return rows.some((r) => r.userId === op.member.userId) ? rows : [...rows, op.member]
    case 'remove':
      return rows.filter((r) => r.userId !== op.userId)
    case 'role':
      return rows.map((r) => (r.userId === op.userId ? { ...r, role: op.role } : r))
  }
}

/** LEAD first, then display name with the shared Thai collator (M2-D18). */
export function sortMembers(rows: readonly ProjectMember[]): ProjectMember[] {
  return [...rows].sort(
    (a, b) =>
      (a.role === 'LEAD' ? 0 : 1) - (b.role === 'LEAD' ? 0 : 1) ||
      compareThai(displayName(a), displayName(b)),
  )
}

const ROLES: readonly ProjectRole[] = ['LEAD', 'MEMBER']

/**
 * Members of a project (FR-403, FR-404 part, BR-62). Managers/LEADs (`canManage`) add from the picker (active
 * non-members only — AC-203/X12), switch LEAD/MEMBER and remove — removal is immediate with an 8 s undo toast +
 * Cmd/Ctrl+Z (P2, M2-D05), never a confirm. Every change is optimistic and rolls back on error; the server
 * action's refresh() delivers the new list. Everyone else sees names and text role chips.
 */
export function MembersPanel({
  projectId,
  members,
  canManage,
}: {
  projectId: string
  members: ProjectMember[]
  canManage: boolean
}) {
  const headingId = useId()
  const me = useCurrentUser()
  const qc = useQueryClient()
  const router = useRouter()
  const undo = useUndo()
  const [list, apply] = useOptimistic(members, applyOp)
  const [, startTransition] = useTransition()
  const people = usePeopleOptions({ enabled: canManage })
  const rows = useMemo(() => sortMembers(list), [list])
  const memberIds = useMemo(() => new Set(list.map((m) => m.userId)), [list])
  // SPEC §8.9 keyboard-only use: a removed row takes its focused remove button with it, so focus moves first to a
  // stable neighbour (next row's remove button, else the previous one, else the picker) — never to <body>.
  const pickerId = useId()
  const removeButtons = useRef(new Map<string, HTMLButtonElement>())
  const removeButtonRef = (userId: string) => (el: HTMLButtonElement | null) => {
    if (!el) return
    removeButtons.current.set(userId, el)
    return () => {
      if (removeButtons.current.get(userId) === el) removeButtons.current.delete(userId)
    }
  }
  // Losing manage rights (M2-D19: a worker LEAD demoting themselves → refresh() → canManage false) unmounts the
  // focused role select, the remove buttons and the picker in one commit. If that dropped focus to <body>, move it
  // to the panel heading (stays across the refresh). A manager demoting themselves keeps canManage → focus untouched.
  const headingRef = useRef<HTMLHeadingElement>(null)
  const prevCanManage = useRef(canManage)
  useLayoutEffect(() => {
    const lost = prevCanManage.current && !canManage
    prevCanManage.current = canManage
    if (!lost) return
    const active = document.activeElement
    if (active === null || active === document.body) headingRef.current?.focus()
  }, [canManage])
  const focusNeighbourOf = (userId: string) => {
    const i = rows.findIndex((r) => r.userId === userId)
    const neighbour = rows[i + 1] ?? rows[i - 1]
    const target = neighbour ? removeButtons.current.get(neighbour.userId) : undefined
    if (target) target.focus()
    else document.getElementById(pickerId)?.focus()
  }

  const add = (p: PersonOption) => {
    const name = displayName(p)
    startTransition(async () => {
      apply({
        kind: 'add',
        member: {
          userId: p.id,
          name: p.name,
          nickname: p.nickname,
          positionName: p.positionName,
          color: p.color,
          active: p.active,
          role: 'MEMBER',
        },
      })
      try {
        await unwrap(addMember({ projectId, userId: p.id }))
        toast.success(th.members.toasts.added(name))
        await invalidateProjects(qc)
      } catch (err) {
        toast.error(errorMessage(err))
      }
    })
  }

  const changeRole = (m: ProjectMember, role: ProjectRole) => {
    if (role === m.role) return
    const name = displayName(m)
    startTransition(async () => {
      apply({ kind: 'role', userId: m.userId, role })
      try {
        const r = await unwrap(changeMemberRole({ projectId, userId: m.userId, role }))
        if (r.warning === 'NO_LEAD') toast.warning(th.members.toasts.noLeadWarning)
        else toast.success(th.members.toasts.roleChanged(name, th.members.roles[role]))
        await invalidateProjects(qc)
      } catch (err) {
        toast.error(errorMessage(err)) // BR-62 CONFLICT: "โปรเจคต้องมี LEAD อย่างน้อย 1 คน"; the select reverts
      }
    })
  }

  const remove = (m: ProjectMember) => {
    const name = displayName(m)
    const userId = m.userId
    focusNeighbourOf(userId)
    startTransition(async () => {
      apply({ kind: 'remove', userId })
      try {
        const r = await unwrap(removeMember({ projectId, userId }))
        if (r.selfRemoved) {
          // M2-D19: the action skipped refresh(); this project is no longer visible to the viewer.
          await invalidateProjects(qc)
          toast(th.members.toasts.removed(name))
          router.push('/projects')
          return
        }
        if (r.warning === 'NO_LEAD') toast.warning(th.members.toasts.noLeadWarning)
        const label = th.members.toasts.removed(name)
        undo.push(
          {
            label,
            undo: () =>
              unwrap(addMember({ projectId, userId, role: r.removedRole })).then(() =>
                invalidateProjects(qc),
              ),
            redo: () => unwrap(removeMember({ projectId, userId })).then(() => invalidateProjects(qc)),
          },
          { toast: label },
        )
        // Undo is registered as soon as the removal commits (Cmd+Z works at once); the sidebar refetch follows.
        await invalidateProjects(qc)
      } catch (err) {
        toast.error(errorMessage(err))
      }
    })
  }

  return (
    <Paper
      variant="outlined"
      component="section"
      aria-labelledby={headingId}
      data-testid="members-panel"
      sx={{ p: 2 }}
    >
      <Typography
        id={headingId}
        ref={headingRef}
        tabIndex={-1}
        variant="h6"
        component="h2"
        sx={{ mb: 1.5 }}
      >
        {th.members.heading}
      </Typography>
      <Box
        component="ul"
        sx={{ listStyle: 'none', m: 0, p: 0, display: 'flex', flexDirection: 'column', gap: 0.5 }}
      >
        {rows.map((m) => {
          const name = displayName(m)
          return (
            <Box
              component="li"
              key={m.userId}
              data-testid={`member-row-${m.userId}`}
              sx={{ display: 'flex', alignItems: 'center', gap: 1.5, minHeight: 44 }}
            >
              <UserAvatar user={m} />
              <Box
                sx={{
                  flex: 1,
                  minWidth: 0,
                  display: 'flex',
                  gap: 0.75,
                  alignItems: 'baseline',
                  flexWrap: 'wrap',
                }}
              >
                <UserName user={m} />
                {me?.id === m.userId ? (
                  <Typography component="span" variant="body2" sx={{ color: 'text.secondary' }}>
                    {th.members.you}
                  </Typography>
                ) : null}
              </Box>
              {canManage ? (
                <Select
                  size="small"
                  value={m.role}
                  onChange={(e) => changeRole(m, e.target.value === 'LEAD' ? 'LEAD' : 'MEMBER')}
                  inputProps={{ 'aria-label': th.members.roleLabel }}
                  sx={{ minWidth: 120 }}
                >
                  {ROLES.map((r) => (
                    <MenuItem key={r} value={r}>
                      {th.members.roles[r]}
                    </MenuItem>
                  ))}
                </Select>
              ) : (
                <Chip
                  size="small"
                  label={th.members.roles[m.role]}
                  variant={m.role === 'LEAD' ? 'filled' : 'outlined'}
                  color={m.role === 'LEAD' ? 'primary' : 'default'}
                />
              )}
              {canManage ? (
                <Tooltip title={th.members.remove(name)}>
                  <IconButton
                    ref={removeButtonRef(m.userId)}
                    aria-label={th.members.remove(name)}
                    onClick={() => remove(m)}
                    size="small"
                  >
                    <PersonRemoveOutlined fontSize="small" />
                  </IconButton>
                </Tooltip>
              ) : null}
            </Box>
          )
        })}
      </Box>
      {canManage ? (
        <Stack sx={{ mt: 2, maxWidth: 420 }}>
          <PersonPicker
            id={pickerId}
            label={th.members.add}
            placeholder={th.members.pickerLabel}
            options={people.data ?? []}
            loading={people.isLoading}
            loadError={people.isError}
            onRetry={() => void people.refetch()}
            excludeIds={memberIds}
            onSelect={add}
          />
        </Stack>
      ) : null}
    </Paper>
  )
}
