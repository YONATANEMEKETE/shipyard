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
      {
        // The MCP protocol endpoint (F13). Its own rule rather than a path
        // under `/api/v1` because it is not a REST surface: one POST carrying
        // JSON-RPC, its own transport headers (`MCP-Protocol-Version`,
        // `Mcp-Method`, `Mcp-Name`) and its own JSON-RPC error shape. Next
        // forwards the request — method, headers and body — untouched, so the
        // API sees exactly what the client sent (ADR-005).
        source: '/mcp',
        destination: `${apiUrl}/mcp`,
      },
    ];
  },
};

export default nextConfig;
