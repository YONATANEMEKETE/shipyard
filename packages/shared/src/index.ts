import { z } from 'zod';

export const SHIPYARD_NAME = 'Shipyard';

export const healthResponseSchema = z.object({
  service: z.string(),
  status: z.literal('ok'),
});

export type HealthResponse = z.infer<typeof healthResponseSchema>;

export const readinessResponseSchema = z.object({
  service: z.string(),
  status: z.enum(['ready', 'not_ready']),
});

export type ReadinessResponse = z.infer<typeof readinessResponseSchema>;

export * from './api/response.js';
export * from './auth/index.js';
export * from './workspace/index.js';
export * from './members/index.js';
export * from './projects/index.js';
export * from './issues/index.js';
export * from './cycles/index.js';
export * from './comments/index.js';
export * from './notifications/index.js';
export * from './activity/index.js';
export * from './dashboard/index.js';
