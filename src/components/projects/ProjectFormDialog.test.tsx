import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { th } from '@/i18n/th'
import type { ProjectHeader } from '@/lib/contracts/projects'
import { renderWithProviders } from '../../../tests/helpers/render'
import { ProjectFormDialog } from './ProjectFormDialog'

const PID = '6f1c2b8e-3d4a-4b5c-9d6e-7f8a9b0c1d2e'
const CORAL = 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d'

const mocks = vi.hoisted(() => ({
  createProject: vi.fn(),
  updateProject: vi.fn(),
  push: vi.fn(),
  getJson: vi.fn(),
}))
vi.mock('@/server/actions/projects', () => ({
  createProject: mocks.createProject,
  updateProject: mocks.updateProject,
}))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: mocks.push, replace: vi.fn() }) }))
vi.mock('@/lib/api', () => ({ getJson: mocks.getJson }))

beforeEach(() => {
  mocks.getJson.mockImplementation((url: string) =>
    Promise.resolve(
      url.startsWith('/api/clients/options')
        ? { clients: [{ id: CORAL, name: 'Coral', code: 'C7', color: null, archived: false }] }
        : {
            people: [
              {
                id: 'ivy',
                name: 'Ivy Icarus',
                nickname: 'Ivy',
                positionName: 'QA',
                color: null,
                active: true,
              },
            ],
          },
    ),
  )
})

function header(over: Partial<ProjectHeader> = {}): ProjectHeader {
  return {
    id: PID,
    name: 'POS Upgrade',
    code: null,
    color: '#2F5597',
    certainty: 'CONFIRMED',
    certaintyNote: null,
    archived: false,
    client: { id: CORAL, name: 'Coral', code: 'C7', color: null, archived: false },
    myRole: 'LEAD',
    can: { manage: true, unarchive: false, delete: false },
    ...over,
  }
}

