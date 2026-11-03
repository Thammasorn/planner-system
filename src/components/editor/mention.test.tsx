// S2.3 — mention chips (FR-529, M4-D20/D32): live user names (deactivated, unknown), page titles without leaks.
import { fireEvent, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { th } from '@/i18n/th'
import type { PageTitlesResponse } from '@/lib/contracts/pages'
import type { PeopleOptionsResponse, PersonOption } from '@/lib/contracts/people'
import { qk } from '@/lib/query-keys'
import { PageChip, UserChip } from './inline/mention'
import { makeTestQueryClient, renderWithClient } from './render.test.helper'

const push = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }))

const PAGE = '0c4d6a0e-7f3b-4c2a-9d1e-5b6a7c8d9e01'
const person = (p: Partial<PersonOption> & { id: string; name: string }): PersonOption => ({
  nickname: null,
  positionId: null,
  positionName: null,
  color: null,
  active: true,
  ...p,
})

function withPeople(people: PersonOption[]) {
  const qc = makeTestQueryClient()
  qc.setQueryData<PeopleOptionsResponse>(qk.peopleOptions(), { people })
  return qc
}
function withTitles(res: PageTitlesResponse) {
  const qc = makeTestQueryClient()
  qc.setQueryData(qk.pageTitles([PAGE]), res)
  return qc
}

describe('UserChip', () => {
  beforeEach(() => push.mockClear())

  it('shows @displayName (nickname first)', () => {
    renderWithClient(
      <UserChip id="u1" />,
      withPeople([person({ id: 'u1', name: 'Cinderella S.', nickname: 'Cindy' })]),
    )
    expect(screen.getByTestId('mention-user')).toHaveTextContent('@Cindy')
  })

  it('deactivated users keep their name plus the deactivated marker', () => {
    renderWithClient(<UserChip id="u2" />, withPeople([person({ id: 'u2', name: 'Ivy', active: false })]))
    expect(screen.getByTestId('mention-user')).toHaveTextContent(`@Ivy ${th.editor.mention.deactivated}`)
  })

  it('unknown ids → unknown user', () => {
    renderWithClient(<UserChip id="zz" />, withPeople([]))
    expect(screen.getByTestId('mention-user')).toHaveTextContent(`@${th.editor.mention.unknownUser}`)
  })
})

describe('PageChip', () => {
  beforeEach(() => push.mockClear())

  it('ok → title link, in-app navigation', () => {
    renderWithClient(
      <PageChip id={PAGE} />,
      withTitles({ items: [{ id: PAGE, visible: true, deleted: false, title: 'คู่มือทีม', icon: null }] }),
    )
    const chip = screen.getByTestId('mention-page')
    expect(chip).toHaveTextContent('คู่มือทีม')
    expect(chip).toHaveAttribute('href', `/p/${PAGE}`)
    fireEvent.click(chip)
    expect(push).toHaveBeenCalledWith(`/p/${PAGE}`)
  })

  it('not visible → no-access text, no link', () => {
    renderWithClient(<PageChip id={PAGE} />, withTitles({ items: [{ id: PAGE, visible: false }] }))
    const chip = screen.getByTestId('mention-page')
    expect(chip).toHaveTextContent(th.editor.mention.noAccess)
    expect(chip).not.toHaveAttribute('href')
    fireEvent.click(chip)
    expect(push).not.toHaveBeenCalled()
  })

  it('deleted → deleted text, no link', () => {
    renderWithClient(
      <PageChip id={PAGE} />,
      withTitles({ items: [{ id: PAGE, visible: true, deleted: true }] }),
    )
    expect(screen.getByTestId('mention-page')).toHaveTextContent(th.editor.mention.deletedPage)
    expect(screen.getByTestId('mention-page')).not.toHaveAttribute('href')
  })
})
