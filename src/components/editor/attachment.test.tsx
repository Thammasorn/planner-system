// S2.3 — attachment card (FR-527): name + size + download link, uploading and empty states.
import { act, fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { th } from '@/i18n/th'
import { uploadStore } from '@/lib/editor/upload'
import { AttachmentCard } from './blocks/attachment'

const URL_ = '/api/files/2c8f1a3b-4d5e-4f60-9b0c-1d2e3f4a5b62'

describe('AttachmentCard', () => {
  it('shows 📎 name, size and a download link', () => {
    render(<AttachmentCard blockId="b1" url={URL_} name="สัญญา.pdf" size={123_456} caption="ฉบับลงนาม" />)
    const link = screen.getByRole('link', { name: th.editor.attachment.download('สัญญา.pdf') })
    expect(link).toHaveAttribute('href', URL_)
    expect(link).toHaveAttribute('download', 'สัญญา.pdf')
    expect(link).toHaveTextContent('สัญญา.pdf')
    expect(screen.getByTestId('att-size')).toHaveTextContent('120.6 KB')
    expect(screen.getByTestId('att-card')).toHaveTextContent('ฉบับลงนาม')
  })

  it('shows the uploading state from the upload store', () => {
    render(<AttachmentCard blockId="b2" url="" name="a.pdf" size={0} caption="" />)
    expect(screen.getByTestId('att-empty')).toBeInTheDocument()
    act(() => uploadStore.set('b2', true))
    expect(screen.getByTestId('att-uploading')).toHaveTextContent(th.editor.attachment.uploading)
    act(() => uploadStore.set('b2', false))
    expect(screen.queryByTestId('att-uploading')).toBeNull()
  })

  it('empty block opens the upload panel on click', () => {
    const onPick = vi.fn()
    render(<AttachmentCard blockId="b3" url="" name="" size={0} caption="" onPick={onPick} />)
    const empty = screen.getByTestId('att-empty')
    expect(empty).toHaveTextContent(th.editor.blocknote.file_blocks.add_button_text.file)
    fireEvent.click(empty)
    expect(onPick).toHaveBeenCalledOnce()
  })
})
