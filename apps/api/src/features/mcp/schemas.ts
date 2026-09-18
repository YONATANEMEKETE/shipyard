import { z } from 'zod';
import {
  jsonRpcNotificationSchema,
  jsonRpcRequestSchema,
  mcpRequestMetaSchema,
} from '@shipyard/shared';

/**
 * Route-local param/query schemas for the MCP module. Request *body* shapes
 * live in `packages/shared` (contracts); these coerce params/query that belong
 * to the router. Kept tiny so validation stays at the route boundary.
 *
 * Token-id params validate as cuid because `McpToken.id` is `@default(cuid())`
 * — a malformed id is a 400 at the edge, never a wasted query.
 *
 * The second half of this file is the transport's envelope: the JSON-RPC
 * contracts from `@shipyard/shared` narrowed by what the protocol requires of a
 * `POST /mcp` body — `params._meta` is **mandatory**, and it is the only place
 * the protocol version travels (§5.1, §8.1).
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

// ── `/mcp` envelopes ──

// `params._meta` is required on every message, notifications included: the
// version travels there, and a message that does not say which revision it was
// written against cannot be answered honestly. Method-specific params (a tool
// name, tool arguments) ride alongside it, which is why the object is loose.
const withRequiredMeta = {
  params: z.object({ _meta: mcpRequestMetaSchema }).catchall(z.unknown()),
};

/** A call: has an `id`, so it gets exactly one response. */
export const mcpRequestEnvelopeSchema =
  jsonRpcRequestSchema.extend(withRequiredMeta);

export type McpRequestEnvelope = z.infer<typeof mcpRequestEnvelopeSchema>;

/** A notification: no `id`, answered with 202 and an empty body. */
export const mcpNotificationEnvelopeSchema =
  jsonRpcNotificationSchema.extend(withRequiredMeta);

export type McpNotificationEnvelope = z.infer<
  typeof mcpNotificationEnvelopeSchema
>;
