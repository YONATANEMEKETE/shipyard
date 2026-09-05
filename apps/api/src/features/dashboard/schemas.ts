import { z } from 'zod';

// Dashboard is a single composed GET with no body and no query params in
// MVP (api-design §1/§2) — the only input is the :slug path param. Fixed
// panel bounds are locked product decisions enforced server-side (§5.1);
// params would advertise configurability that doesn't exist (spec §6).

export const slugParamsSchema = z.object({
  slug: z.string().trim().min(1).max(64),
});

export type DashboardSlugParams = z.infer<typeof slugParamsSchema>;
