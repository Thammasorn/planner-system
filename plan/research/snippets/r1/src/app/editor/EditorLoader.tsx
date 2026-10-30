'use client'
import dynamic from 'next/dynamic'
const Editor = dynamic(() => import('./Editor'), { ssr: false })
export function EditorLoader({ nonce }: { nonce: string | undefined }) {
  return <Editor nonce={nonce} />
}
