import { QueryClient, defaultShouldDehydrateQuery, environmentManager } from '@tanstack/react-query'

/** PLAN.md §3.5 defaults. A new client per server request, a singleton in the browser (TanStack Advanced SSR). */
export function makeQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 60_000, // no immediate client refetch after hydration
        refetchOnWindowFocus: true,
        retry: 1,
      },
      dehydrate: {
        // include pending queries so a server component can stream a prefetch
        shouldDehydrateQuery: (query) =>
          defaultShouldDehydrateQuery(query) || query.state.status === 'pending',
        shouldRedactErrors: () => false, // Next.js redacts server errors itself
      },
    },
  })
}

let browserQueryClient: QueryClient | undefined

/** Never `useState(() => new QueryClient())` in a provider: React may discard that state on suspend (r4 fact 8). */
export function getQueryClient(): QueryClient {
  if (environmentManager.isServer()) return makeQueryClient()
  browserQueryClient ??= makeQueryClient()
  return browserQueryClient
}
