// S2.3 — sub-page card states (FR-528, M4-D14/D20/D32): live title, deleted, no access, creating; link only when ok.
import { fireEvent, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { th } from '@/i18n/th'
import type { PageTitlesResponse } from '@/lib/contracts/pages'
import { qk } from '@/lib/query-keys'
import { SubpageCard } from './blocks/subpage'
import { makeTestQueryClient, renderWithClient } from './render.test.helper'

const push = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }))

const ID = '0c4d6a0e-7f3b-4c2a-9d1e-5b6a7c8d9e01'

function seeded(res: PageTitlesResponse) {
  const qc = makeTestQueryClient()
  qc.setQueryData(qk.pageTitles([ID]), res)
  return qc
}

describe('SubpageCard', () => {
  beforeEach(() => push.mockClear())

  it('ok → icon + live title, link to /p/<id>, click navigates in-app', () => {
    renderWithClient(
      <SubpageCard pageId={ID} />,
      seeded({ items: [{ id: ID, visible: true, deleted: false, title: 'ข้อกำหนด', icon: '📘' }] }),
    )
    const card = screen.getByTestId('subpage-card')
    expect(card).toHaveTextContent('📘')
    expect(card).toHaveTextContent('ข้อกำหนด')
    expect(card).toHaveAttribute('href', `/p/${ID}`)
    expect(card).toHaveAttribute('contenteditable', 'false')
    fireEvent.click(card)
    expect(push).toHaveBeenCalledWith(`/p/${ID}`)
  })

  it('ok with an empty title → untitled, default icon', () => {
    renderWithClient(
      <SubpageCard pageId={ID} />,
      seeded({ items: [{ id: ID, visible: true, deleted: false, title: '', icon: null }] }),
    )
    const card = screen.getByTestId('subpage-card')
    expect(card).toHaveTextContent(th.editor.subpage.untitled)
    expect(card).toHaveTextContent('📄')
  })

  it('deleted → text state, no link', () => {
    renderWithClient(
      <SubpageCard pageId={ID} />,
      seeded({ items: [{ id: ID, visible: true, deleted: true }] }),
    )
    const card = screen.getByTestId('subpage-card')
    expect(card).toHaveTextContent(th.editor.subpage.deleted)
    expect(card).not.toHaveAttribute('href')
    fireEvent.click(card)
    expect(push).not.toHaveBeenCalled()
  })

  it('not visible → no-access text, no title, no link', () => {
    renderWithClient(<SubpageCard pageId={ID} />, seeded({ items: [{ id: ID, visible: false }] }))
    const card = screen.getByTestId('subpage-card')
    expect(card).toHaveTextContent(th.editor.subpage.noAccess)
    expect(card).not.toHaveAttribute('href')
  })

  it('placeholder (pageId "") → creating, no request', () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    renderWithClient(<SubpageCard pageId="" />)
    expect(screen.getByTestId('subpage-card')).toHaveTextContent(th.editor.subpage.creating)
    expect(screen.getByTestId('subpage-card')).not.toHaveAttribute('href')
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('loading while the titles request is pending', () => {
    vi.spyOn(globalThis, 'fetch').mockReturnValue(new Promise(() => {}))
    renderWithClient(<SubpageCard pageId={ID} />)
    expect(screen.getByTestId('subpage-card')).toHaveTextContent(th.editor.subpage.loading)
  })
})
