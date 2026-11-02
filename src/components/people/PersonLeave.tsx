'use client'
// src/components/people/PersonLeave.tsx — person tab วันลา (FR-1008, M9-D16, MASK-5): ที่กำลังจะถึง / ที่ผ่านมา, split
// at today. Masked entries (others' leave for a worker) show only "ลา" with no id and no actions. With `canEdit`
// (self or manager) "แจ้งลา" and each full entry open M5's one LeaveDialog (create / edit, delete with undo inside it);
// the dialog refreshes invalidateCalendar + invalidateLoad, which covers qk.personTimeOff (['calendar', …]).
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import CircularProgress from '@mui/material/CircularProgress'
import Typography from '@mui/material/Typography'
import { useOptionalLeaveDialog } from '@/components/calendar/LeaveDialogProvider'
import { compareISO } from '@/domain/dates'
import { usePersonTimeOff } from '@/hooks/useWorkload'
import { useToday } from '@/hooks/useToday'
import { th } from '@/i18n/th'
import type { CalendarTimeOff } from '@/lib/contracts/calendar'
import { formatLeaveRange } from '@/lib/format'

function EntryList({
  title,
  entries,
  canEdit,
  onEdit,
}: {
  title: string
  entries: CalendarTimeOff[]
  canEdit: boolean
  onEdit: (e: Extract<CalendarTimeOff, { kind: 'full' }>) => void
}) {
  return (
    <Box component="section" aria-label={title} sx={{ display: 'grid', gap: 1 }}>
      <Typography component="h2" sx={{ fontSize: 'var(--font-md)', fontWeight: 'var(--weight-bold)' }}>
        {title}
      </Typography>
      {entries.length === 0 ? (
        <Typography variant="body2" sx={{ color: 'var(--text-secondary)' }}>
          {th.people.leave.empty}
        </Typography>
      ) : (
        <Box
          component="ul"
          sx={{ listStyle: 'none', m: 0, p: 0, borderTop: '1px solid var(--border-subtle)' }}
        >
          {entries.map((e, i) => {
            const range = formatLeaveRange(e.startDate, e.endDate, e.half)
            return (
              <Box
                component="li"
                key={e.kind === 'full' ? e.id : `masked-${e.startDate}-${i}`}
                data-kind={e.kind}
                sx={{
                  display: 'flex',
                  flexWrap: 'wrap',
                  alignItems: 'center',
                  gap: 1,
                  py: 1,
                  borderBottom: '1px solid var(--border-subtle)',
                }}
              >
                <Typography variant="body2" sx={{ minWidth: 0, flex: '1 1 200px' }}>
                  {range}
                </Typography>
                <Typography variant="body2" sx={{ color: 'var(--text-secondary)' }}>
                  {e.kind === 'full' ? e.leaveTypeName : th.masking.leave}
                </Typography>
                {e.kind === 'full' && canEdit ? (
                  <Button size="small" onClick={() => onEdit(e)} aria-label={th.people.leave.edit(range)}>
                    {th.common.edit}
                  </Button>
                ) : null}
              </Box>
            )
          })}
        </Box>
      )}
    </Box>
  )
}

export function PersonLeave({ userId }: { userId: string }) {
  const q = usePersonTimeOff(userId)
  const today = useToday()
  const dialog = useOptionalLeaveDialog()
  if (q.isPending) return <CircularProgress size={24} aria-label={th.common.loading} />
  if (q.isError) return <Alert severity="error">{th.people.leave.loadError}</Alert>
  const canEdit = q.data.canEdit && dialog !== null
  const upcoming = q.data.entries.filter((e) => compareISO(e.endDate, today) >= 0)
  const past = q.data.entries.filter((e) => compareISO(e.endDate, today) < 0).reverse()
  return (
    <Box sx={{ display: 'grid', gap: 3, maxWidth: 720 }}>
      {canEdit ? (
        <Box>
          <Button variant="contained" size="small" onClick={() => dialog.open({ mode: 'create', userId })}>
            {th.people.leave.add}
          </Button>
        </Box>
      ) : null}
      <EntryList
        title={th.people.leave.upcoming}
        entries={upcoming}
        canEdit={canEdit}
        onEdit={(entry) => dialog?.open({ mode: 'edit', entry })}
      />
      <EntryList
        title={th.people.leave.past}
        entries={past}
        canEdit={canEdit}
        onEdit={(entry) => dialog?.open({ mode: 'edit', entry })}
      />
    </Box>
  )
}
