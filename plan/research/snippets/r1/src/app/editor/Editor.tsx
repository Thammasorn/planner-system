'use client'
import '@blocknote/core/fonts/inter.css'
import '@blocknote/mantine/style.css'
import { MantineProvider } from '@mantine/core'
import { useCreateBlockNote } from '@blocknote/react'
import { BlockNoteView } from '@blocknote/mantine'

export default function Editor({ nonce }: { nonce: string | undefined }) {
  const editor = useCreateBlockNote({
    initialContent: [{ type: 'paragraph', content: 'สวัสดี BlockNote' }],
    ...(nonce ? { _tiptapOptions: { injectNonce: nonce } } : {}),
  })
  return (
    <MantineProvider withCssVariables={false} getRootElement={() => undefined} {...(nonce ? { getStyleNonce: () => nonce } : {})}>
      <BlockNoteView editor={editor} theme="light" />
    </MantineProvider>
  )
}
