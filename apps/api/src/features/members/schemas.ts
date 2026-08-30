import { z } from 'zod';

// Route-local param schemas for the members module. Request *body* shapes live
// in `packages/shared` (contracts); these coerce params/query that belong to
// the router. Kept tiny so validation stays at the route boundary.

export const slugParamsSchema = z.object({
  slug: z.string().trim().min(1).max(64),
});

export const memberIdParamsSchema = z.object({
  slug: z.string().trim().min(1).max(64),
  memberId: z.string().cuid(),
});

export const invitationIdParamsSchema = z.object({
  slug: z.string().trim().min(1).max(64),
  invitationId: z.string().cuid(),
});

export const tokenParamsSchema = z.object({
  token: z.string().min(1),
});

export type SlugParams = z.infer<typeof slugParamsSchema>;
export type MemberIdParams = z.infer<typeof memberIdParamsSchema>;
export type InvitationIdParams = z.infer<typeof invitationIdParamsSchema>;
export type TokenParams = z.infer<typeof tokenParamsSchema>;
