'use client'
// src/components/tasks/plan/PlanRangeDialog.tsx — FR-612 "วางแผน N วัน" for one assignee (BR-25, M6-D6). A form, not a
// confirm dialog: preview first (dryRun), then one apply that replaces the person's plan in the range (undoable).
import { useMemo, useState } from 'react'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import CircularProgress from '@mui/material/CircularProgress'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogTitle from '@mui/material/DialogTitle'
import Table from '@mui/material/Table'
import TableBody from '@mui/material/TableBody'
import TableCell from '@mui/material/TableCell'
import TableHead from '@mui/material/TableHead'
import TableRow from '@mui/material/TableRow'
import TextField from '@mui/material/TextField'
import Tooltip from '@mui/material/Tooltip'
import Typography from '@mui/material/Typography'
import { DateField } from '@/components/common/DateField'
import { compareISO, diffDays, isISODate } from '@/domain/dates'
import type { Cd, ISODate } from '@/domain/types'
import { formatCd, parseCellInput } from '@/domain/units'
import { th } from '@/i18n/th'
import type { WeekState } from '@/lib/contracts/grid'
import { formatWeekHeader } from '@/lib/format'
import { dayParts } from '@/lib/grid/tooltip'
import { PLAN_RANGE_MAX_CD, PLAN_RANGE_MAX_DIFF_DAYS } from '@/lib/schemas/allocations'
import { usePlanRange, type PlanRangeRequest } from './usePlanRange'

export interface PlanRangeDialogProps {
  open: boolean
  onClose: () => void
  taskAssignmentId: string
  personName: string
  taskName: string
  projectId: string
  defaultStart: ISODate
  defaultEnd: ISODate
}

const days1 = (cd: Cd) => formatCd(cd, { unit: 'DAYS', decimals: 1 }) || '0.0'

/** Total typed in days (M6-D10 rounding to 25 cd); f/h are not offered (capacity 0 → plain days). */
function parseTotal(raw: string): { cd: Cd } | 'empty' | 'invalid' {
  if (raw.trim() === '') return 'empty'
  const p = parseCellInput(raw, { unit: 'DAYS', capCd: 0, maxCd: PLAN_RANGE_MAX_CD })
  if (p.kind === 'value') return { cd: p.cd }
  if (p.kind === 'clear') return { cd: 0 }
  return 'invalid'
}

/** A plan date the domain accepts (4-digit year, real day), else null. */
const validDate = (d: ISODate | null): ISODate | null => (d !== null && isISODate(d) ? d : null)

function WeekValue({ state }: { state: WeekState }) {
  const text = days1(state.cd)
  if (state.resolution !== 'DAY') return <>{text}</>
  return (
    <Tooltip title={th.grid.cell.dayTooltip(dayParts(state.days))}>
      <span tabIndex={0}>
        {text}
        <span aria-hidden="true">⋯</span>
      </span>
    </Tooltip>
  )
}

export function PlanRangeDialog(props: PlanRangeDialogProps) {
  // Remount per open so every opening starts from the defaults.
  if (!props.open) return null
  return <PlanRangeDialogBody {...props} />
}

