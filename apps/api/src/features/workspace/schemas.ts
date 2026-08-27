import { z } from 'zod';

// Route-local param/query schemas for the workspace module. Request/response
// *body* shapes live in `packages/shared` (contracts); these only coerce the
// Express route params / query that belong to this router.

/** `:slug` param shared by every item endpoint (items are addressed by slug). */
export const slugParamsSchema = z.object({
  slug: z.string().trim().min(1).max(64),
});

export type SlugParams = z.infer<typeof slugParamsSchema>;
