'use client'
// src/components/tasks/TaskProperties.tsx — the property rows of a task, shared by the task panel and the task page
// (FR-683/684, M6.1-D16, plan/m06.1 S3.1): สถานะ · เสร็จ · วันที่ · ความแน่นอน (+ source, BR-36) · ผู้รับผิดชอบ (+ วางแผน
// per assignee, FR-612) · ถูกขวางโดย / กำลังขวาง (FR-640–641) · งานย่อย (☐ / status / people / ↗ / + เพิ่มงานย่อย).
// Light form rows (FR-1604); every write goes through useTaskMutations (optimistic + undo, M3). No milestone (M8).
import { useEffect, useMemo, useRef, useState } from 'react'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Checkbox from '@mui/material/Checkbox'
import FormControlLabel from '@mui/material/FormControlLabel'
import Menu from '@mui/material/Menu'
import MenuItem from '@mui/material/MenuItem'
import Typography from '@mui/material/Typography'
import CheckOutlined from '@mui/icons-material/CheckOutlined'
import { DateField } from '@/components/common/DateField'
import { UserName } from '@/components/common/UserName'
import { PropertyList, PropertyRow } from '@/components/layout/PropertyList'
import { addDays, compareISO } from '@/domain/dates'
import type { Certainty } from '@/domain/types'
import { usePeopleOptions } from '@/hooks/usePeopleOptions'
import { useToday } from '@/hooks/useToday'
import { th } from '@/i18n/th'
import type { PersonOption } from '@/lib/contracts/people'
import type { ProjectTasksResponse } from '@/lib/contracts/tasks'
import { displayName } from '@/lib/display-name'
import { formatThaiDate } from '@/lib/format'
import { taskCertainty } from '@/lib/tasks/certainty'
import { buildTaskRows, unionAssigneeIds, type TaskRowModel } from '@/lib/tasks/tree'
import { AssigneeChips, personOf } from './AssigneeChips'
import { AssigneeAddButton } from './AssigneePicker'
import { BlockersSection, TaskRefButton } from './blockers/BlockersSection'
import { OpenAsPageLink } from './OpenAsPage'
import { PlanRangeDialog } from './plan/PlanRangeDialog'
import { QuickAdd } from './QuickAdd'
import { StatusChip } from './status/StatusChip'
import { StatusMenu } from './status/StatusMenu'
import rowStyles from './TaskRow.module.css'
import { useTaskMutations } from './useTaskMutations'

export interface TaskPropertiesProps {
  projectId: string
  task: TaskRowModel
  data: ProjectTasksResponse
  /** panel: names open the panel; page: names link to /t/<id> (FR-683). */
  variant: 'panel' | 'page'
}

type CertaintyChoice = Certainty | 'INHERIT'

const CHOICES: readonly { value: CertaintyChoice; label: string }[] = [
  { value: 'INHERIT', label: th.tasks.certainty.inherit },
  { value: 'CONFIRMED', label: th.tasks.certainty.confirmed },
  { value: 'TENTATIVE', label: th.tasks.certainty.tentative },
]

/** Light text button of a property value (borderless until hover/focus, FR-1604). */
const valueButtonSx = {
  textTransform: 'none',
  color: 'text.primary',
  fontSize: 'var(--font-md)',
  fontWeight: 'var(--weight-regular)',
  px: 1,
  minWidth: 0,
  justifyContent: 'flex-start',
  '&:hover': { bgcolor: 'var(--hover-bg)' },
} as const

const muted = { color: 'var(--text-secondary)', fontSize: 'var(--font-sm)' } as const

