'use client'
// src/components/workload/WorkloadPage.tsx — Workload ทีม (SPEC §8.5, FR-1001…1006, M9-D2…D6/D10). One payload serves
// table, tooltip, list tab and tab count; the view is a preference (`load.view`, M6-D21) applied on the client, so
// switching it never refetches (M9-D2). Filters + window live in the URL (M9-D5). M11.2: the per-person load chart
// under the table (FR-1011) is computed from the same payload, on the table's measured columns.
import { useCallback, useMemo, useState } from 'react'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Checkbox from '@mui/material/Checkbox'
import FormControl from '@mui/material/FormControl'
import FormControlLabel from '@mui/material/FormControlLabel'
import IconButton from '@mui/material/IconButton'
import InputLabel from '@mui/material/InputLabel'
import MenuItem from '@mui/material/MenuItem'
import Select from '@mui/material/Select'
import Skeleton from '@mui/material/Skeleton'
import Tab from '@mui/material/Tab'
import Tabs from '@mui/material/Tabs'
import ToggleButton from '@mui/material/ToggleButton'
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup'
import Typography from '@mui/material/Typography'
import ChevronLeft from '@mui/icons-material/ChevronLeft'
import ChevronRight from '@mui/icons-material/ChevronRight'
import { EmptyState } from '@/components/common/EmptyState'
import { addDays, addWeeks, weekStart } from '@/domain/dates'
import type { ISODate, LoadView } from '@/domain/types'
import { LoadDisplayToggle } from '@/components/load/LoadDisplayToggle'
import { usePreferences } from '@/hooks/usePreferences'
import { useSidebar } from '@/hooks/useSidebar'
import { useToday } from '@/hooks/useToday'
import { WORKLOAD_STEP, WORKLOAD_WEEKS, useWorkloadTable, useWorkloadUrlState } from '@/hooks/useWorkload'
import { th } from '@/i18n/th'
import { compareThai } from '@/lib/collate'
import type { WorkloadPerson } from '@/lib/contracts/workload'
import type { TableGeometry } from '@/lib/workload/chart'
import { formatThaiDate } from '@/lib/format'
import { gridPreference } from '@/lib/schemas/preferences'
import { OverloadList } from './OverloadList'
import { isDeactivatedWeek } from './WorkloadCell'
import { WorkloadCellPanel } from './WorkloadCellPanel'
import { WorkloadLoadChart } from './WorkloadLoadChart'
import { WorkloadTable } from './WorkloadTable'
import { useScrollFollow } from './useScrollFollow'

const VIEWS: readonly LoadView[] = ['ALL', 'COMMITTED', 'AT_RISK']
const SELECT_SX = { minWidth: { xs: 140, sm: 180 }, flex: { xs: '1 1 140px', sm: '0 0 auto' } } as const

type PanelTarget = { userId: string; name: string; week: ISODate; deactivated: boolean }

