'use client'
import { useEffect, useMemo, useRef, useState } from 'react'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Checkbox from '@mui/material/Checkbox'
import Divider from '@mui/material/Divider'
import FormControlLabel from '@mui/material/FormControlLabel'
import IconButton from '@mui/material/IconButton'
import TextField from '@mui/material/TextField'
import ToggleButton from '@mui/material/ToggleButton'
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup'
import Typography from '@mui/material/Typography'
import CloseOutlined from '@mui/icons-material/CloseOutlined'
import DeleteOutlined from '@mui/icons-material/DeleteOutlined'
import { DateField } from '@/components/common/DateField'
import { InlineEditText } from '@/components/common/InlineEditText'
import { addDays, compareISO } from '@/domain/dates'
import type { Certainty } from '@/domain/types'
import { useHotkeys } from '@/hooks/useHotkeys'
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
import { BlockersSection } from './blockers/BlockersSection'
import { PlanRangeDialog } from './plan/PlanRangeDialog'
import { QuickAdd } from './QuickAdd'
import { StatusChip } from './status/StatusChip'
import { StatusMenu } from './status/StatusMenu'
import { closeTaskPanel, openTaskPanel, useTaskParam } from './task-param'
import { useProjectTasks } from './useProjectTasks'
import { useTaskMutations } from './useTaskMutations'

export const PANEL_WIDTH = 440

const PANEL_SELECTOR = '[data-testid="task-panel"]'

/** The task's list row or board card, else the list/board's current roving tab stop. */
function focusTask(taskId: string): void {
  const id = CSS.escape(taskId)
  const el =
    document.querySelector<HTMLElement>(`[role="row"][data-task-id="${id}"], [data-board-card="${id}"]`) ??
    document.querySelector<HTMLElement>('[role="treegrid"] [role="row"][tabindex="0"], [data-board-card][tabindex="0"]')
  el?.focus()
}

/**
 * Close the panel; when focus was inside it (Esc, ✕, ลบงาน) put it back on the task's row/card so keyboard users
 * keep their place instead of landing on <body> (FR-611, §8.9). Esc from the list leaves focus where it is.
 */
function closePanel(taskId: string): void {
  const fromPanel = document.activeElement?.closest(PANEL_SELECTOR) != null
  closeTaskPanel()
  if (fromPanel) setTimeout(() => focusTask(taskId), 0)
}

/**
 * Task detail panel (FR-601, FR-611, BR-36, M3-D17): an `<aside>` beside the list (not an overlay), opened by
 * `?task=<id>`; Esc or ✕ closes. Reads the task from the project-tasks query — an id not in it shows only
 * "ไม่พบงาน". A leaf's assignees each get "วางแผน" (FR-612, M6). No milestone (M8).
 */
export function TaskPanel({ projectId }: { projectId: string }) {
  const taskId = useTaskParam()
  const q = useProjectTasks(projectId)
  const onEscape = () => {
    if (taskId !== null) closePanel(taskId)
  }
  useHotkeys([{ hotkey: { code: 'Escape', key: 'Escape' }, handler: onEscape }], {
    enabled: taskId !== null,
  })
  if (taskId === null || !q.data) return null
  return (
    <Box
      component="aside"
      aria-label={th.tasks.panel.label}
      data-testid="task-panel"
      sx={{
        width: { xs: '100%', md: PANEL_WIDTH },
        flex: 'none',
        alignSelf: 'flex-start',
        position: { md: 'sticky' },
        top: { md: 0 },
        maxHeight: { md: 'calc(100vh - 32px)' },
        overflowY: 'auto',
        border: 1,
        borderColor: 'divider',
        borderRadius: 1,
        bgcolor: 'background.paper',
        p: 2,
      }}
    >
      <PanelBody key={taskId} projectId={projectId} taskId={taskId} data={q.data} />
    </Box>
  )
}

function CloseButton({ taskId }: { taskId: string }) {
  return (
    <IconButton aria-label={th.tasks.panel.close} onClick={() => closePanel(taskId)} size="small">
      <CloseOutlined fontSize="small" />
    </IconButton>
  )
}

