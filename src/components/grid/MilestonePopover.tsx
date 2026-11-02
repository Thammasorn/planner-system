'use client'
// src/components/grid/MilestonePopover.tsx — the ◆ popovers of the plan grid (SPEC FR-702/707/708, §8.9; plan/m08
// S3.4/S3.5, M8-D10/D11). MUI Popover: focus moves in, Esc closes and MUI returns focus to the ◆ / cell / toolbar button.
// - MilestonePopover: heading, "date · status", progress, late hint, ↗ overview link; managers get the shared
//   MilestoneForm (dense; its DateField is the keyboard way to move ◆) + complete / reopen + delete (no confirm: undo
//   toast from useMilestoneMutations); others the read-only text.
// - MilestoneCreatePopover: MilestoneForm pre-filled with the cell's / today's date.
// - MilestoneStackPopover: the "+N" list — every ◆ of one column as a button opening its popover.
import Button from '@mui/material/Button'
import Popover from '@mui/material/Popover'
import type { JSX } from 'react'
import Link from '@/components/Link'
import { MilestoneForm } from '@/components/milestones/MilestoneForm'
import type { MilestonePatch } from '@/components/milestones/useMilestoneMutations'
import type { ISODate } from '@/domain/types'
import { th } from '@/i18n/th'
import type { GridMilestone } from '@/lib/contracts/grid'
import { formatThaiDate } from '@/lib/format'
import { milestoneDisplayName, milestoneLabel } from './MilestoneRow'
import styles from './grid.module.css'

/** Only the fields that differ from the milestone (null when nothing changed). */
export function milestoneFormPatch(
  m: Pick<GridMilestone, 'name' | 'date' | 'description'>,
  v: { name: string; date: ISODate; description: string | null },
): MilestonePatch | null {
  const patch: MilestonePatch = {}
  const name = v.name.trim()
  if (name !== m.name) patch.name = name
  if (v.date !== m.date) patch.date = v.date
  const description = v.description?.trim() ? v.description : null
  if (description !== m.description) patch.description = description
  return Object.keys(patch).length > 0 ? patch : null
}

export interface MilestonePopoverProps {
  milestone: GridMilestone | null
  anchorEl: Element | null
  canManage: boolean
  onUpdate(m: GridMilestone, patch: MilestonePatch): void
  onToggleComplete(m: GridMilestone): void
  onDelete(m: GridMilestone): void
  onClose(): void
  /** M9 (S3.6): the project-name prefix of the heading / accessible name in the person grid */
  projectLabel?: string | null
}

export function MilestonePopover(p: MilestonePopoverProps): JSX.Element {
  const m = p.milestone
  const open = m !== null && p.anchorEl !== null
  return (
    <Popover
      open={open}
      anchorEl={open ? p.anchorEl : null}
      onClose={() => p.onClose()}
      anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
      slotProps={{
        paper: {
          role: 'dialog',
          'aria-label': m ? milestoneLabel(m, p.projectLabel ?? undefined) : th.milestones.label,
          'data-testid': 'ms-popover',
        } as Record<string, unknown>,
      }}
    >
      {m ? <Details key={m.id} {...p} milestone={m} /> : null}
    </Popover>
  )
}

