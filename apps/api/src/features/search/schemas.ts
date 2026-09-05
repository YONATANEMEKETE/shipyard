import { z } from 'zod';
import { searchTypeSchema } from '@shipyard/shared';

/**
 * Route-local wire coercion for the search module (api-design §1/§5.1). The
 * canonical domain contract lives in `packages/shared/src/search`; this file
 * handles the query-string split that cannot be expressed there:
 *
 * - Missing `q` key ⇒ 400 VALIDATION_ERROR (required parameter).
 * - Present-but-blank `q` (`?q=%20%20`) ⇒ passes as `''` — the service turns
 *   it into a 200 with empty groups (spec rule 4: never an error, never a
 *   dump). The shared schema's `min(1)` therefore lives one layer down;
 *   this preprocessor trims BEFORE the length check so `q` > 200 after trim
 *   is still rejected at the edge (F5 precedent).
 * - `limit` bounds each group, not the total; defaults resolved in the
 *   service (20, or 50 when `type` is set — data-model D8).
 */
export const searchQuerySchema = z.object({
  q: z.preprocess(
    (value: unknown) => (typeof value === 'string' ? value.trim() : value),
    z.string().max(200, 'Keep the search under 200 characters'),
  ),
  type: searchTypeSchema.optional(),
  limit: z.coerce.number().int().min(1).max(50).optional(),
});

export type SearchQueryParams = z.infer<typeof searchQuerySchema>;
