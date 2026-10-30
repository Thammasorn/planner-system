// Server Component: optional prefetch of the first grid window, streamed to the client cache.
import { HydrationBoundary, dehydrate, noop } from '@tanstack/react-query'
import { cache } from 'react'
import { makeQueryClient } from '@/lib/query-client'

const getServerQueryClient = cache(makeQueryClient) // one QueryClient per request

declare function loadGridWindow(projectId: string, from: string, to: string): Promise<{ periods: unknown[] }>
declare function GridClient(props: { projectId: string }): React.ReactNode

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const qc = getServerQueryClient()
  // Call the service directly (NOT fetch('/api/grid/...')) — same data function the route handler uses.
  // Not awaited: pending queries are dehydrated too (see shouldDehydrateQuery) and resolve on the client.
  void qc
    .query({ queryKey: ['grid', 'project', id, { from: '2026-09-28', expand: [] }], queryFn: () => loadGridWindow(id, '2026-09-28', '2026-11-23') })
    .catch(noop)
  return (
    <HydrationBoundary state={dehydrate(qc)}>
      <GridClient projectId={id} />
    </HydrationBoundary>
  )
}
