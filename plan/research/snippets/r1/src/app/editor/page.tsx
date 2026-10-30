import { headers } from 'next/headers'
import { EditorLoader } from './EditorLoader'
export default async function EditorPage() {
  const nonce = (await headers()).get('x-nonce') ?? undefined
  return <main><h1>เอกสาร</h1><EditorLoader nonce={nonce} /></main>
}
