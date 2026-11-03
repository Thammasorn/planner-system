import { screen, within } from '@testing-library/react'
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
  expect(onSubmit).toHaveBeenCalledWith({
    name: 'Beta',
    date: '2026-11-13',
    description: null,
    color: 'PURPLE',
  })
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
    color: 'PURPLE',
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

it('M11.1 FR-709: a colour radio group — five options named in Thai with a swatch; PURPLE checked by default', () => {
  renderTasks(
    <MilestoneForm
      initial={{ ...empty, date: '2026-11-13' }}
      submitLabel={th.milestones.form.create}
      onSubmit={vi.fn()}
      onCancel={vi.fn()}
    />,
  )
  const group = screen.getByRole('radiogroup', { name: th.milestones.color.label })
  const radios = within(group).getAllByRole('radio')
  expect(radios.map((r) => r.getAttribute('aria-label') ?? r.closest('label')?.textContent)).toEqual(
    (['PURPLE', 'RED', 'YELLOW', 'GREEN', 'BLUE'] as const).map((c) => th.milestones.color.name[c]),
  )
  expect(within(group).getByRole('radio', { name: th.milestones.color.name.PURPLE })).toBeChecked()
  for (const c of ['PURPLE', 'RED', 'YELLOW', 'GREEN', 'BLUE'])
    expect(group.querySelector(`[data-swatch="${c}"]`)).toBeInTheDocument()
})

it('M11.1 FR-709: choosing แดง submits color RED; the initial colour is preselected; keyboard arrows move the choice', async () => {
  const user = userEvent.setup()
  const onSubmit = vi.fn()
  renderTasks(
    <MilestoneForm
      initial={{ name: 'UAT sign-off', date: '2026-10-23', description: '', color: 'GREEN' }}
      submitLabel={th.milestones.form.save}
      onSubmit={onSubmit}
      onCancel={vi.fn()}
    />,
  )
  expect(screen.getByRole('radio', { name: th.milestones.color.name.GREEN })).toBeChecked()
  await user.click(screen.getByRole('radio', { name: th.milestones.color.name.RED }))
  expect(screen.getByRole('radio', { name: th.milestones.color.name.RED })).toBeChecked()
  await user.keyboard('{ArrowRight}')
  expect(screen.getByRole('radio', { name: th.milestones.color.name.YELLOW })).toBeChecked()
  await user.click(screen.getByRole('button', { name: th.milestones.form.save }))
  expect(onSubmit).toHaveBeenCalledWith({
    name: 'UAT sign-off',
    date: '2026-10-23',
    description: null,
    color: 'YELLOW',
  })
})

it('M11.1: read-only shows the colour by name', () => {
  renderTasks(
    <MilestoneForm
      readOnly
      initial={{ name: 'UAT sign-off', date: '2026-10-23', description: '', color: 'RED' }}
      submitLabel={th.milestones.form.save}
      onSubmit={vi.fn()}
      onCancel={vi.fn()}
    />,
  )
  expect(screen.getByText(th.milestones.color.named(th.milestones.color.name.RED))).toBeInTheDocument()
})
