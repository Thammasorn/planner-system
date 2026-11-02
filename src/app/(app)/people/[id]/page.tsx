import { redirect } from 'next/navigation'
import { personTabHref } from '@/components/people/people-tabs'

/** `/people/[id]` → the แผนงาน tab, search params kept (M9-D14). The layout has already answered 404 for invisible ids. */
export default async function PersonIndexPage(props: PageProps<'/people/[id]'>) {
  const [{ id }, sp] = await Promise.all([props.params, props.searchParams])
  const qs = new URLSearchParams()
  for (const [k, v] of Object.entries(sp)) {
    if (typeof v === 'string') qs.set(k, v)
    else if (Array.isArray(v)) for (const x of v) qs.append(k, x)
  }
  const query = qs.toString()
  redirect(`${personTabHref(id, 'plan')}${query ? `?${query}` : ''}`)
}
