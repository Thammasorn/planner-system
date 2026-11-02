import { fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { describe, expect, it } from 'vitest'
import {
  PaletteProjectScope,
  PaletteProjectScopeProvider,
  usePaletteProjectScope,
  usePaletteScope,
  type PaletteScopeProject,
} from './project-scope'

const POS: PaletteScopeProject = { id: 'p-pos', name: 'POS Upgrade', archived: false }
const CRM: PaletteScopeProject = { id: 'p-crm', name: 'CRM Migration', archived: true }

function Show() {
  const s = usePaletteScope()
  return <output data-testid="scope">{s ? `${s.id}:${s.name}:${String(s.archived)}` : 'none'}</output>
}

function Register({ project }: { project: PaletteScopeProject | null }) {
  usePaletteProjectScope(project)
  return null
}

function Harness({ outer }: { outer: boolean }) {
  const [inner, setInner] = useState(false)
  return (
    <PaletteProjectScopeProvider>
      {outer ? <PaletteProjectScope project={POS} /> : null}
      {inner ? <Register project={CRM} /> : null}
      <button type="button" onClick={() => setInner((v) => !v)}>
        inner
      </button>
      <Show />
    </PaletteProjectScopeProvider>
  )
}

const scope = () => screen.getByTestId('scope').textContent

describe('palette project scope (M10-D24)', () => {
  it('no registration → null; outside a provider → null and registering is a no-op', () => {
    render(
      <>
        <Register project={POS} />
        <Show />
      </>,
    )
    expect(scope()).toBe('none')
  })

  it('a registered project is the scope; a later (inner) one wins; unmounting restores the outer one', () => {
    const { rerender } = render(<Harness outer />)
    expect(scope()).toBe('p-pos:POS Upgrade:false')
    fireEvent.click(screen.getByRole('button', { name: 'inner' }))
    expect(scope()).toBe('p-crm:CRM Migration:true')
    fireEvent.click(screen.getByRole('button', { name: 'inner' }))
    expect(scope()).toBe('p-pos:POS Upgrade:false')
    rerender(<Harness outer={false} />)
    expect(scope()).toBe('none')
  })

  it('null registers nothing (a wiki page)', () => {
    render(
      <PaletteProjectScopeProvider>
        <Register project={null} />
        <Show />
      </PaletteProjectScopeProvider>,
    )
    expect(scope()).toBe('none')
  })

  it('a changed project (rename) updates the scope in place', () => {
    function Rename({ name }: { name: string }) {
      return (
        <PaletteProjectScopeProvider>
          <Register project={{ ...POS, name }} />
          <Show />
        </PaletteProjectScopeProvider>
      )
    }
    const { rerender } = render(<Rename name="POS" />)
    expect(scope()).toBe('p-pos:POS:false')
    rerender(<Rename name="POS 2" />)
    expect(scope()).toBe('p-pos:POS 2:false')
  })
})
