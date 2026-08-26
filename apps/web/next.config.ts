import type { NextConfig } from 'next';

// Internal API server the auth routes proxy to. Server-side only — never
// exposed to the browser (that's what NEXT_PUBLIC_* would do).
const apiUrl = process.env.API_URL ?? 'http://localhost:4000';

const nextConfig: NextConfig = {
  transpilePackages: ['@shipyard/shared'],
  async rewrites() {
    return [
      {
        // Better Auth lives on the web origin (/api/v1/auth) so session
        // cookies are first-party; requests are forwarded to the
        // internal-only API server.
        source: '/api/v1/auth/:path*',
        destination: `${apiUrl}/api/v1/auth/:path*`,
      },
    ];
  },
};

export default nextConfig;
