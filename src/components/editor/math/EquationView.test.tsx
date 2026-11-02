// M11 S5.7 — EquationView (FR-1501…1506, M11-D29/D30): lazily loaded KaTeX (skeleton → math), HTML + MathML output,
// the error state (⚠ + "สมการไม่ถูกต้อง" + source, never colour alone), the placeholder of an empty equation (no
// KaTeX load), and the editable (button) vs read-only view.
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { th } from '@/i18n/th'
import { loadKatex } from '@/lib/math/load-katex'
import { EquationView } from './EquationView'

vi.mock('@/lib/math/load-katex', async (importOriginal) => {
  const orig = await importOriginal<typeof import('@/lib/math/load-katex')>()
  return { ...orig, loadKatex: vi.fn(orig.loadKatex) }
})

const E = th.editor.equation
const VALID = String.raw`\int_0^1 x^2\,dx = \frac{1}{3}`

describe('EquationView', () => {
  beforeEach(() => vi.mocked(loadKatex).mockClear())

  it('valid LaTeX: a sized skeleton while KaTeX loads, then display math with MathML', async () => {
    render(<EquationView latex={VALID} display testId="equation" />)
    const el = screen.getByTestId('equation')
    expect(el).toHaveAttribute('data-state', 'loading')
    expect(screen.getByRole('status', { name: E.loading })).toBeInTheDocument()
    await waitFor(() => expect(el).toHaveAttribute('data-state', 'ok'))
    expect(el.querySelector('math')).not.toBeNull() // screen readers read the MathML
    expect(el.querySelector('.katex-display')).not.toBeNull()
    expect(loadKatex).toHaveBeenCalled()
  })

  it('inline: no display wrapper; renders synchronously once KaTeX is loaded', () => {
    render(<EquationView latex="E=mc^2" display={false} testId="inline-equation" />)
    const el = screen.getByTestId('inline-equation')
    expect(el.tagName).toBe('SPAN')
    expect(el).toHaveAttribute('data-state', 'ok')
    expect(el.querySelector('.katex-display')).toBeNull()
  })

  it('invalid LaTeX: ⚠ + "สมการไม่ถูกต้อง" + the source in monospace (AC-1503)', () => {
    render(<EquationView latex={String.raw`\frac{1}{`} display testId="equation" />)
    const el = screen.getByTestId('equation')
    expect(el).toHaveAttribute('data-state', 'error')
    expect(el).toHaveTextContent(E.invalid)
    expect(el.querySelector('code')).toHaveTextContent(String.raw`\frac{1}{`)
    expect(el.querySelector('svg[aria-hidden="true"]')).not.toBeNull() // the ⚠ icon next to the text
    expect(el.querySelector('math')).toBeNull()
  })

  it('empty: the placeholder and no KaTeX load (pages without equations never fetch it)', () => {
    render(<EquationView latex="" display testId="equation" />)
    expect(screen.getByTestId('equation')).toHaveTextContent(E.placeholder)
    expect(screen.getByTestId('equation')).toHaveAttribute('data-state', 'empty')
    expect(loadKatex).not.toHaveBeenCalled()
  })

  it('editable: a button (click / Enter / Space open the editor); read-only: not a button', () => {
    const onOpen = vi.fn()
    const { unmount } = render(<EquationView latex="x" display={false} testId="inline-equation" onOpen={onOpen} />)
    const btn = screen.getByRole('button', { name: `${E.label}: x` })
    fireEvent.click(btn)
    fireEvent.keyDown(btn, { key: 'Enter', code: 'Enter' })
    fireEvent.keyDown(btn, { key: ' ', code: 'Space' })
    expect(onOpen).toHaveBeenCalledTimes(3)
    expect(onOpen).toHaveBeenLastCalledWith(btn)
    unmount()
    render(<EquationView latex="x" display={false} testId="inline-equation" />)
    expect(screen.queryByRole('button')).toBeNull()
  })

  it('trust: false — \\href renders no link', () => {
    render(<EquationView latex={String.raw`\href{javascript:alert(1)}{x}`} display={false} testId="inline-equation" />)
    expect(screen.getByTestId('inline-equation').querySelector('a')).toBeNull()
  })
})