export function WorkloadPage({ initialView }: { initialView: LoadView }) {
  const { prefs, setPreference } = usePreferences()
  const view = prefs['load.view'] === undefined ? initialView : gridPreference(prefs, 'load.view')
  const today = useToday()
  const [params, patch] = useWorkloadUrlState()
  const q = useWorkloadTable(params)
  const sidebar = useSidebar()
  const [tab, setTab] = useState<'table' | 'overloads'>('table')
  const [panel, setPanel] = useState<PanelTarget | null>(null)
  // M11.2: the load chart under the table sits on its measured columns and follows its horizontal scroll
  const [geometry, setGeometry] = useState<TableGeometry | null>(null)
  const { lead, follow, sync } = useScrollFollow()

  const projects = useMemo(
    () => [...(sidebar.data?.projects ?? [])].sort((a, b) => compareThai(a.name, b.name)),
    [sidebar.data],
  )
  const thisWeek = weekStart(today)
  const shift = (n: number) => patch({ from: addWeeks(params.from, n), to: addWeeks(params.to, n) })
  const filtered = params.positionId !== null || params.projectId !== null || params.onlyOver

  const closePanel = useCallback(() => {
    if (panel) {
      // focus back to the cell that opened the panel (FR-1005 Esc)
      const sel = `[data-testid="workload-table"] tr[data-user-id="${panel.userId}"] [data-week="${panel.week}"]`
      queueMicrotask(() => document.querySelector<HTMLElement>(sel)?.focus())
    }
    setPanel(null)
  }, [panel])
  const openPanel = (person: WorkloadPerson, week: ISODate) =>
    setPanel({
      userId: person.userId,
      name: person.name,
      week,
      deactivated: isDeactivatedWeek(person.deactivatedOn, week),
    })

  const overloads = q.data?.overloads ?? []
  return (
    <Box sx={{ display: 'grid', gap: 2, minWidth: 0 }}>
      <Box
        role="toolbar"
        aria-label={th.workload.filters.label}
        sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 1.5 }}
      >
        <ToggleButtonGroup
          exclusive
          size="small"
          value={view}
          aria-label={th.workload.view.label}
          onChange={(_e, v: LoadView | null) => {
            if (v !== null && v !== view) setPreference('load.view', v)
          }}
          sx={{ flex: 'none' }}
        >
          {VIEWS.map((v) => (
            <ToggleButton
              key={v}
              value={v}
              disableRipple
              sx={{ px: 1.5, py: 0.5, fontSize: 'var(--font-sm)' }}
            >
              {th.workload.view[v]}
            </ToggleButton>
          ))}
        </ToggleButtonGroup>
        {/* M11.1 (FR-1002/FR-1010): "% | วัน/capacity" — the shared load.display preference */}
        <LoadDisplayToggle />
        <FormControl size="small" sx={SELECT_SX}>
          <InputLabel id="wl-position">{th.workload.filters.position}</InputLabel>
          <Select
            labelId="wl-position"
            label={th.workload.filters.position}
            value={params.positionId ?? ''}
            onChange={(e) => patch({ positionId: e.target.value || null })}
          >
            <MenuItem value="">{th.workload.filters.allPositions}</MenuItem>
            {(q.data?.positions ?? []).map((p) => (
              <MenuItem key={p.id} value={p.id}>
                {p.name}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
        <FormControl size="small" sx={SELECT_SX}>
          <InputLabel id="wl-project">{th.workload.filters.project}</InputLabel>
          <Select
            labelId="wl-project"
            label={th.workload.filters.project}
            value={
              params.projectId !== null && projects.some((p) => p.id === params.projectId)
                ? params.projectId
                : ''
            }
            onChange={(e) => patch({ projectId: e.target.value || null })}
          >
            <MenuItem value="">{th.workload.filters.allProjects}</MenuItem>
            {projects.map((p) => (
              <MenuItem key={p.id} value={p.id}>
                {p.name}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
        <FormControlLabel
          label={th.workload.filters.onlyOver}
          control={
            <Checkbox size="small" checked={params.onlyOver} onChange={(_e, v) => patch({ onlyOver: v })} />
          }
        />
        <Button
          size="small"
          disabled={!filtered}
          onClick={() => patch({ positionId: null, projectId: null, onlyOver: false })}
        >
          {th.workload.filters.clear}
        </Button>
        <Box sx={{ flex: 1 }} />
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
          <IconButton size="small" aria-label={th.workload.window.prev} onClick={() => shift(-WORKLOAD_STEP)}>
            <ChevronLeft fontSize="small" />
          </IconButton>
          <Button
            size="small"
            onClick={() => patch({ from: thisWeek, to: addWeeks(thisWeek, WORKLOAD_WEEKS) })}
            disabled={params.from === thisWeek}
          >
            {th.workload.window.thisWeek}
          </Button>
          <IconButton size="small" aria-label={th.workload.window.next} onClick={() => shift(WORKLOAD_STEP)}>
            <ChevronRight fontSize="small" />
          </IconButton>
          <Typography variant="body2" sx={{ color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
            {th.workload.window.range(formatThaiDate(params.from), formatThaiDate(addDays(params.to, -1)))}
          </Typography>
        </Box>
      </Box>

      <Tabs
        value={tab}
        onChange={(_e, v: 'table' | 'overloads') => setTab(v)}
        aria-label={th.workload.tabs.label}
      >
        <Tab value="table" label={th.workload.tabs.table} />
        <Tab value="overloads" label={th.workload.tabs.overloads(overloads.length)} />
      </Tabs>

      {q.isPending ? (
        <Box aria-busy="true" aria-label={th.workload.loading} role="status">
          {Array.from({ length: 5 }, (_, i) => (
            <Skeleton key={i} height={32} />
          ))}
        </Box>
      ) : q.isError ? (
        <Alert
          severity="error"
          action={
            <Button color="inherit" size="small" onClick={() => void q.refetch()}>
              {th.workload.retry}
            </Button>
          }
        >
          {th.workload.loadError}
        </Alert>
      ) : tab === 'overloads' ? (
        <OverloadList items={overloads} />
      ) : q.data.groups.length === 0 ? (
        <EmptyState title={th.workload.empty} />
      ) : (
        <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 2, minWidth: 0 }}>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <WorkloadTable
              data={q.data}
              view={view}
              selected={panel ? { userId: panel.userId, week: panel.week } : null}
              onOpen={openPanel}
              scrollerRef={lead}
              onGeometry={setGeometry}
            />
            <WorkloadLoadChart data={q.data} view={view} geometry={geometry} follow={follow} sync={sync} />
          </Box>
          <WorkloadCellPanel target={panel} onClose={closePanel} />
        </Box>
      )}
    </Box>
  )
}
