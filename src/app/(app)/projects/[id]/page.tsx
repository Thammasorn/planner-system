import { redirect } from 'next/navigation'
import { projectTabHref } from '@/components/projects/project-tabs'

/** `/projects/[id]` → the ภาพรวม tab (M2-D10). The layout above has already answered 404 for invisible ids. */
export default async function ProjectIndexPage(props: PageProps<'/projects/[id]'>) {
  const { id } = await props.params
  redirect(projectTabHref(id, 'overview'))
}
