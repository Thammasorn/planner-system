import {
  QueryClient,
  defaultShouldDehydrateQuery,
  environmentManager,
} from '@tanstack/react-query'

// Per TanStack docs (Advanced SSR, v5.104): a NEW client per server request, a singleton in the browser.
// NOTE: `isServer` (boolean) is deprecated in 5.104 -> use environmentManager.isServer() (a function).
export function makeQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 60 * 1000, // avoid immediate client refetch after hydration
        refetchOnWindowFocus: false, // grid: we refetch explicitly after mutations
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

export function getQueryClient(): QueryClient {
  if (environmentManager.isServer()) return makeQueryClient()
  browserQueryClient ??= makeQueryClient()
  return browserQueryClient
}