function Details(p: MilestonePopoverProps & { milestone: GridMilestone }): JSX.Element {
  const m = p.milestone
  return (
    <div className={styles.msPopover}>
      <h2 className={styles.msPopoverTitle}>
        <span aria-hidden="true" className={styles.msGlyph}>
          {th.milestones.diamond}
        </span>{' '}
        {milestoneDisplayName(m, p.projectLabel ?? undefined)}
      </h2>
      <div>{th.milestones.dateLine(formatThaiDate(m.date, 'medium'), th.milestones.status[m.status])}</div>
      <div className={styles.muted}>{th.milestones.progress(m.progress.done, m.progress.total)}</div>
      {m.late ? (
        <div className={styles.msLateChip} role="note">
          <span aria-hidden="true">⚠ </span>
          {th.milestones.lateTasks(m.lateTaskCount)} — {th.milestones.lateHint(formatThaiDate(m.date, 'medium'))}
        </div>
      ) : null}
      {p.canManage ? (
        <>
          <MilestoneForm
            dense
            projectId={m.projectId}
            initial={{ name: m.name, date: m.date, description: m.description ?? '' }}
            submitLabel={th.milestones.form.save}
            onSubmit={(v) => {
              const patch = milestoneFormPatch(m, v)
              if (patch) p.onUpdate(m, patch)
              p.onClose()
            }}
            onCancel={() => p.onClose()}
          />
          <div className={styles.msPopoverActions}>
            <Button
              size="small"
              variant="outlined"
              data-testid="ms-toggle-complete"
              onClick={() => {
                p.onToggleComplete(m)
                p.onClose()
              }}
            >
              {m.completedOn ? th.milestones.form.reopen : th.milestones.form.complete}
            </Button>
            <Button
              size="small"
              color="error"
              data-testid="ms-delete"
              onClick={() => {
                p.onClose()
                p.onDelete(m)
              }}
            >
              {th.milestones.form.delete}
            </Button>
          </div>
        </>
      ) : (
        <div className={styles.muted} data-testid="ms-read-only">
          {th.milestones.grid.readOnly}
        </div>
      )}
      <Link href={`/projects/${m.projectId}/overview`} prefetch={false} className={styles.openPage}>
        {th.milestones.form.openOverview}
      </Link>
    </div>
  )
}

export interface MilestoneCreatePopoverProps {
  /** null = closed */
  at: { anchor: Element; date: ISODate } | null
  projectId: string
  onCreate(v: { name: string; date: ISODate; description: string | null }): void
  onClose(): void
}

export function MilestoneCreatePopover(p: MilestoneCreatePopoverProps): JSX.Element {
  const open = p.at !== null
  return (
    <Popover
      open={open}
      anchorEl={p.at?.anchor ?? null}
      onClose={() => p.onClose()}
      anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
      slotProps={{
        paper: {
          role: 'dialog',
          'aria-label': th.milestones.form.createTitle,
          'data-testid': 'ms-create-popover',
        } as Record<string, unknown>,
      }}
    >
      {p.at ? (
        <div className={styles.msPopover} key={p.at.date}>
          <h2 className={styles.msPopoverTitle}>{th.milestones.form.createTitle}</h2>
          <MilestoneForm
            dense
            projectId={p.projectId}
            initial={{ name: '', date: p.at.date, description: '' }}
            submitLabel={th.milestones.form.create}
            onSubmit={(v) => {
              p.onCreate({ name: v.name, date: v.date, description: v.description })
              p.onClose()
            }}
            onCancel={() => p.onClose()}
          />
        </div>
      ) : null}
    </Popover>
  )
}

export interface MilestoneStackPopoverProps {
  at: { list: readonly GridMilestone[]; anchor: Element } | null
  onPick(m: GridMilestone, anchor: Element): void
  onClose(): void
}

export function MilestoneStackPopover(p: MilestoneStackPopoverProps): JSX.Element {
  const open = p.at !== null
  return (
    <Popover
      open={open}
      anchorEl={p.at?.anchor ?? null}
      onClose={() => p.onClose()}
      anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
      slotProps={{
        paper: {
          role: 'dialog',
          'aria-label': th.milestones.heading,
          'data-testid': 'ms-stack-popover',
        } as Record<string, unknown>,
      }}
    >
      <ul className={styles.msStackList}>
        {(p.at?.list ?? []).map((m) => (
          <li key={m.id}>
            <button
              type="button"
              className={styles.msDiamond}
              aria-label={milestoneLabel(m)}
              data-status={m.status}
              data-late={m.late ? 'true' : 'false'}
              data-testid={`ms-stack-${m.id}`}
              onClick={() => {
                const anchor = p.at?.anchor
                p.onClose()
                if (anchor) p.onPick(m, anchor)
              }}
            >
              <span aria-hidden="true" className={styles.msGlyph}>
                {th.milestones.diamond}
              </span>
              <span aria-hidden="true" className={styles.msName}>
                {m.name} · {formatThaiDate(m.date, 'medium')}
              </span>
              {m.late ? <span aria-hidden="true">⚠</span> : null}
            </button>
          </li>
        ))}
      </ul>
    </Popover>
  )
}
