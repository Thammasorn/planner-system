'use client'
import { useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { CertaintyBadge } from '@/components/common/CertaintyBadge'
import { UserAvatar } from '@/components/common/UserAvatar'
import { UserName } from '@/components/common/UserName'
import { usePeopleOptions } from '@/hooks/usePeopleOptions'
import { th } from '@/i18n/th'
import type { PersonOption } from '@/lib/contracts/people'
import type { TaskCard as TaskCardDTO, TaskStatusDTO } from '@/lib/contracts/tasks'
import { formatThaiDate } from '@/lib/format'
import { personOf } from '../AssigneeChips'
import { BlockerBadge } from '../blockers/BlockerBadge'
import { StatusChip } from '../status/StatusChip'
import { StatusMenu } from '../status/StatusMenu'
import styles from './TaskBoard.module.css'
import rowStyles from '../TaskRow.module.css'
import { useCardSlot } from './TaskBoard'

export interface TaskCardProps {
  card: TaskCardDTO
  /** StatusMenu options (project's statuses; /tasks: statusesByProject[card.projectId]). */
  statuses: readonly TaskStatusDTO[]
  canEdit: boolean
  /** Tooltip names — project views only (/tasks: counts only, §7.8). */
  blockerNames?: readonly string[] | undefined
  /** Enter/Space/click → panel (?task=) or navigation. */
  onOpen: (taskId: string) => void
  /** `S` menu and chip. */
  onPickStatus: (taskId: string, statusId: string) => void
  /** Mod+Enter. */
  onToggleDone: (taskId: string) => void
  /** /tasks: cards show their project (§8.10). */
  projectName?: string | undefined
  // M8 adds `milestone?: { name: string; late: boolean } | null` (S4.7) — absent renders exactly as M3
}

/**
 * Board card (FR-661, M3-D35): name (struck through when done), parent breadcrumb, status chip, assignees or
 * "รอมอบหมาย", due date, ⛔/✓, ◐. Focusable (roving tabIndex from TaskBoard): Enter/Space open, `S` status menu,
 * Mod+Enter done. No milestone in M3 (X21).
 */
export function TaskCard({
  card,
  statuses,
  canEdit,
  blockerNames,
  onOpen,
  onPickStatus,
  onToggleDone,
  projectName,
}: TaskCardProps) {
  const slot = useCardSlot(card.id)
  const people = usePeopleOptions()
  const peopleById = useMemo(
    () => new Map<string, PersonOption>((people.data ?? []).map((p) => [p.id, p])),
    [people.data],
  )
  const [menu, setMenu] = useState<HTMLElement | null>(null)
  const chipRef = useRef<HTMLDivElement>(null)

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.target !== e.currentTarget) return
    const mod = e.metaKey || e.ctrlKey
    if (e.key === 'Enter' && mod) {
      e.preventDefault()
      if (canEdit) onToggleDone(card.id)
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      onOpen(card.id)
    } else if (e.code === 'KeyS' && !mod && !e.altKey && !e.shiftKey && canEdit) {
      e.preventDefault()
      setMenu(chipRef.current ?? e.currentTarget)
    }
  }

  return (
    <div
      {...slot}
      role="article"
      aria-label={card.name}
      className={styles.card}
      data-completed={card.completed ? 'true' : undefined}
      onKeyDown={onKeyDown}
      onClick={(e) => {
        // events from portalled popovers (status menu) bubble through React but are not DOM children
        if (!e.currentTarget.contains(e.target as Node)) return
        if ((e.target as HTMLElement).closest('button,a,.MuiChip-root')) return
        onOpen(card.id)
      }}
    >
      {projectName ? <span className={styles.cardMeta}>{projectName}</span> : null}
      {card.parentPath.length > 0 ? (
        <span className={styles.cardMeta}>{th.tasks.groups.parentPath(card.parentPath.join(' › '))}</span>
      ) : null}
      <span className={styles.cardName}>
        {card.name} {card.certainty === 'TENTATIVE' ? <CertaintyBadge certainty="TENTATIVE" /> : null}
      </span>
      <span className={styles.cardMeta}>
        <span ref={chipRef} style={{ display: 'inline-flex' }}>
          {/* the card is the only tab stop (M3-D35): S opens this menu from the keyboard */}
          <StatusChip
            status={card.status}
            disabled={!canEdit}
            tabIndex={-1}
            onClick={(e) => setMenu(e.currentTarget)}
          />
        </span>
        {card.blockers.total > 0 ? (
          <BlockerBadge
            open={card.blockers.open}
            total={card.blockers.total}
            names={blockerNames}
            focusable={false}
          />
        ) : null}
      </span>
      <span className={styles.cardMeta}>
        {card.assigneeIds.length === 0 ? (
          <span className={rowStyles.unassigned}>{th.tasks.unassigned}</span>
        ) : (
          card.assigneeIds.map((id) => {
            const p = personOf(peopleById, id)
            return (
              <span key={id} className={rowStyles.chip}>
                <UserAvatar user={p} size={18} />
                <UserName user={p} />
              </span>
            )
          })
        )}
        {card.dueDate ? <span>{formatThaiDate(card.dueDate)}</span> : null}
      </span>
      <StatusMenu
        statuses={statuses}
        currentId={card.status.id}
        anchorEl={menu}
        onPick={(statusId) => {
          if (statusId !== card.status.id) onPickStatus(card.id, statusId)
        }}
        onClose={() => setMenu(null)}
      />
    </div>
  )
}
