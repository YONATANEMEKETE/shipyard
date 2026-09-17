import { z } from 'zod';

/**
 * Route-local param/query schemas for the MCP module. Request *body* shapes
 * live in `packages/shared` (contracts); these coerce params/query that belong
 * to the router. Kept tiny so validation stays at the route boundary.
 *
 * Token-id params validate as cuid because `McpToken.id` is `@default(cuid())`
 * — a malformed id is a 400 at the edge, never a wasted query.
 */

export const slugParamsSchema = z.object({
  slug: z.string().trim().min(1).max(64),
});

export const tokenIdParamsSchema = z.object({
  slug: z.string().trim().min(1).max(64),
  tokenId: z.string().cuid(),
});

export type SlugParams = z.infer<typeof slugParamsSchema>;
export type TokenIdParams = z.infer<typeof tokenIdParamsSchema>;
