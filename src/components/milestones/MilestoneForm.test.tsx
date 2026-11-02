import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, it, vi } from 'vitest'
import { renderTasks } from '@/components/tasks/render.test.helper'
import { th } from '@/i18n/th'
import { MilestoneForm } from './MilestoneForm'

const empty = { name: '', date: null, description: '' }

it('FR-701: an empty name shows nameRequired and does not submit', async () => {
  const user = userEvent.setup()
  const onSubmit = vi.fn()
  renderTasks(
    <MilestoneForm
      initial={{ ...empty, date: '2026-11-13' }}
      submitLabel={th.milestones.form.create}
      onSubmit={onSubmit}
      onCancel={vi.fn()}
    />,
  )
  await user.click(screen.getByRole('button', { name: th.milestones.form.create }))
  expect(await screen.findByText(th.milestones.errors.nameRequired)).toBeInTheDocument()
  expect(onSubmit).not.toHaveBeenCalled()
})

it('FR-701: a missing date shows dateRequired', async () => {
  const user = userEvent.setup()
  const onSubmit = vi.fn()
  renderTasks(
    <MilestoneForm
      initial={empty}
      submitLabel={th.milestones.form.create}
      onSubmit={onSubmit}
      onCancel={vi.fn()}
    />,
  )
  await user.type(screen.getByRole('textbox', { name: th.milestones.fields.name }), 'Beta')
  await user.click(screen.getByRole('button', { name: th.milestones.form.create }))
  expect(await screen.findByText(th.milestones.errors.dateRequired)).toBeInTheDocument()
  expect(onSubmit).not.toHaveBeenCalled()
})

it('Enter in the name submits the trimmed values (blank description → null)', async () => {
  const user = userEvent.setup()
  const onSubmit = vi.fn()
  renderTasks(
    <MilestoneForm
      initial={{ ...empty, date: '2026-11-13' }}
      submitLabel={th.milestones.form.create}
      onSubmit={onSubmit}
      onCancel={vi.fn()}
    />,
  )
  const name = screen.getByRole('textbox', { name: th.milestones.fields.name })
  expect(name).toHaveFocus()
  await user.type(name, '  Beta {Enter}')
  expect(onSubmit).toHaveBeenCalledWith({ name: 'Beta', date: '2026-11-13', description: null })
})

it('Esc cancels', async () => {
  const user = userEvent.setup()
  const onCancel = vi.fn()
  renderTasks(
    <MilestoneForm
      initial={empty}
      submitLabel={th.milestones.form.create}
      onSubmit={vi.fn()}
      onCancel={onCancel}
    />,
  )
  await user.keyboard('{Escape}')
  expect(onCancel).toHaveBeenCalledTimes(1)
})

it('with projects: the project is required and sent; dense hides the description', async () => {
  const user = userEvent.setup()
  const onSubmit = vi.fn()
  const projects = [
    { id: '6f1c2b8e-3d4a-4b5c-9d6e-7f8a9b0c1d2e', name: 'POS Upgrade' },
    { id: '7f1c2b8e-3d4a-4b5c-9d6e-7f8a9b0c1d2e', name: 'CRM' },
  ]
  renderTasks(
    <MilestoneForm
      dense
      projects={projects}
      initial={{ name: 'Beta', date: '2026-11-13', description: '' }}
      submitLabel={th.milestones.form.create}
      onSubmit={onSubmit}
      onCancel={vi.fn()}
    />,
  )
  expect(screen.queryByRole('textbox', { name: th.milestones.fields.description })).not.toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: th.milestones.form.create }))
  expect(await screen.findByText(th.milestones.form.projectRequired)).toBeInTheDocument()
  await user.click(screen.getByRole('combobox', { name: th.milestones.fields.project }))
  await user.click(await screen.findByRole('option', { name: 'CRM' }))
  await user.click(screen.getByRole('button', { name: th.milestones.form.create }))
  expect(onSubmit).toHaveBeenCalledWith({
    projectId: projects[1]!.id,
    name: 'Beta',
    date: '2026-11-13',
    description: null,
  })
})

it('readOnly renders text only', () => {
  renderTasks(
    <MilestoneForm
      readOnly
      initial={{ name: 'Beta', date: '2026-11-13', description: 'รอบทดสอบ' }}
      submitLabel={th.milestones.form.save}
      onSubmit={vi.fn()}
      onCancel={vi.fn()}
    />,
  )
  expect(screen.getByText('Beta')).toBeInTheDocument()
  expect(screen.getByText('รอบทดสอบ')).toBeInTheDocument()
  expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
  expect(screen.queryByRole('button')).not.toBeInTheDocument()
})
