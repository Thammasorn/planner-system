'use client'
import { useId } from 'react'
import Box from '@mui/material/Box'
import FormControl from '@mui/material/FormControl'
import FormControlLabel from '@mui/material/FormControlLabel'
import InputLabel from '@mui/material/InputLabel'
import MenuItem from '@mui/material/MenuItem'
import Select from '@mui/material/Select'
import Switch from '@mui/material/Switch'
import ToggleButton from '@mui/material/ToggleButton'
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup'
import CalendarMonthOutlined from '@mui/icons-material/CalendarMonthOutlined'
import TableChartOutlined from '@mui/icons-material/TableChartOutlined'
import ViewKanbanOutlined from '@mui/icons-material/ViewKanbanOutlined'
import ViewListOutlined from '@mui/icons-material/ViewListOutlined'
import { usePreferences } from '@/hooks/usePreferences'
import { th } from '@/i18n/th'
import type { MilestoneRef } from '@/lib/contracts/milestones'
import type { PersonOption } from '@/lib/contracts/people'
import { displayName } from '@/lib/display-name'
import { TASK_GROUP_BY, TASK_SORT, taskPreference, type TaskView } from '@/lib/schemas/preferences'
import type { BoardMilestoneFilter } from '@/lib/tasks/board'

/** Non-empty sentinel for "ทุกคน": an empty value with `displayEmpty` leaves the outlined label un-notched, drawn
 *  over the placeholder (M8 review). Member ids are UUIDs, so it never collides. */
const ALL_ASSIGNEES = 'ALL'

const VIEW_ICONS: Record<TaskView, typeof ViewListOutlined> = {
  LIST: ViewListOutlined,
  BOARD: ViewKanbanOutlined,
  TABLE: TableChartOutlined,
  CALENDAR: CalendarMonthOutlined,
}

/** The project งาน tab only has ลิสต์ · บอร์ด (FR-660): /tasks' ตาราง / ปฏิทิน (M11.4) read as ลิสต์ there. */
export function projectTaskView(view: TaskView): 'LIST' | 'BOARD' {
  return view === 'BOARD' ? 'BOARD' : 'LIST'
}

/**
 * The view toggle (FR-660, `tasks.view`): ลิสต์ · บอร์ด on the project tasks tab; /tasks adds ตาราง · ปฏิทิน (M11.4,
 * FR-668/669) and passes its own `value` / `onChange` (it also mirrors the view in the URL).
 */
export function ViewToggle({
  views = ['LIST', 'BOARD'],
  value,
  onChange,
}: {
  views?: readonly TaskView[]
  value?: TaskView
  onChange?: (v: TaskView) => void
} = {}) {
  const { prefs, setPreference } = usePreferences()
  const stored = taskPreference(prefs, 'tasks.view')
  const current = value ?? (views.includes(stored) ? stored : 'LIST')
  return (
    <ToggleButtonGroup
      exclusive
      size="small"
      value={current}
      aria-label={th.tasks.view.label}
      onChange={(_e, v: TaskView | null) => {
        if (!v) return
        if (onChange) onChange(v)
        else setPreference('tasks.view', v)
      }}
    >
      {views.map((v) => {
        const Icon = VIEW_ICONS[v]
        return (
          <ToggleButton key={v} value={v}>
            <Icon fontSize="small" sx={{ mr: 0.5 }} aria-hidden="true" />
            {VIEW_LABELS[v]}
          </ToggleButton>
        )
      })}
    </ToggleButtonGroup>
  )
}

const VIEW_LABELS: Record<TaskView, string> = {
  LIST: th.tasks.view.list,
  BOARD: th.tasks.view.board,
  TABLE: th.tasks.view.table,
  CALENDAR: th.tasks.view.calendar,
}

function PrefSwitch({
  pref,
  label,
}: {
  pref: 'tasks.showCompleted' | 'tasks.board.leafOnly' | 'tasks.board.hideDone'
  label: string
}) {
  const { prefs, setPreference } = usePreferences()
  return (
    <FormControlLabel
      label={label}
      control={
        <Switch
          size="small"
          checked={taskPreference(prefs, pref)}
          onChange={(_e, v) => setPreference(pref, v)}
        />
      }
    />
  )
}