function PlanRangeDialogBody({
  onClose,
  taskAssignmentId,
  personName,
  taskName,
  projectId,
  defaultStart,
  defaultEnd,
}: PlanRangeDialogProps) {
  const [raw, setRaw] = useState('')
  const [rawStart, setStart] = useState<ISODate | null>(defaultStart)
  const [rawEnd, setEnd] = useState<ISODate | null>(defaultEnd)
  // While a year is being typed the picker emits partial dates (e.g. "-287-11-04"): only real ISO dates count.
  const start = validDate(rawStart)
  const end = validDate(rawEnd)
  const total = parseTotal(raw)
  const dateError =
    start && end
      ? compareISO(end, start) < 0
        ? th.plan.errors.endBeforeStart
        : diffDays(start, end) > PLAN_RANGE_MAX_DIFF_DAYS
          ? th.plan.errors.rangeTooLong
          : undefined
      : undefined
  const totalCd = typeof total === 'object' ? total.cd : null
  const request = useMemo<PlanRangeRequest | null>(
    () => (totalCd !== null && start && end && !dateError ? { totalCd, start, end } : null),
    [totalCd, start, end, dateError],
  )
  const plan = usePlanRange({ taskAssignmentId, projectId, personName, request, onApplied: onClose })
  const { state } = plan

  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="sm" aria-labelledby="plan-range-title">
      <DialogTitle id="plan-range-title">{th.plan.title(personName, taskName)}</DialogTitle>
      <DialogContent>
        <Box
          component="form"
          id="plan-range-form"
          noValidate
          onSubmit={(e) => {
            e.preventDefault()
            void plan.apply()
          }}
          sx={{ display: 'grid', gap: 2, pt: 1 }}
        >
          <TextField
            label={th.plan.totalLabel}
            value={raw}
            onChange={(e) => setRaw(e.target.value)}
            autoFocus
            size="small"
            error={total === 'invalid'}
            helperText={total === 'invalid' ? th.plan.errors.invalidTotal : th.plan.totalHint}
            slotProps={{ htmlInput: { inputMode: 'decimal', autoComplete: 'off' } }}
          />
          <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1 }}>
            <DateField
              label={th.plan.startLabel}
              value={rawStart}
              maxDate={end ?? undefined}
              onChange={setStart}
            />
            <DateField
              label={th.plan.endLabel}
              value={rawEnd}
              minDate={start ?? undefined}
              onChange={setEnd}
              error={dateError}
            />
          </Box>
          <Typography variant="body2" color="text.secondary">
            {th.plan.replaceNote}
          </Typography>

          <Box aria-live="polite">
            <Typography variant="subtitle2" component="h3">
              {th.plan.preview}
            </Typography>
            {state.kind === 'loading' ? (
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, py: 1 }}>
                <CircularProgress size={16} />
                <Typography variant="body2">{th.plan.previewLoading}</Typography>
              </Box>
            ) : null}
            {state.kind === 'unrepresentable' ? (
              <Alert severity="error" sx={{ mt: 1 }}>
                {th.plan.errors.unrepresentable}
              </Alert>
            ) : null}
            {state.kind === 'error' ? (
              <Alert severity="error" sx={{ mt: 1 }}>
                {state.message}
              </Alert>
            ) : null}
            {state.kind === 'ready' ? (
              <>
                <Table size="small" aria-label={th.plan.preview} data-testid="plan-range-preview">
                  <TableHead>
                    <TableRow>
                      <TableCell>{th.plan.columns.week}</TableCell>
                      <TableCell>{th.plan.columns.kind}</TableCell>
                      <TableCell align="right">{th.plan.columns.before}</TableCell>
                      <TableCell align="right">{th.plan.columns.after}</TableCell>
                      <TableCell align="right">{th.plan.columns.capacity}</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {state.preview.weeks.map((w) => (
                      <TableRow key={w.week} data-week={w.week}>
                        <TableCell>{formatWeekHeader(w.week)}</TableCell>
                        <TableCell>{th.plan.kind[w.kind]}</TableCell>
                        <TableCell align="right">
                          <WeekValue state={w.before} />
                        </TableCell>
                        <TableCell align="right">
                          <WeekValue state={w.after} />
                        </TableCell>
                        <TableCell align="right">{days1(w.capacityCd)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                <Typography variant="body2" sx={{ mt: 1 }}>
                  {th.plan.capacityInRange(days1(state.preview.capacityCd))}
                </Typography>
                {state.preview.overCapacityCd > 0 ? (
                  <Typography variant="body2" color="warning.main">
                    {th.plan.overCapacity(days1(state.preview.overCapacityCd))}
                  </Typography>
                ) : null}
                {[...new Set(state.preview.warnings.map((w) => w.code))].map((code) => (
                  <Alert key={code} severity="warning" sx={{ mt: 1 }}>
                    {th.grid.toast.warning[code]}
                  </Alert>
                ))}
              </>
            ) : null}
          </Box>
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{th.plan.cancel}</Button>
        <Button type="submit" form="plan-range-form" variant="contained" disabled={!plan.canApply}>
          {th.plan.apply}
        </Button>
      </DialogActions>
    </Dialog>
  )
}
