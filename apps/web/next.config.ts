import type { NextConfig } from 'next';

// Internal API server the auth routes proxy to. Server-side only — never
// exposed to the browser (that's what NEXT_PUBLIC_* would do).
const apiUrl = process.env.API_URL ?? 'http://localhost:4000';

const nextConfig: NextConfig = {
  transpilePackages: ['@shipyard/shared'],
  async rewrites() {
    return [
      {
        // Every API call is first-party: the browser only ever talks to the
        // web origin, and Next forwards the whole `/api/v1/*` surface to the
        // internal-only API server (ADR-003). One catch-all instead of a rule
        // per feature module — the API is the single owner of the path space
        // under /api/v1, so there is nothing here for the web app to shadow.
        //
        // Session cookies stay first-party (Better Auth lives on
        // `/api/v1/auth` from the browser's point of view), and Caddy still
        // exposes only web:3000, so the API host is never reachable directly.
        source: '/api/v1/:path*',
        destination: `${apiUrl}/api/v1/:path*`,
      },
    ];
  },
};

export default nextConfig;
