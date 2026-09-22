import type { NextConfig } from 'next';

// The web app calls the API on its own origin (NEXT_PUBLIC_API_URL) — nothing
// is proxied from this app. See src/lib/api/request.ts and src/lib/auth-client.ts.
const nextConfig: NextConfig = {
  transpilePackages: ['@shipyard/shared'],
};

export default nextConfig;
