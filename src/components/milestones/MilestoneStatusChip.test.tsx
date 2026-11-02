import { screen } from '@testing-library/react'
import { expect, it } from 'vitest'
import { renderTasks } from '@/components/tasks/render.test.helper'
import type { MilestoneStatus } from '@/domain/types'
import { th } from '@/i18n/th'
import { MilestoneLateBadge, MilestoneStatusChip } from './MilestoneStatusChip'

const STATUSES: MilestoneStatus[] = ['DONE', 'OVERDUE', 'DUE_SOON', 'UPCOMING']

it.each(STATUSES)('BR-70 %s renders its Thai text with an icon (never colour alone)', (status) => {
  const { container } = renderTasks(<MilestoneStatusChip status={status} />)
  expect(screen.getByText(th.milestones.status[status])).toBeInTheDocument()
  expect(container.querySelector('svg')).not.toBeNull()
})

it('BR-71 late badge: text, count variant', () => {
  renderTasks(
    <>
      <MilestoneLateBadge />
      <MilestoneLateBadge count={2} hint="x" />
    </>,
  )
  expect(screen.getByText(th.milestones.late)).toBeInTheDocument()
  expect(screen.getByText(th.milestones.lateTasks(2))).toBeInTheDocument()
})
