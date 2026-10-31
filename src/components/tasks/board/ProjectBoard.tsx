'use client'
import { useEffect, useMemo, useRef, useState } from 'react'
import Button from '@mui/material/Button'
import { usePreferences } from '@/hooks/usePreferences'
import { th } from '@/i18n/th'
import type { ProjectTasksResponse, TaskCard as TaskCardDTO } from '@/lib/contracts/tasks'
import { taskPreference } from '@/lib/schemas/preferences'
import { buildStatusColumns, toCardModel, type BoardColumn } from '@/lib/tasks/board'
import { taskCertainty } from '@/lib/tasks/certainty'
import { buildTaskRows } from '@/lib/tasks/tree'
import { QuickAdd } from '../QuickAdd'
import { openTaskPanel } from '../task-param'
import { useTaskMutations } from '../useTaskMutations'
import { columnLabel, TaskBoard } from './TaskBoard'
import { TaskCard } from './TaskCard'

/**
 * Project board (FR-660–664): one column per status in position order, every depth, filters assignee /
 * "เฉพาะงานย่อยสุด" / "ซ่อนคอลัมน์หมวดเสร็จ"; a drop = setStatus (FR-608 prompt for DONE parents), column quick add
 * creates in that status (FR-664). Archived → read-only.
 */
export function ProjectBoard({
  projectId,
  data,
  assigneeId,
}: {
  projectId: string
  data: ProjectTasksResponse
  assigneeId: string | null
}) {
  const { prefs } = usePreferences()
  const leafOnly = taskPreference(prefs, 'tasks.board.leafOnly')
  const hideDone = taskPreference(prefs, 'tasks.board.hideDone')
  const m = useTaskMutations(projectId)
  const { canEdit } = data.viewer
  const rows = useMemo(() => buildTaskRows(data.tasks), [data.tasks])
  const byId = useMemo(() => new Map(rows.map((r) => [r.id, r])), [rows])
  const columns = useMemo<BoardColumn<TaskCardDTO>[]>(
    () =>
      buildStatusColumns(rows, data.statuses, { leafOnly, hideDone, assigneeId }).map((c) => ({
        ...c,
        cards: c.cards.map((r) =>
          toCardModel(r, data.statuses, taskCertainty(byId, r.id, data.project.certainty).value),
        ),
      })),
    [rows, data.statuses, data.project.certainty, leafOnly, hideDone, assigneeId, byId],
  )
  const blockerNames = (taskId: string) =>
    data.blockerEdges
      .filter((e) => e.taskId === taskId)
      .map((e) => byId.get(e.blockerTaskId)?.name)
      .filter((n): n is string => n !== undefined)
  const toggleDone = (id: string) => {
    const r = byId.get(id)
    if (!r) return
    if (r.completedOn === null) m.complete([id])
    else m.uncomplete([id])
  }

  return (
    <TaskBoard<TaskCardDTO>
      columns={columns}
      canEdit={canEdit}
      cardLabel={(c) => c.name}
      onMove={(cardId, key) => {
        const statusId = columns.find((c) => c.key === key)?.statusId
        if (statusId) m.setStatus([cardId], statusId)
      }}
      renderCard={(card) => (
        <TaskCard
          card={card}
          statuses={data.statuses}
          canEdit={canEdit}
          blockerNames={blockerNames(card.id)}
          onOpen={openTaskPanel}
          onPickStatus={(id, statusId) => m.setStatus([id], statusId)}
          onToggleDone={toggleDone}
        />
      )}
      footer={(col) => (
        <ColumnQuickAdd
          label={th.tasks.board.quickAdd(columnLabel(col))}
          onCreate={(name) =>
            m.create({ parentId: null, name, ...(col.statusId ? { statusId: col.statusId } : {}) })
          }
        />
      )}
    />
  )
}

function ColumnQuickAdd({ label, onCreate }: { label: string; onCreate: (name: string) => void }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLInputElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const refocus = useRef(false)
  // Esc unmounts the field: give focus back to "+ เพิ่มงาน" (a blur away from the empty field does not)
  useEffect(() => {
    if (open || !refocus.current) return
    refocus.current = false
    buttonRef.current?.focus()
  }, [open])
  if (!open) {
    return (
      <Button
        ref={buttonRef}
        size="small"
        aria-label={label}
        onClick={() => setOpen(true)}
        sx={{ justifyContent: 'flex-start' }}
      >
        {th.tasks.quickAdd.placeholder}
      </Button>
    )
  }
  return (
    <QuickAdd
      depth={0}
      inset={4}
      disabled={false}
      inputRef={ref}
      label={label}
      autoFocus
      onCreate={onCreate}
      onEscape={() => {
        refocus.current = true
        setOpen(false)
      }}
      onBlur={() => {
        if (ref.current?.value === '') setOpen(false)
      }}
    />
  )
}
