// FR-661 card + M6.1 (FR-685 ↗ = page, card click = panel; FR-691 📄).
import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { th } from '@/i18n/th'
import type { TaskCard as TaskCardDTO } from '@/lib/contracts/tasks'
import { PID, STATUSES, T } from '../fixtures.test.data'
import { renderTasks } from '../render.test.helper'
import { TaskCard } from './TaskCard'

vi.mock('@/lib/api', () => ({ getJson: vi.fn(() => new Promise(() => {})) }))

const card = (over: Partial<TaskCardDTO> = {}): TaskCardDTO => ({
  id: T.c,
  projectId: PID,
  name: 'งาน C',
  parentPath: [],
  status: STATUSES[0]!,
  assigneeIds: [],
  dueDate: null,
  certainty: 'CONFIRMED',
  completed: false,
  blockers: { open: 0, total: 0 },
  hasBody: false,
  milestoneId: null,
  ...over,
})

function setup(c: TaskCardDTO = card()) {
  const onOpen = vi.fn()
  renderTasks(
    <TaskCard
      card={c}
      statuses={STATUSES}
      canEdit
      onOpen={onOpen}
      onPickStatus={vi.fn()}
      onToggleDone={vi.fn()}
    />,
  )
  return { onOpen, article: screen.getByRole('article', { name: c.name }) }
}

describe('TaskCard (M6.1-D17)', () => {
  it('a click on the card opens the panel (onOpen)', async () => {
    const { onOpen, article } = setup()
    await userEvent.click(article)
    expect(onOpen).toHaveBeenCalledWith(T.c)
  })

  it('↗ is a link to /t/<id> that does not trigger onOpen', async () => {
    const { onOpen, article } = setup()
    const link = within(article).getByRole('link', { name: th.tasks.openAsPage })
    expect(link).toHaveAttribute('href', `/t/${T.c}`)
    expect(link).toHaveAttribute('tabindex', '-1') // the card is the only tab stop (M3-D35)
    link.addEventListener('click', (e) => e.preventDefault())
    await userEvent.click(link)
    expect(onOpen).not.toHaveBeenCalled()
  })

  it('📄 only when the body is not blank (FR-691)', () => {
    const { article } = setup(card({ hasBody: true }))
    expect(within(article).getByRole('img', { name: th.tasks.hasBody })).toBeInTheDocument()
  })

  it('no 📄 without a body', () => {
    const { article } = setup()
    expect(within(article).queryByRole('img', { name: th.tasks.hasBody })).toBeNull()
  })
})
