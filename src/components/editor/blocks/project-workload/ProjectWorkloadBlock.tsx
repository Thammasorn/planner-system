'use client'
// src/components/editor/blocks/project-workload/ProjectWorkloadBlock.tsx — body of the "ภาระทีมโปรเจค" live block
// (FR-1303/1304, AC-1303, M10-D3/D7/D11/D31). Project members × 8 weeks from this week, each cell M9's WorkloadCell
// (text, view tone, BR-40 glyph, accessible label) with M9's tooltip breakdown; masked parts read "งานในโปรเจคอื่น".
// The view is applied on the client (M9-D2): an editable page writes the prop; a read-only viewer switches locally.
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Skeleton from '@mui/material/Skeleton'
import ToggleButton from '@mui/material/ToggleButton'
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup'
import Link from 'next/link'
import { type JSX, useCallback, useState } from 'react'
import { EmptyState } from '@/components/common/EmptyState'
import styles from '@/components/workload/Workload.module.css'
import { WorkloadCell } from '@/components/workload/WorkloadCell'
import { WorkloadTooltipHost, type WorkloadTooltipTarget } from '@/components/workload/WorkloadTooltip'
import { th } from '@/i18n/th'
import type { EmbedWorkloadResponse, WorkloadView } from '@/lib/contracts/embed'
import { formatWeekHeader } from '@/lib/format'
import type { ProjectWorkloadProps } from '@/lib/schemas/page-content'
import { LiveBlockFrame } from '../live/LiveBlockFrame'
import { useEmbedWorkload } from './useEmbedWorkload'

export interface ProjectWorkloadBlockProps {
  /** null: no stored page yet (a new task body) → the placeholder. */
  pageId: string | null
  props: ProjectWorkloadProps
  /** The page editor is editable → the view toggle writes the prop (M10-D7). */
  editable: boolean
  onPropsChange: (next: Partial<ProjectWorkloadProps>) => void
}

const L = th.editor.liveBlocks
const W = L.workload
const VIEWS: readonly WorkloadView[] = ['ALL', 'COMMITTED', 'AT_RISK']

export function ProjectWorkloadBlock(p: ProjectWorkloadBlockProps): JSX.Element {
  if (p.pageId === null) {
    return (
      <LiveBlockFrame title={L.workloadTitle}>
        <EmptyState title={L.wikiOnly} />
      </LiveBlockFrame>
    )
  }
  return <ProjectWorkloadBody {...p} pageId={p.pageId} />
}

function ProjectWorkloadBody(p: ProjectWorkloadBlockProps & { pageId: string }): JSX.Element {
  const q = useEmbedWorkload(p.pageId)
  // read-only viewers can still look at another view without saving it (M10-D31)
  const [localView, setLocalView] = useState<WorkloadView | null>(null)
  const view = p.editable ? p.props.view : (localView ?? p.props.view)
  if (q.isPending) {
    return (
      <LiveBlockFrame title={L.workloadTitle}>
        <Skeleton variant="rounded" height={96} />
        <span role="status">{L.loading}</span>
      </LiveBlockFrame>
    )
  }
  if (q.isError) {
    return (
      <LiveBlockFrame title={L.workloadTitle}>
        <Alert
          severity="error"
          action={
            <Button color="inherit" size="small" onClick={() => void q.refetch()}>
              {L.retry}
            </Button>
          }
        >
          {L.error}
        </Alert>
      </LiveBlockFrame>
    )
  }
  const r = q.data
  if (r.kind === 'wiki') {
    return (
      <LiveBlockFrame title={L.workloadTitle}>
        <EmptyState title={L.wikiOnly} />
      </LiveBlockFrame>
    )
  }
  const actions = (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
      <ToggleButtonGroup
        size="small"
        exclusive
        value={view}
        aria-label={L.view.label}
        onChange={(_e, v: WorkloadView | null) => {
          if (v === null || v === view) return
          if (p.editable) p.onPropsChange({ view: v })
          else setLocalView(v)
        }}
      >
        {VIEWS.map((v) => (
          <ToggleButton key={v} value={v}>
            {W.view[v]}
          </ToggleButton>
        ))}
      </ToggleButtonGroup>
      <Link href={r.workloadHref}>{L.openWorkload}</Link>
    </Box>
  )
  return (
    <LiveBlockFrame title={L.workloadTitle} projectName={r.projectName} actions={actions}>
      <Box sx={{ color: 'text.secondary', fontSize: 'var(--font-sm)', mb: 1 }}>{W.range}</Box>
      {r.archived ? (
        <Alert severity="info" sx={{ mb: 1 }}>
          {L.workloadArchived}
        </Alert>
      ) : null}
      {r.people.length === 0 ? <EmptyState title={W.noMembers} /> : <WorkloadGrid data={r} view={view} />}
    </LiveBlockFrame>
  )
}

type ProjectAnswer = Extract<EmbedWorkloadResponse, { kind: 'project' }>

function WorkloadGrid({ data, view }: { data: ProjectAnswer; view: WorkloadView }): JSX.Element {
  const resolve = useCallback(
    (btn: HTMLElement): WorkloadTooltipTarget | null => {
      const userId = btn.closest<HTMLElement>('tr[data-user-id]')?.dataset.userId
      const week = btn.dataset.week
      const person = data.people.find((x) => x.userId === userId)
      const cell = week ? person?.cells[week] : undefined
      if (!person || !week || !cell) return null
      return { name: person.name, week, cell, projects: data.projects, deactivated: person.deactivated }
    },
    [data],
  )
  return (
    <WorkloadTooltipHost resolve={resolve} className={styles.scroller}>
      <table className={styles.table} aria-label={L.workloadTitle} data-testid="embed-workload-table">
        <thead>
          <tr>
            <th scope="col" className={styles.corner}>
              {W.person}
            </th>
            {data.weeks.map((w) => (
              <th key={w} scope="col" className={styles.weekHeader} data-week={w}>
                {formatWeekHeader(w)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.people.map((person) => (
            <tr key={person.userId} data-user-id={person.userId}>
              <th scope="row" className={styles.personCell}>
                <span className={styles.personInner}>
                  <span>{person.name}</span>
                  {person.deactivated ? <span className={styles.chip}>{th.workload.deactivated}</span> : null}
                </span>
              </th>
              {data.weeks.map((w) => {
                const cell = person.cells[w]
                return (
                  <td key={w} className={styles.cellTd}>
                    {cell ? (
                      <WorkloadCell
                        name={person.name}
                        week={w}
                        cell={cell}
                        view={view}
                        projects={data.projects}
                        deactivated={person.deactivated}
                      />
                    ) : null}
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </WorkloadTooltipHost>
  )
}