/**
 * Tasks tab toolbar (FR-613, FR-660): list view → group by (none/status/assignee/certainty/milestone), sort and
 * "แสดงงานที่เสร็จแล้ว"; board view → assignee filter, milestone filter (M8-D15), "เฉพาะงานย่อยสุด",
 * "ซ่อนคอลัมน์หมวดเสร็จ". All saved through user_preferences except the board's assignee and milestone filters.
 */
export function TaskToolbar({
  members,
  assigneeId,
  onAssignee,
  milestones = [],
  milestone = 'ALL',
  onMilestone,
}: {
  members: readonly PersonOption[]
  assigneeId: string | null
  onAssignee: (id: string | null) => void
  /** M8: the project's live milestones (date order) for the board filter; omitted → no filter. */
  milestones?: readonly MilestoneRef[]
  milestone?: BoardMilestoneFilter
  onMilestone?: (v: BoardMilestoneFilter) => void
}) {
  const { prefs, setPreference } = usePreferences()
  const view = projectTaskView(taskPreference(prefs, 'tasks.view'))
  const groupId = useId()
  const sortId = useId()
  const assigneeLabelId = useId()
  const milestoneLabelId = useId()
  return (
    <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 1.5, mb: 2 }}>
      <ViewToggle />
      {view === 'LIST' ? (
        <>
          <FormControl size="small" sx={{ minWidth: 160 }}>
            <InputLabel id={groupId}>{th.tasks.groupBy.label}</InputLabel>
            <Select
              labelId={groupId}
              label={th.tasks.groupBy.label}
              value={taskPreference(prefs, 'tasks.groupBy')}
              onChange={(e) => {
                const v = TASK_GROUP_BY.find((x) => x === e.target.value)
                if (v) setPreference('tasks.groupBy', v)
              }}
            >
              {TASK_GROUP_BY.map((g) => (
                <MenuItem key={g} value={g}>
                  {th.tasks.groupBy[g]}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          <FormControl size="small" sx={{ minWidth: 160 }}>
            <InputLabel id={sortId}>{th.tasks.sort.label}</InputLabel>
            <Select
              labelId={sortId}
              label={th.tasks.sort.label}
              value={taskPreference(prefs, 'tasks.sort')}
              onChange={(e) => {
                const v = TASK_SORT.find((x) => x === e.target.value)
                if (v) setPreference('tasks.sort', v)
              }}
            >
              {TASK_SORT.map((s) => (
                <MenuItem key={s} value={s}>
                  {th.tasks.sort[s]}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          <PrefSwitch pref="tasks.showCompleted" label={th.tasks.showCompleted} />
        </>
      ) : (
        <>
          <FormControl size="small" sx={{ minWidth: 180 }}>
            <InputLabel id={assigneeLabelId}>{th.tasks.board.assignee}</InputLabel>
            <Select
              labelId={assigneeLabelId}
              label={th.tasks.board.assignee}
              value={assigneeId ?? ALL_ASSIGNEES}
              onChange={(e) => onAssignee(e.target.value === ALL_ASSIGNEES ? null : e.target.value)}
            >
              <MenuItem value={ALL_ASSIGNEES}>{th.tasks.board.allAssignees}</MenuItem>
              {members.map((p) => (
                <MenuItem key={p.id} value={p.id}>
                  {displayName(p)}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          {onMilestone ? (
            <FormControl size="small" sx={{ minWidth: 180 }}>
              <InputLabel id={milestoneLabelId}>{th.milestones.tasks.filter}</InputLabel>
              <Select
                labelId={milestoneLabelId}
                label={th.milestones.tasks.filter}
                value={milestone}
                onChange={(e) => onMilestone(e.target.value)}
              >
                <MenuItem value="ALL">{th.milestones.tasks.allMilestones}</MenuItem>
                <MenuItem value="NONE">{th.milestones.none}</MenuItem>
                {milestones.map((x) => (
                  <MenuItem key={x.id} value={x.id}>
                    {th.milestones.tasks.cardLabel(x.name)}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          ) : null}
          <PrefSwitch pref="tasks.board.leafOnly" label={th.tasks.board.leafOnly} />
          <PrefSwitch pref="tasks.board.hideDone" label={th.tasks.board.hideDone} />
        </>
      )}
    </Box>
  )
}
