'use client'
// One task as a bar-like button (calendar bar, "+N" popover row, agenda row, no-date row): ◐ / ◂ / text / จากแผน /
// 📄 / ⛔ / ▸ and ↗ (OpenAsPage, FR-685). Enter / click = panel; Shift+Space = the task page (SPEC §8.13, FR-811).
// v3.6 (BR-103a): a bar with a side from the plan has `data-from-plan` (hatched fill + dashed edge) and the visible
// "จากแผน" tag; tooltip / accessible name say which side and the range — never colour alone.
import type { CSSProperties, KeyboardEvent } from 'react'
import { OpenAsPageLink } from '@/components/tasks/OpenAsPage'
import { th } from '@/i18n/th'
import { HOTKEYS, matchesHotkey } from '@/lib/keys'
import { barSpan } from '@/lib/plan-calendar/bars'
import { barLabel, barText, barTitle, type BarInfo } from './labels'
import styles from './PlanCalendar.module.css'

export interface TaskBarProps {
  info: BarInfo
  className: string | undefined
  style?: CSSProperties
  cutLeft?: boolean
  cutRight?: boolean
  tabIndex: number
  onOpen: (taskId: string) => void
  onOpenPage: (taskId: string) => void
  /** ↗ is focusable (lists) or only for pointers (bars inside the roving grid: Shift+Space instead) */
  linkTabIndex?: number
}

export function TaskBar(p: TaskBarProps) {
  const t = p.info.task
  const tentative = p.info.certainty === 'TENTATIVE'
  const span = barSpan(t)
  const fromPlan = span !== null && (span.startFromPlan || span.endFromPlan)
  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (!matchesHotkey(e.nativeEvent, HOTKEYS.openPage)) return
    e.preventDefault()
    e.stopPropagation()
    p.onOpenPage(t.id)
  }
  return (
    <div
      className={p.className}
      style={p.style}
      data-open-host=""
      data-task-bar={t.id}
      data-tentative={tentative ? true : undefined}
      data-from-plan={fromPlan ? true : undefined}
      data-done={t.completedOn !== null ? true : undefined}
      data-cut-left={p.cutLeft ? true : undefined}
      data-cut-right={p.cutRight ? true : undefined}
    >
      <button
        type="button"
        className={styles.barButton}
        tabIndex={p.tabIndex}
        aria-label={barLabel(p.info, { left: p.cutLeft === true, right: p.cutRight === true })}
        title={barTitle(p.info)}
        onClick={(e) => {
          e.stopPropagation()
          p.onOpen(t.id)
        }}
        onKeyDown={onKeyDown}
        // Space activates a button on keyup: swallow it after Shift+Space so the panel does not open as well.
        onKeyUp={(e) => {
          if (e.shiftKey && e.code === 'Space') e.preventDefault()
        }}
      >
        {p.cutLeft ? (
          <span aria-hidden="true" className={styles.barGlyph}>
            ◂
          </span>
        ) : null}
        {tentative ? (
          <span aria-hidden="true" className={styles.barGlyph}>
            {th.projects.tentativeGlyph}
          </span>
        ) : null}
        <span className={styles.barText}>{barText(p.info)}</span>
        {fromPlan ? (
          <span aria-hidden="true" className={styles.fromPlanTag} data-testid="from-plan-tag">
            {th.planCalendar.fromPlanTag}
          </span>
        ) : null}
        {t.hasBody ? (
          <span aria-hidden="true" className={styles.barGlyph}>
            📄
          </span>
        ) : null}
        {t.blockers.open > 0 ? (
          <span aria-hidden="true" className={styles.barGlyph}>
            ⛔
          </span>
        ) : null}
        {p.cutRight ? (
          <span aria-hidden="true" className={styles.barGlyph}>
            ▸
          </span>
        ) : null}
      </button>
      <OpenAsPageLink taskId={t.id} tabIndex={p.linkTabIndex ?? -1} />
    </div>
  )
}
