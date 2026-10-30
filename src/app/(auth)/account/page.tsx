import { redirect } from 'next/navigation'

/** `/account` is the password page (M1-D21). */
export default function AccountPage(): never {
  redirect('/account/password')
}
