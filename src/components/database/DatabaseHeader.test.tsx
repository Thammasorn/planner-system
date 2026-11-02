// FR-1404/1405 (plan/m11 S3.2): the database title — placeholder, caret after insert, Enter saves, Esc reverts.
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { th } from '@/i18n/th'
import { markDatabaseJustCreated } from '@/lib/editor/database-block-state'
import { DatabaseHeader } from './DatabaseHeader'
import { callsOf, makeApi } from './fixtures.test.helper'
import { renderDb } from './render.test.helper'

vi.mock('@/server/actions/databases', () => ({}))

describe('DatabaseHeader', () => {
  it('shows the placeholder and takes the caret when this tab just inserted the block', () => {
    markDatabaseJustCreated('b-new')
    renderDb(<DatabaseHeader blockId="b-new" titleId="t" />, { api: makeApi({ title: '' }) })
    const input = screen.getByRole('textbox', { name: th.database.titleLabel })
    expect(input).toHaveAttribute('placeholder', th.database.titlePlaceholder)
    expect(input).toHaveFocus()
  })

  it('Enter saves the trimmed title once; Esc reverts without saving', async () => {
    const api = makeApi({ title: '' })
    renderDb(<DatabaseHeader blockId="b1" titleId="t" />, { api })
    const input = screen.getByRole('textbox', { name: th.database.titleLabel })
    expect(input).not.toHaveFocus()
    await userEvent.type(input, '  ทะเบียนความเสี่ยง {Enter}')
    expect(callsOf(api, 'renameDatabase')).toEqual([['ทะเบียนความเสี่ยง']])
    await userEvent.type(input, ' เพิ่ม{Escape}')
    expect(input).toHaveValue('ทะเบียนความเสี่ยง')
    expect(callsOf(api, 'renameDatabase')).toHaveLength(1)
  })

  it('read-only viewers see the text (untitled placeholder text when empty)', () => {
    renderDb(<DatabaseHeader blockId="b1" titleId="t" />, { api: makeApi({ title: '' }, { canEdit: false }) })
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { name: th.database.untitled })).toBeInTheDocument()
  })
})
