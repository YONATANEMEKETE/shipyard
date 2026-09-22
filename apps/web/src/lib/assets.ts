/**
 * Marketing media lives in the public R2 bucket, not in `public/`.
 *
 * The hero video alone is 12 MB, and every byte served from the deployment
 * counts against Vercel's transfer allowance; R2 charges no egress and its
 * custom domain is cached at Cloudflare's edge (ADR-007 stack). The same
 * bucket also holds the email logo and user avatars.
 *
 * Keys are stable, so objects are served `immutable`: replacing a file means
 * uploading a new key and changing it here, never a silent swap under an old
 * one. The base is a constant rather than an env var because the assets are
 * identical in every environment.
 */
export const ASSET_BASE_URL = 'https://assets.yonatanem.com';

export function marketingAsset(file: string): string {
  return `${ASSET_BASE_URL}/marketing/${file}`;
}