type CertaintyChoice = Certainty | 'INHERIT'

function PanelBody({
  projectId,
  taskId,
  data,
}: {
  projectId: string
  taskId: string
  data: ProjectTasksResponse
}) {
  const m = useTaskMutations(projectId)
  const rows = useMemo(() => buildTaskRows(data.tasks), [data.tasks])
  const byId = useMemo(() => new Map(rows.map((r) => [r.id, r])), [rows])
  const task = byId.get(taskId)
  const people = usePeopleOptions()
  const peopleById = useMemo(
    () => new Map<string, PersonOption>((people.data ?? []).map((p) => [p.id, p])),
    [people.data],
  )
  const memberIds = useMemo(() => new Set(data.members.map((x) => x.userId)), [data.members])
  const [notes, setNotes] = useState(task?.notes ?? '')
  const [dateError, setDateError] = useState<string | undefined>(undefined)
  const [statusAnchor, setStatusAnchor] = useState<HTMLElement | null>(null)
  const [addingSub, setAddingSub] = useState(false)
  const [planFor, setPlanFor] = useState<{ assignmentId: string; name: string } | null>(null)
  const today = useToday()
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

  if (!task) {
    return (
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Typography>{th.tasks.panel.notFound}</Typography>
        <CloseButton taskId={taskId} />
      </Box>
    )
  }
  const { canEdit, canManage } = data.viewer
  const status = data.statuses.find((s) => s.id === task.statusId)
  const certainty = taskCertainty(byId, task.id, data.project.certainty)
  const source =
    certainty.source === 'task'
      ? th.tasks.certainty.source.task
      : certainty.source === 'ancestor'
        ? th.tasks.certainty.source.ancestor(certainty.sourceTaskName ?? '')
        : th.tasks.certainty.source.project
  const children = rows.filter((r) => r.parentId === task.id)
  // FR-612 defaults: the task's dates, else today .. today + 4 (end never before start)
  const planStart = task.startDate ?? today
  const dueOrDefault = task.dueDate ?? addDays(planStart, 4)
  const planEnd = compareISO(dueOrDefault, planStart) < 0 ? planStart : dueOrDefault
  const done = task.completedOn !== null

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

  return (
    <Box sx={{ display: 'grid', gap: 2 }}>
      <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1 }}>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          {task.parentPath.length > 0 ? (
            <Typography variant="caption" sx={{ color: 'text.secondary' }}>
              {th.tasks.groups.parentPath(task.parentPath.join(' › '))}
            </Typography>
          ) : null}
          <InlineEditText
            value={task.name}
            label={th.tasks.panel.name}
            disabled={!canEdit}
            maxLength={500}
            variant="h6"
            component="h2"
            onCommit={(name) => m.updateAsync(task.id, { name })}
          />
        </Box>
        <CloseButton taskId={task.id} />
      </Box>

      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
        {status ? (
          <StatusChip
            status={status}
            size="medium"
            disabled={!canEdit}
            onClick={(e) => setStatusAnchor(e.currentTarget)}
          />
        ) : null}
        <FormControlLabel
          label={th.tasks.panel.completed}
          control={
            <Checkbox
              checked={done}
              disabled={!canEdit}
              onChange={() => (done ? m.uncomplete([task.id]) : m.complete([task.id]))}
            />
          }
        />
        {task.completedOn ? (
          <Typography variant="body2" color="text.secondary">
            {th.tasks.completedOn(formatThaiDate(task.completedOn))}
          </Typography>
        ) : null}
        <StatusMenu
          statuses={data.statuses}
          currentId={task.statusId}
          anchorEl={statusAnchor}
          onPick={(id) => m.setStatus([task.id], id)}
          onClose={() => setStatusAnchor(null)}
        />
      </Box>

      <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1 }}>
        <DateField
          label={th.tasks.panel.startDate}
          value={task.startDate}
          maxDate={task.dueDate ?? undefined}
          disabled={!canEdit}
          onChange={(v) => setDate('startDate', v)}
        />
        <DateField
          label={th.tasks.panel.dueDate}
          value={task.dueDate}
          minDate={task.startDate ?? undefined}
          disabled={!canEdit}
          error={dateError}
          onChange={(v) => setDate('dueDate', v)}
        />
      </Box>

      <Box>
        <Typography variant="subtitle2" component="h3" id={`certainty-${task.id}`}>
          {th.tasks.panel.certainty}
        </Typography>
        <ToggleButtonGroup
          exclusive
          size="small"
          value={(task.certaintyOverride ?? 'INHERIT') satisfies CertaintyChoice}
          disabled={!canEdit}
          aria-labelledby={`certainty-${task.id}`}
          onChange={(_e, v: CertaintyChoice | null) => {
            if (v === null) return
            const next = v === 'INHERIT' ? null : v
            if (next !== task.certaintyOverride) m.update(task.id, { certaintyOverride: next })
          }}
        >
          <ToggleButton value="INHERIT">{th.tasks.certainty.inherit}</ToggleButton>
          <ToggleButton value="CONFIRMED">{th.tasks.certainty.confirmed}</ToggleButton>
          <ToggleButton value="TENTATIVE">{th.tasks.certainty.tentative}</ToggleButton>
        </ToggleButtonGroup>
        <Typography variant="body2" sx={{ color: 'text.secondary', mt: 0.5 }} data-testid="certainty-source">
          {source}
        </Typography>
      </Box>

      <Box>
        <Typography variant="subtitle2" component="h3">
          {th.tasks.panel.assignees}
        </Typography>
        <Box
          ref={assigneesRef}
          sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 0.5, mt: 0.5 }}
        >
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
          <Typography variant="caption" sx={{ color: 'text.secondary' }}>
            {th.tasks.panel.parentAssigneesHint}
          </Typography>
        ) : null}
        {task.isLeaf && canEdit && task.assignees.length > 0 ? (
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, mt: 1 }} data-testid="plan-buttons">
            {task.assignees.map((a) => {
              const name = displayName(personOf(peopleById, a.userId))
              return (
                <Button
                  key={a.assignmentId}
                  size="small"
                  variant="outlined"
                  onClick={() => setPlanFor({ assignmentId: a.assignmentId, name })}
                >
                  {th.plan.buttonFor(name)}
                </Button>
              )
            })}
          </Box>
        ) : null}
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
      </Box>

      <TextField
        label={th.tasks.panel.notes}
        multiline
        minRows={3}
        value={notes}
        disabled={!canEdit}
        onChange={(e) => setNotes(e.target.value)}
        onBlur={() => {
          if (notes !== (task.notes ?? '')) m.update(task.id, { notes })
        }}
        size="small"
      />

      <Divider />
      <BlockersSection projectId={projectId} task={task} rows={rows} data={data} canEdit={canEdit} />
      <Divider />

      <Box>
        <Typography variant="subtitle2" component="h3">
          {th.tasks.panel.subtasks}
        </Typography>
        <Box component="ul" sx={{ listStyle: 'none', m: 0, p: 0 }}>
          {children.map((c: TaskRowModel) => (
            <li key={c.id}>
              <Button
                size="small"
                onClick={() => openTaskPanel(c.id)}
                sx={{ textTransform: 'none', textDecoration: c.completedOn ? 'line-through' : 'none' }}
              >
                {c.name}
              </Button>
            </li>
          ))}
        </Box>
        {canEdit && task.depth < 2 ? (
          addingSub ? (
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
          ) : (
            <Button ref={addSubRef} size="small" onClick={() => setAddingSub(true)}>
              {th.tasks.panel.addSubtask}
            </Button>
          )
        ) : null}
      </Box>

      {canEdit ? (
        <Button
          color="error"
          startIcon={<DeleteOutlined />}
          onClick={() => {
            m.remove([task.id])
            closePanel(task.id)
          }}
          sx={{ justifySelf: 'start' }}
        >
          {th.tasks.panel.delete}
        </Button>
      ) : null}
    </Box>
  )
}