export function TaskProperties({ projectId, task, data, variant }: TaskPropertiesProps) {
  const m = useTaskMutations(projectId)
  const rows = useMemo(() => buildTaskRows(data.tasks), [data.tasks])
  const byId = useMemo(() => new Map(rows.map((r) => [r.id, r])), [rows])
  const people = usePeopleOptions()
  const peopleById = useMemo(
    () => new Map<string, PersonOption>((people.data ?? []).map((p) => [p.id, p])),
    [people.data],
  )
  const memberIds = useMemo(() => new Set(data.members.map((x) => x.userId)), [data.members])
  const today = useToday()
  const [dateError, setDateError] = useState<string | undefined>(undefined)
  const [statusMenu, setStatusMenu] = useState<{ anchor: HTMLElement; taskId: string } | null>(null)
  const [certaintyAnchor, setCertaintyAnchor] = useState<HTMLElement | null>(null)
  const [addingSub, setAddingSub] = useState(false)
  const [planFor, setPlanFor] = useState<{ assignmentId: string; name: string } | null>(null)
  const subRef = useRef<HTMLInputElement>(null)
  const addSubRef = useRef<HTMLButtonElement>(null)
  const assigneesRef = useRef<HTMLDivElement>(null)
  const refocusAddSub = useRef(false)
  // Esc in the subtask quick add unmounts the field: hand focus back to "+ เพิ่มงานย่อย"
  useEffect(() => {
    if (addingSub || !refocusAddSub.current) return
    refocusAddSub.current = false
    addSubRef.current?.focus()
  }, [addingSub])

  const { canEdit, canManage } = data.viewer
  const status = data.statuses.find((s) => s.id === task.statusId)
  const certainty = taskCertainty(byId, task.id, data.project.certainty)
  const source =
    certainty.source === 'task'
      ? th.tasks.certainty.source.task
      : certainty.source === 'ancestor'
        ? th.tasks.certainty.source.ancestor(certainty.sourceTaskName ?? '')
        : th.tasks.certainty.source.project
  const choice: CertaintyChoice = task.certaintyOverride ?? 'INHERIT'
  const children = rows.filter((r) => r.parentId === task.id)
  // FR-612 defaults: the task's dates, else today .. today + 4 (end never before start)
  const planStart = task.startDate ?? today
  const dueOrDefault = task.dueDate ?? addDays(planStart, 4)
  const planEnd = compareISO(dueOrDefault, planStart) < 0 ? planStart : dueOrDefault
  const done = task.completedOn !== null
  const menuTask = statusMenu ? byId.get(statusMenu.taskId) : undefined
  const stacked = variant === 'panel'

  const setDate = (field: 'startDate' | 'dueDate', value: string | null) => {
    const start = field === 'startDate' ? value : task.startDate
    const due = field === 'dueDate' ? value : task.dueDate
    if (start && due && compareISO(due, start) < 0) {
      setDateError(th.tasks.errors.dueBeforeStart)
      return
    }
    setDateError(undefined)
    if (value !== task[field]) m.update(task.id, { [field]: value })
  }
  const toggleDone = (r: TaskRowModel) => (r.completedOn !== null ? m.uncomplete([r.id]) : m.complete([r.id]))

  return (
    <PropertyList aria-label={th.taskPage.propertiesLabel}>
      <PropertyRow label={th.taskPage.properties.status}>
        {status ? (
          <StatusChip
            status={status}
            disabled={!canEdit}
            onClick={(e) => setStatusMenu({ anchor: e.currentTarget, taskId: task.id })}
          />
        ) : null}
      </PropertyRow>

      <PropertyRow label={th.taskPage.properties.done}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
          <FormControlLabel
            sx={{ m: 0, '& .MuiFormControlLabel-label': { fontSize: 'var(--font-md)' } }}
            label={th.tasks.panel.completed}
            control={
              <Checkbox
                size="small"
                data-lead=""
                checked={done}
                disabled={!canEdit}
                onChange={() => toggleDone(task)}
                sx={{ p: 0.5 }}
              />
            }
          />
          {task.completedOn ? (
            <Typography component="span" sx={muted}>
              {th.tasks.completedOn(formatThaiDate(task.completedOn))}
            </Typography>
          ) : null}
        </Box>
      </PropertyRow>

      <PropertyRow label={th.taskPage.properties.dates}>
        {/* The 440 px panel is too narrow for two pickers side by side (whatever the viewport): stack them there. */}
        <Box
          data-lead-input=""
          data-testid="task-dates"
          data-layout={stacked ? 'stacked' : 'inline'}
          sx={{
            display: 'grid',
            gridTemplateColumns: stacked ? '1fr' : { xs: '1fr', sm: '1fr auto 1fr' },
            alignItems: 'center',
            gap: 1,
          }}
        >
          <DateField
            label={th.tasks.panel.startDate}
            value={task.startDate}
            maxDate={task.dueDate ?? undefined}
            disabled={!canEdit}
            onChange={(v) => setDate('startDate', v)}
          />
          <Box
            component="span"
            aria-label={th.taskPage.dateTo}
            role="img"
            sx={{ ...muted, display: stacked ? 'none' : { xs: 'none', sm: 'inline' } }}
          >
            →
          </Box>
          <DateField
            label={th.tasks.panel.dueDate}
            value={task.dueDate}
            minDate={task.startDate ?? undefined}
            disabled={!canEdit}
            error={dateError}
            onChange={(v) => setDate('dueDate', v)}
          />
        </Box>
      </PropertyRow>

      <PropertyRow label={th.taskPage.properties.certainty}>
        <Button
          size="small"
          data-lead=""
          disabled={!canEdit}
          aria-haspopup="menu"
          aria-expanded={certaintyAnchor !== null}
          onClick={(e) => setCertaintyAnchor(e.currentTarget)}
          sx={valueButtonSx}
        >
          {certainty.value === 'TENTATIVE' ? th.tasks.certainty.tentative : th.tasks.certainty.confirmed}
          &nbsp;
          <Box component="span" sx={muted} data-testid="certainty-source">
            ({source})
          </Box>
        </Button>
        <Menu
          anchorEl={certaintyAnchor}
          open={certaintyAnchor !== null}
          onClose={() => setCertaintyAnchor(null)}
          slotProps={{ list: { 'aria-label': th.tasks.certainty.menuLabel } }}
        >
          {CHOICES.map((c) => (
            <MenuItem
              key={c.value}
              role="menuitemradio"
              aria-checked={c.value === choice}
              selected={c.value === choice}
              onClick={() => {
                setCertaintyAnchor(null)
                const next = c.value === 'INHERIT' ? null : c.value
                if (next !== task.certaintyOverride) m.update(task.id, { certaintyOverride: next })
              }}
              sx={{ gap: 1, fontSize: 'var(--font-md)' }}
            >
              <Box component="span" sx={{ width: 20, display: 'inline-flex' }}>
                {c.value === choice ? (
                  <CheckOutlined aria-hidden="true" sx={{ fontSize: 'var(--font-lg)' }} />
                ) : null}
              </Box>
              {c.label}
            </MenuItem>
          ))}
        </Menu>
      </PropertyRow>

      <PropertyRow label={th.taskPage.properties.assignees}>
        <Box sx={{ display: 'grid', gap: 0.5 }}>
          <Box ref={assigneesRef} sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 0.5 }}>
            <AssigneeChips
              assignees={task.assignees}
              unionUserIds={task.isLeaf ? [] : unionAssigneeIds(rows, task.id)}
              isLeaf={task.isLeaf}
              people={peopleById}
              canEdit={canEdit}
              onUnassign={(id, label) => m.unassign([id], label)}
              // the last × falls back to "+ คน" (the box's only direct button; the chips sit in their own span)
              focusFallback={() => assigneesRef.current?.querySelector<HTMLElement>(':scope > button')}
            />
            {task.isLeaf && canEdit ? (
              <AssigneeAddButton
                projectId={projectId}
                taskId={task.id}
                projectMemberIds={memberIds}
                assignedUserIds={new Set(task.assignees.map((x) => x.userId))}
                canManage={canManage}
              />
            ) : null}
          </Box>
          {!task.isLeaf ? (
            <Typography component="span" sx={muted}>
              {th.tasks.panel.parentAssigneesHint}
            </Typography>
          ) : null}
          {task.isLeaf && canEdit && task.assignees.length > 0 ? (
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }} data-testid="plan-buttons">
              {task.assignees.map((a) => {
                const name = displayName(personOf(peopleById, a.userId))
                return (
                  <Button
                    key={a.assignmentId}
                    size="small"
                    variant="outlined"
                    onClick={() => setPlanFor({ assignmentId: a.assignmentId, name })}
                    sx={{ textTransform: 'none', borderColor: 'var(--border-subtle)' }}
                  >
                    {th.plan.buttonFor(name)}
                  </Button>
                )
              })}
            </Box>
          ) : null}
        </Box>
        {planFor ? (
          <PlanRangeDialog
            open
            onClose={() => setPlanFor(null)}
            taskAssignmentId={planFor.assignmentId}
            personName={planFor.name}
            taskName={task.name}
            projectId={projectId}
            defaultStart={planStart}
            defaultEnd={planEnd}
          />
        ) : null}
      </PropertyRow>

      <BlockersSection
        projectId={projectId}
        task={task}
        rows={rows}
        data={data}
        canEdit={canEdit}
        variant={variant}
      />

      <PropertyRow label={th.taskPage.properties.subtasks}>
        <Box sx={{ display: 'grid', gap: 0.5, justifyItems: 'start' }}>
          {children.length > 0 ? (
            <Box
              component="ul"
              sx={{ listStyle: 'none', m: 0, p: 0, display: 'grid', gap: 0.5, width: '100%' }}
            >
              {children.map((c) => {
                const childStatus = data.statuses.find((s) => s.id === c.statusId)
                const ids = c.isLeaf ? c.assignees.map((x) => x.userId) : unionAssigneeIds(rows, c.id)
                return (
                  <Box
                    component="li"
                    key={c.id}
                    data-task-id={c.id}
                    data-open-host=""
                    sx={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 0.5, minWidth: 0 }}
                  >
                    <Checkbox
                      size="small"
                      data-lead=""
                      checked={c.completedOn !== null}
                      disabled={!canEdit}
                      onChange={() => toggleDone(c)}
                      sx={{ p: 0.5 }}
                      slotProps={{ input: { 'aria-label': th.tasks.completeCheckbox(c.name) } }}
                    />
                    <TaskRefButton
                      taskId={c.id}
                      name={c.name}
                      variant={variant}
                      done={c.completedOn !== null}
                    />
                    {childStatus ? (
                      <StatusChip
                        status={childStatus}
                        disabled={!canEdit}
                        onClick={(e) => setStatusMenu({ anchor: e.currentTarget, taskId: c.id })}
                      />
                    ) : null}
                    {ids.length === 0 ? (
                      <span className={rowStyles.unassigned}>{th.tasks.unassigned}</span>
                    ) : (
                      ids.map((id) => (
                        <Box component="span" key={id} sx={muted}>
                          <UserName user={personOf(peopleById, id)} />
                        </Box>
                      ))
                    )}
                    <OpenAsPageLink taskId={c.id} alwaysVisible />
                  </Box>
                )
              })}
            </Box>
          ) : null}
          {canEdit && task.depth < 2 ? (
            addingSub ? (
              <Box sx={{ width: '100%' }}>
                <QuickAdd
                  depth={0}
                  inset={0}
                  disabled={false}
                  inputRef={subRef}
                  label={th.tasks.panel.addSubtask}
                  autoFocus
                  onCreate={(name) => m.create({ parentId: task.id, name })}
                  onEscape={() => {
                    refocusAddSub.current = true
                    setAddingSub(false)
                  }}
                />
              </Box>
            ) : (
              <Button
                ref={addSubRef}
                size="small"
                data-lead=""
                onClick={() => setAddingSub(true)}
                sx={{ ...valueButtonSx, color: 'var(--text-secondary)' }}
              >
                {th.tasks.panel.addSubtask}
              </Button>
            )
          ) : null}
        </Box>
      </PropertyRow>

      <StatusMenu
        statuses={data.statuses}
        currentId={menuTask?.statusId ?? null}
        anchorEl={statusMenu?.anchor ?? null}
        onPick={(id) => {
          if (statusMenu && menuTask && id !== menuTask.statusId) m.setStatus([statusMenu.taskId], id)
        }}
        onClose={() => setStatusMenu(null)}
      />
    </PropertyList>
  )
}
