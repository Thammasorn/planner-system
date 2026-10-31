// FR-504 cover image — focus never falls to <body> when "ลบรูปปก" removes itself (SPEC §8.9, M1 fix-r1 rule).
import { useState } from 'react'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { th } from '@/i18n/th'
import type { PageDTO } from '@/lib/contracts/pages'
import { DEFAULT_UPLOAD_LIMITS } from '@/lib/files/upload-rules'
import { CoverImage } from './CoverImage'
import { okResult, renderPages, uuid } from './render.test.helper'

const actions = vi.hoisted(() => ({ setPageCover: vi.fn() }))
vi.mock('@/server/actions/pages', () => actions)

const PAGE = uuid(50)
const FILE = uuid(51)
const COVER: PageDTO['cover'] = { fileId: FILE, url: `/api/files/${FILE}` }

function Harness() {
  const [cover, setCover] = useState<PageDTO['cover']>(COVER)
  return (
    <CoverImage
      pageId={PAGE}
      cover={cover}
      canEdit
      uploadLimits={DEFAULT_UPLOAD_LIMITS}
      onChange={setCover}
    />
  )
}

beforeEach(() => {
  actions.setPageCover.mockReset()
})

describe('CoverImage focus (§8.9)', () => {
  it('ลบรูปปก → the cover is gone at once and focus moves to เพิ่มรูปปก', async () => {
    actions.setPageCover.mockReturnValue(okResult({ cover: null }))
    renderPages(<Harness />)
    await userEvent.click(screen.getByRole('button', { name: th.pages.cover.remove }))
    const add = screen.getByRole('button', { name: th.pages.cover.add })
    expect(add).toHaveFocus()
    expect(screen.queryByRole('img', { name: th.pages.cover.alt })).toBeNull()
    await waitFor(() => expect(actions.setPageCover).toHaveBeenCalledWith({ pageId: PAGE, fileId: null }))
    expect(add).toHaveFocus()
  })

  it('a failed remove rolls back the cover and puts focus back on ลบรูปปก', async () => {
    actions.setPageCover.mockReturnValue(
      Promise.resolve({ ok: false, code: 'INTERNAL', message: th.errors.INTERNAL }),
    )
    renderPages(<Harness />)
    await userEvent.click(screen.getByRole('button', { name: th.pages.cover.remove }))
    expect(await screen.findByText(th.errors.INTERNAL)).toBeInTheDocument()
    expect(screen.getByRole('img', { name: th.pages.cover.alt })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: th.pages.cover.remove })).toHaveFocus()
    expect(document.activeElement).not.toBe(document.body)
  })
})
