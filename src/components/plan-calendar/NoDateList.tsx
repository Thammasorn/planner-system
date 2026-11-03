'use client'
// "ไม่มีวันที่ (N)" (FR-812, BR-103/103a): tasks with neither date nor planned load — parents too — in task order; click = panel (to set a
// date there), ↗ = the task page. Beside the calendar, under it below 900 px and under the phone agenda.
import { OpenAsPageLink } from '@/components/tasks/OpenAsPage'
import { th } from '@/i18n/th'
import { barLabel, barText, type BarInfo, type BarTask } from './labels'
import styles from './PlanCalendar.module.css'

export function NoDateList({
  tasks,
  infos,
  onOpen,
}: {
  tasks: readonly BarTask[]
  infos: ReadonlyMap<string, BarInfo>
  onOpen: (taskId: string) => void
}) {
  return (
    <section className={styles.side} aria-label={th.planCalendar.noDatesLabel} data-testid="plan-no-dates">
      <h2 className={styles.sideHeading}>{th.planCalendar.noDates(tasks.length)}</h2>
      {tasks.length === 0 ? (
        <p className={styles.sideHint}>{th.planCalendar.noDatesNone}</p>
      ) : (
        <>
          <p className={styles.sideHint}>{th.planCalendar.noDatesHint}</p>
          <ul className={styles.list}>
            {tasks.map((t) => {
              const info = infos.get(t.id)
              if (!info) return null
              return (
                <li
                  key={t.id}
                  className={styles.listItem}
                  data-open-host=""
                  data-done={t.completedOn !== null ? true : undefined}
                >
                  <button
                    type="button"
                    className={styles.listButton}
                    aria-label={barLabel(info)}
                    title={barText(info)}
                    onClick={() => onOpen(t.id)}
                  >
                    {t.name}
                  </button>
                  <OpenAsPageLink taskId={t.id} />
                </li>
              )
            })}
          </ul>
        </>
      )}
    </section>
  )
}
