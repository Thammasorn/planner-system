'use client'
import CloseOutlined from '@mui/icons-material/CloseOutlined'
import { UserAvatar } from '@/components/common/UserAvatar'
import { UserName } from '@/components/common/UserName'
import { th } from '@/i18n/th'
import type { PersonOption } from '@/lib/contracts/people'
import type { TaskAssigneeDTO } from '@/lib/contracts/tasks'
import { displayName } from '@/lib/display-name'
import styles from './TaskRow.module.css'

const UNKNOWN: PersonOption = {
  id: '',
  name: '…',
  nickname: null,
  positionId: null,
  positionName: null,
  color: null,
  active: true,
}

export function personOf(people: ReadonlyMap<string, PersonOption>, userId: string): PersonOption {
  return people.get(userId) ?? { ...UNKNOWN, id: userId }
}

/**
 * Assignee chips (FR-605/606): a leaf shows removable chips (× = unassign with undo) or "รอมอบหมาย"; a parent shows
 * the read-only union of its subtree (BR-31) — no ×. Deactivated people keep their chip with "(ปิดใช้งาน)".
 */
export function AssigneeChips({
  assignees,
  unionUserIds,
  isLeaf,
  people,
  canEdit,
  onUnassign,
  removeTabIndex,
  focusFallback,
}: {
  assignees: readonly TaskAssigneeDTO[]
  unionUserIds: readonly string[]
  isLeaf: boolean
  people: ReadonlyMap<string, PersonOption>
  canEdit: boolean
  onUnassign: (assignmentId: string, label: string) => void
  /** -1 inside a roving-focus row (M3-D22): keyboard users unassign from the panel. */
  removeTabIndex?: number | undefined
  /**
   * Panel use (§8.9): × unmounts its own focused chip, so before unassigning focus moves to the next chip's × (else
   * the previous one, else this element, e.g. "+ คน"). Omitted in rows, where the row keeps roving focus.
   */
  focusFallback?: (() => HTMLElement | null | undefined) | undefined
}) {
  if (!isLeaf) {
    if (unionUserIds.length === 0) return null
    return (
      <span className={styles.meta} data-testid="union-assignees">
        {unionUserIds.map((id) => {
          const p = personOf(people, id)
          return (
            <span key={id} className={styles.chip} data-readonly="true">
              <UserAvatar user={p} size={20} />
              <UserName user={p} />
            </span>
          )
        })}
      </span>
    )
  }
  if (assignees.length === 0) return <span className={styles.unassigned}>{th.tasks.unassigned}</span>
  return (
    <span className={styles.meta}>
      {assignees.map((a) => {
        const p = personOf(people, a.userId)
        const label = displayName(p)
        return (
          <span key={a.assignmentId} className={styles.chip} data-assignee={a.userId}>
            <UserAvatar user={p} size={20} />
            <UserName user={p} />
            {canEdit ? (
              <button
                type="button"
                className={`${styles.iconButton} ${styles.chipRemove}`}
                aria-label={th.tasks.picker.removeChip(label)}
                {...(removeTabIndex !== undefined ? { tabIndex: removeTabIndex } : {})}
                data-chip-remove=""
                onClick={(e) => {
                  if (focusFallback) {
                    const btn = e.currentTarget
                    const all = [
                      ...(btn.closest(`.${styles.meta}`)?.querySelectorAll<HTMLElement>('[data-chip-remove]') ?? []),
                    ]
                    const i = all.indexOf(btn)
                    ;(all[i + 1] ?? all[i - 1] ?? focusFallback())?.focus()
                  }
                  onUnassign(a.assignmentId, label)
                }}
              >
                <CloseOutlined sx={{ fontSize: 14 }} />
              </button>
            ) : null}
          </span>
        )
      })}
    </span>
  )
}
