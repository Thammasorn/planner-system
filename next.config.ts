import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  output: 'standalone',
  poweredByHeader: false,
  reactStrictMode: true,
  agentRules: false, // never let `next dev` write AGENTS.md / CLAUDE.md (PLAN.md §1.3, R17)
  outputFileTracingRoot: __dirname,
  experimental: { serverActions: { bodySizeLimit: '4mb' } },
  // no images.remotePatterns, no cacheComponents, no 'use cache' (PLAN.md §3.3)
}

export default nextConfig
