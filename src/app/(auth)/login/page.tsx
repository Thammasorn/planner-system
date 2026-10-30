import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { LoginForm } from '@/components/account/LoginForm'
import { th } from '@/i18n/th'
import { firstParam, safeNext } from '@/lib/safe-next'
import { getSessionUser } from '@/server/session'

export const metadata: Metadata = { title: th.auth.loginTitle }

/** FR-101 / AC-101 / X32: email + password only — there is no sign-up page or link anywhere. */
export default async function LoginPage(props: PageProps<'/login'>) {
  const { next } = await props.searchParams
  const target = safeNext(firstParam(next))
  const user = await getSessionUser()
  if (user) redirect(user.mustChangePassword ? '/account/password' : target)
  return <LoginForm next={target} />
}
