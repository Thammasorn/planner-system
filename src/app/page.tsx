import { redirect } from 'next/navigation'

/** `/` → `/home` (X32; 307). */
export default function RootPage(): never {
  redirect('/home')
}