describe('ProjectFormDialog — create', () => {
  it('requires only the name (P1): empty name shows the error and does not call the action', async () => {
    const user = userEvent.setup()
    renderWithProviders(<ProjectFormDialog open mode="create" onClose={vi.fn()} />)
    expect(screen.getByRole('dialog', { name: th.projects.createTitle })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: th.projects.save }))
    expect(await screen.findByText(th.projects.errors.nameRequired)).toBeInTheDocument()
    expect(mocks.createProject).not.toHaveBeenCalled()
  })

  it('submits the defaults and navigates to the new overview', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    mocks.createProject.mockResolvedValue({ ok: true, projectId: PID })
    renderWithProviders(<ProjectFormDialog open mode="create" onClose={onClose} />)
    await user.type(screen.getByRole('textbox', { name: th.projects.fields.name }), 'X')
    await user.click(screen.getByRole('button', { name: th.projects.save }))
    await waitFor(() => expect(mocks.push).toHaveBeenCalledWith(`/projects/${PID}/overview`))
    expect(mocks.createProject).toHaveBeenCalledWith({
      name: 'X',
      certainty: 'CONFIRMED',
      color: '#2F5597',
      clientId: null,
      leadUserId: null,
    })
    expect(onClose).toHaveBeenCalled()
  })

  it('shows the certainty note only for TENTATIVE and sends client, note and LEAD', async () => {
    const user = userEvent.setup()
    mocks.createProject.mockResolvedValue({ ok: true, projectId: PID })
    renderWithProviders(<ProjectFormDialog open mode="create" onClose={vi.fn()} />)
    expect(screen.queryByRole('textbox', { name: th.projects.fields.certaintyNote })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: th.projects.certainty.TENTATIVE }))
    const note = screen.getByRole('textbox', { name: th.projects.fields.certaintyNote })
    await user.type(note, 'รอ PO')
    await user.type(screen.getByRole('textbox', { name: th.projects.fields.name }), 'Room booking')
    await user.click(screen.getByRole('combobox', { name: th.projects.fields.client }))
    await user.click(await screen.findByRole('option', { name: 'Coral (C7)' }))
    await user.type(screen.getByRole('combobox', { name: th.projects.fields.lead }), 'Ivy')
    await user.click(await screen.findByRole('option', { name: /Ivy/ }))
    await user.click(screen.getByRole('button', { name: th.projects.save }))
    await waitFor(() =>
      expect(mocks.createProject).toHaveBeenCalledWith({
        name: 'Room booking',
        certainty: 'TENTATIVE',
        certaintyNote: 'รอ PO',
        color: '#2F5597',
        clientId: CORAL,
        leadUserId: 'ivy',
      }),
    )
    await user.click(screen.getByRole('button', { name: th.projects.certainty.CONFIRMED }))
    expect(screen.queryByRole('textbox', { name: th.projects.fields.certaintyNote })).not.toBeInTheDocument()
  })

  it('maps server field errors back onto the fields', async () => {
    const user = userEvent.setup()
    mocks.createProject.mockResolvedValue({
      ok: false,
      code: 'VALIDATION',
      message: th.errors.VALIDATION,
      fieldErrors: { name: [th.projects.errors.nameTooLong] },
    })
    renderWithProviders(<ProjectFormDialog open mode="create" onClose={vi.fn()} />)
    await user.type(screen.getByRole('textbox', { name: th.projects.fields.name }), 'Y')
    await user.click(screen.getByRole('button', { name: th.projects.save }))
    expect(await screen.findByText(th.projects.errors.nameTooLong)).toBeInTheDocument()
    expect(mocks.push).not.toHaveBeenCalled()
  })

  it('a failed save with field errors focuses the invalid field so Esc closes at once (KEY-03)', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    mocks.createProject.mockResolvedValue({
      ok: false,
      code: 'VALIDATION',
      message: th.errors.VALIDATION,
      fieldErrors: { leadUserId: [th.projects.errors.leadInactive] },
    })
    renderWithProviders(<ProjectFormDialog open mode="create" onClose={onClose} />)
    await user.type(screen.getByRole('textbox', { name: th.projects.fields.name }), 'Y')
    await user.click(screen.getByRole('button', { name: th.projects.save }))
    expect(await screen.findByText(th.projects.errors.leadInactive)).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: th.projects.fields.lead })).toHaveFocus()
    await user.keyboard('{Escape}')
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('a failed save with only a toast focuses the name field so Esc closes at once (KEY-03)', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    mocks.createProject.mockResolvedValue({ ok: false, code: 'INTERNAL', message: th.errors.INTERNAL })
    renderWithProviders(<ProjectFormDialog open mode="create" onClose={onClose} />)
    const name = screen.getByRole('textbox', { name: th.projects.fields.name })
    await user.type(name, 'Y')
    await user.click(screen.getByRole('button', { name: th.projects.save }))
    await waitFor(() => expect(name).toHaveFocus())
    expect(document.activeElement).not.toBe(document.body)
    await user.keyboard('{Escape}')
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('the LEAD picker shows a load error with retry instead of "ไม่พบพนักงาน" (P4)', async () => {
    mocks.getJson.mockImplementation((url: string) =>
      url.startsWith('/api/people/options')
        ? Promise.reject(new Error('network'))
        : Promise.resolve({ clients: [] }),
    )
    renderWithProviders(<ProjectFormDialog open mode="create" onClose={vi.fn()} />)
    expect(await screen.findByText(th.members.pickerLoadError)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: th.common.retry })).toBeInTheDocument()
  })

  it('the client picker shows a load error with retry instead of "no options" (P4)', async () => {
    const user = userEvent.setup()
    let clientsOk = false
    mocks.getJson.mockImplementation((url: string) =>
      url.startsWith('/api/clients/options')
        ? clientsOk
          ? Promise.resolve({ clients: [{ id: CORAL, name: 'Coral', code: 'C7', color: null, archived: false }] })
          : Promise.reject(new Error('network'))
        : Promise.resolve({ people: [] }),
    )
    renderWithProviders(<ProjectFormDialog open mode="create" onClose={vi.fn()} />)
    // helper text under the field, with a retry button
    expect(await screen.findByText(th.projects.errors.clientOptionsLoadError)).toBeInTheDocument()
    // the open listbox says the load failed — not MUI's default "ไม่มีตัวเลือก"
    await user.click(screen.getByRole('combobox', { name: th.projects.fields.client }))
    expect(await screen.findAllByText(th.projects.errors.clientOptionsLoadError)).toHaveLength(2)
    await user.keyboard('{Escape}')
    clientsOk = true
    await user.click(screen.getByRole('button', { name: th.common.retry }))
    await waitFor(() =>
      expect(screen.queryByText(th.projects.errors.clientOptionsLoadError)).not.toBeInTheDocument(),
    )
    await user.click(screen.getByRole('combobox', { name: th.projects.fields.client }))
    expect(await screen.findByRole('option', { name: 'Coral (C7)' })).toBeInTheDocument()
  })
})

describe('ProjectFormDialog — edit', () => {
  it('sends only the changed fields and has no LEAD picker', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    mocks.updateProject.mockResolvedValue({ ok: true, certaintyChanged: false })
    renderWithProviders(<ProjectFormDialog open mode="edit" project={header()} onClose={onClose} />)
    expect(screen.getByRole('dialog', { name: th.projects.editTitle })).toBeInTheDocument()
    expect(screen.queryByRole('combobox', { name: th.projects.fields.lead })).not.toBeInTheDocument()
    const name = screen.getByRole('textbox', { name: th.projects.fields.name })
    expect(name).toHaveValue('POS Upgrade')
    expect(screen.getByRole('combobox', { name: th.projects.fields.client })).toHaveValue('Coral (C7)')
    await user.type(screen.getByRole('textbox', { name: th.projects.fields.code }), 'POS')
    await user.click(screen.getByRole('button', { name: th.projects.save }))
    await waitFor(() => expect(onClose).toHaveBeenCalled())
    expect(mocks.updateProject).toHaveBeenCalledWith({ projectId: PID, code: 'POS' })
    expect(mocks.getJson).toHaveBeenCalledWith(`/api/clients/options?projectId=${PID}`, expect.anything())
  })

  it('closes without calling the action when nothing changed', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    renderWithProviders(<ProjectFormDialog open mode="edit" project={header()} onClose={onClose} />)
    await user.click(screen.getByRole('button', { name: th.projects.save }))
    expect(onClose).toHaveBeenCalled()
    expect(mocks.updateProject).not.toHaveBeenCalled()
  })
})
